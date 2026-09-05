import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { relative, extname, dirname, join } from "node:path";
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync, lstatSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import { validateProjectPath } from "../utils/safe-path.js";
import { listDirectory, formatSize } from "../utils/dir-listing.js";

export const PROJECT_TEXT_EXTENSIONS = new Set([
  ".c", ".et", ".conf", ".gproj", ".ent", ".layer", ".st", ".layout",
  ".txt", ".json", ".xml", ".csv", ".md", ".meta", ".emat",
  ".acp", ".ptc", ".pap", ".siga", ".agr", ".ast", ".agf", ".asi", ".aw",
]);
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512_000;
const hash = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");

export const projectSchema = {
  action: z.enum(["browse", "read", "search", "write", "edit"]),
  path: z.string().optional().describe("Relative file or directory inside projectPath; required for read/write/edit."),
  projectPath: z.string().optional().describe("Absolute intended project root. Configured root is used if omitted, not necessarily the live addon."),
  pattern: z.string().optional().describe("browse/search extension filter, e.g. '*.c'."),
  content: z.string().max(MAX_FILE_BYTES).optional().describe("write: complete UTF-8 file content."),
  createDirectories: z.boolean().default(true),
  startLine: z.number().int().min(1).optional().describe("read: first line, 1-based; enables bounded reads of large files."),
  maxLines: z.number().int().min(1).max(2000).optional().describe("read: maximum lines; defaults to 200 with startLine."),
  query: z.string().min(1).max(1000).optional().describe("search: literal text, not a regular expression."),
  caseSensitive: z.boolean().default(false),
  maxResults: z.number().int().min(1).max(200).default(50),
  oldText: z.string().min(1).max(MAX_FILE_BYTES).optional().describe("edit: exact text to replace; requires exactly expectedMatches occurrences."),
  newText: z.string().max(MAX_FILE_BYTES).optional().describe("edit: replacement, which may be empty."),
  expectedMatches: z.number().int().min(1).max(10000).default(1),
  expectedSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional().describe("write/edit: refuse if existing content differs from this read-time hash."),
  expectedMissing: z.boolean().default(false).describe("write: refuse if the destination already exists."),
  dryRun: z.boolean().default(false).describe("write/edit: validate and report without writing."),
};
type ProjectInput = z.infer<z.ZodObject<typeof projectSchema>>;

// Descendant junctions must not redirect edits into another addon. The
// explicitly selected root may itself be a junction.
export function projectFile(root: string, path: string): string {
  const full = validateProjectPath(root, path);
  let current = root;
  for (const segment of relative(root, full).split(/[/\\]+/).filter(Boolean)) {
    if (segment.includes(":")) throw new Error("Alternate data streams are not project files.");
    current = join(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error("Cannot traverse a symlink/junction. Select its intended project root explicitly.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return full;
}

function readText(full: string): string {
  if (!PROJECT_TEXT_EXTENSIONS.has(extname(full).toLowerCase())) throw new Error("Binary or unsupported file type. Use resource/asset tools for binary files.");
  const stat = statSync(full);
  if (!stat.isFile()) throw new Error("Expected a file.");
  if (stat.size > MAX_FILE_BYTES) throw new Error("File exceeds the 16 MiB source-file limit.");
  const bytes = readFileSync(full);
  if (bytes.includes(0)) throw new Error("Binary or UTF-16 content is not supported by UTF-8 project editing.");
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

export function runProjectTool(input: ProjectInput, config: Config) {
  const base = input.projectPath || config.projectPath;
  try {
    if (!base) throw new Error("Provide projectPath or configure ENFUSION_PROJECT_PATH.");
    if (["read", "write", "edit"].includes(input.action) && !input.path) throw new Error(`action='${input.action}' requires a 'path' parameter.`);
    const full = projectFile(base, input.path ?? "");
    const reply = (text: string, data: Record<string, unknown>) => ({
      content: [{ type: "text" as const, text }],
      structuredContent: { projectPath: base, path: input.path ?? ".", ...data },
      isError: false,
    });
    if (input.action === "browse") {
      const entries = listDirectory(full, input.pattern);
      return reply([`Project: ${base}`, `Path: ${input.path || "(root)"}`, ...entries.map((entry) =>
        entry.isDirectory ? `  ${entry.name}/` : `  ${entry.name} ${formatSize(entry.size)}`)].join("\n"), { entries });
    }
    if (input.action === "read") {
      const content = readText(full);
      const lines = content.split(/\r\n|\n|\r/);
      const startLine = input.startLine ?? 1;
      const ranged = input.startLine !== undefined || input.maxLines !== undefined;
      if (startLine > lines.length) throw new Error(`startLine exceeds the file's ${lines.length} lines.`);
      const endLine = ranged ? Math.min(lines.length, startLine - 1 + (input.maxLines ?? 200)) : lines.length;
      const text = ranged ? lines.slice(startLine - 1, endLine).map((line, index) => `${startLine + index}: ${line}`).join("\n") : content;
      if (Buffer.byteLength(text, "utf8") > MAX_OUTPUT_BYTES) throw new Error("Read exceeds the 512 KB output limit. Use startLine and a smaller maxLines.");
      return reply(text, { sha256: hash(content), totalLines: lines.length, startLine, endLine,
        nextLine: endLine < lines.length ? endLine + 1 : null, partial: ranged && (startLine > 1 || endLine < lines.length) });
    }
    if (input.action === "search") {
      if (!input.query) throw new Error("search requires query.");
      if (input.pattern && !/^\*?\.[A-Za-z0-9]+$/.test(input.pattern)) throw new Error("pattern must be an extension filter such as '*.c'.");
      const extension = input.pattern?.replace(/^\*/, "").toLowerCase();
      const needle = input.caseSensitive ? input.query : input.query.toLowerCase();
      const matches: Array<{ path: string; line: number; text: string; textTruncated: boolean }> = [];
      const skipped: Array<{ path: string; reason: string }> = [];
      let filesScanned = 0, entriesVisited = 0, bytesScanned = 0;
      let stopReason: string | null = null;
      const visit = (directory: string, depth: number) => {
        if (depth > 64) { stopReason = "directory_depth"; return; }
        for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (stopReason) return;
          if (++entriesVisited > 10_000) { stopReason = "entry_budget"; return; }
          if ([".git", "node_modules"].includes(entry.name)) continue;
          const path = join(directory, entry.name);
          if (entry.isSymbolicLink()) { skipped.push({ path: relative(base, path), reason: "symlink/junction" }); continue; }
          if (entry.isDirectory()) { visit(path, depth + 1); continue; }
          if (!entry.isFile() || !PROJECT_TEXT_EXTENSIONS.has(extname(path).toLowerCase())) continue;
          if (extension && extname(path).toLowerCase() !== extension) continue;
          if (filesScanned >= 2000) { stopReason = "file_budget"; return; }
          try {
            const size = statSync(path).size;
            if (size > MAX_FILE_BYTES) { skipped.push({ path: relative(base, path), reason: "file_size" }); continue; }
            if (bytesScanned + size > 32 * 1024 * 1024) { stopReason = "byte_budget"; return; }
            const content = readText(path);
            filesScanned++;
            bytesScanned += size;
            for (const [index, line] of content.split(/\r\n|\n|\r/).entries()) {
              if (!(input.caseSensitive ? line : line.toLowerCase()).includes(needle)) continue;
              matches.push({ path: relative(base, path), line: index + 1, text: line.slice(0, 1000), textTruncated: line.length > 1000 });
              if (matches.length >= input.maxResults) { stopReason = "result_limit"; return; }
            }
          } catch (error) { skipped.push({ path: relative(base, path), reason: String(error) }); }
        }
      };
      visit(full, 0);
      const data = { matches, filesScanned, bytesScanned, partial: stopReason !== null || skipped.length > 0, stopReason, skipped: skipped.slice(0, 100), skippedCount: skipped.length };
      return reply(JSON.stringify(data), data);
    }
    if (!PROJECT_TEXT_EXTENSIONS.has(extname(full).toLowerCase())) throw new Error("Only supported UTF-8 source files can be written or edited.");
    const before = existsSync(full) ? readText(full) : null;
    if (input.expectedSha256 && (before === null || hash(before) !== input.expectedSha256.toLowerCase())) throw new Error("File changed since the supplied SHA-256. Read it again before editing.");
    let after: string;
    let replacements = 0;
    if (input.action === "write") {
      if (input.content === undefined) throw new Error("write requires content.");
      after = input.content;
    } else {
      if (before === null) throw new Error("edit requires an existing file.");
      if (!input.oldText || input.newText === undefined) throw new Error("edit requires oldText and newText.");
      const parts = before.split(input.oldText);
      replacements = parts.length - 1;
      if (replacements !== input.expectedMatches) throw new Error(`Expected ${input.expectedMatches} exact matches, found ${replacements}. No file was changed.`);
      after = parts.join(input.newText);
    }
    if (after.includes("\0") || Buffer.byteLength(after, "utf8") > MAX_FILE_BYTES) throw new Error("Content must be text and no larger than 16 MiB.");
    if (input.expectedMissing && before !== null) throw new Error("CONFLICT: expected a new file, but the destination already exists.");
    if (!input.dryRun) {
      if (input.createDirectories) mkdirSync(dirname(full), { recursive: true });
      const temporary = join(dirname(full), `.enfusion-mcp-${randomUUID()}.tmp`);
      try {
        writeFileSync(temporary, after, { encoding: "utf8", flag: "wx" });
        renameSync(temporary, full);
      } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }
    return reply(`${input.dryRun ? "Preview" : "File written"}: ${input.path} (${Buffer.byteLength(after, "utf8")} bytes)`, {
      written: !input.dryRun, changed: before !== after, replacements,
      beforeSha256: before === null ? null : hash(before), sha256: hash(after),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true,
      structuredContent: { projectPath: base, outcome: "error", message } };
  }
}

export function registerProject(server: McpServer, config: Config): void {
  server.registerTool("project", {
    description: "Browse, read, search, write, or precisely edit Workbench source files, including audio/particle/animation graphs, materials, metadata, scripts, layouts and configs. Reads return SHA-256; startLine/maxLines page large files. Search returns file/line matches with explicit partial-coverage markers. Edit replaces exact oldText only when expectedMatches agrees; expectedSha256 rejects stale edits. dryRun previews writes. Compilation and resource registration remain separate.",
    inputSchema: projectSchema,
  }, async (input) => runProjectTool(input, config));
}
