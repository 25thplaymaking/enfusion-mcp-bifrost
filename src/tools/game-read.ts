import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import type { Config } from "../config.js";
import { validateProjectPath } from "../utils/safe-path.js";
import { PakVirtualFS } from "../pak/vfs.js";
import { resolveGameDataPath } from "../utils/game-paths.js";

/** Formats that are always binary; anything else is sniffed for NUL bytes. */
const BINARY_EXTENSIONS = new Set([
  ".xob", ".edds", ".dds", ".png", ".tga", ".jpg", ".jpeg", ".wav", ".ogg", ".wem", ".fbx",
  ".pak", ".anm", ".navmesh", ".ter", ".dat", ".bin", ".ttf", ".otf", ".fnt", ".tif", ".tiff",
]);

/** Hard ceiling on what is read at all. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/**
 * Ceiling on one response. Sized to stay well under an MCP client's per-result
 * token cap: 19 of 72 recorded game_read failures were whole vanilla files
 * (chimeraInputCommon.conf, SCR_PlacingEditorComponent.c, ...) overflowing it,
 * and agents re-requested the same file up to six times.
 */
export const GAME_READ_MAX_CHARS = 40_000;

export interface GameReadOptions {
  startLine?: number;
  maxLines?: number;
  search?: string;
  context?: number;
}

const numbered = (lines: string[], first: number): string =>
  lines.map((l, i) => `${String(first + i).padStart(5)}  ${l}`).join("\n");

/** Class/enum/method declarations (.c) or top-level blocks (text resources), with line numbers. */
export function outlineOf(path: string, lines: string[]): string[] {
  const out: string[] = [];
  const isScript = extname(path).toLowerCase() === ".c";
  lines.forEach((line, i) => {
    if (isScript) {
      if (/^\s*(modded\s+|sealed\s+)?(class|enum)\s+\w+/.test(line) ||
          (/^(\t| {4})(?=\S)(?!(if|else|for|foreach|while|switch|return|case|delete)\b)[\w<>,[\]\s]+?\b\w+\s*\([^;]*\)?\s*$/.test(line) &&
           !/^\s*\/\//.test(line))) {
        out.push(`${i + 1}: ${line.trim()}`);
      }
    } else if (/^( {0,2}|\t?)[A-Za-z_]\w*(\s+"[^"]*")?(\s*:\s*"[^"]*")?\s*\{\s*$/.test(line)) {
      out.push(`${i + 1}: ${line.trim()}`);
    }
  });
  return out;
}

/** Render the requested view of a text file: search hits, a line range, or the whole file within budget. */
export function formatGameFile(subPath: string, header: string, text: string, opts: GameReadOptions = {}): string {
  const lines = text.split(/\r?\n/);
  const total = lines.length;

  if (opts.search) {
    const needle = opts.search.toLowerCase();
    const ctx = Math.min(Math.max(opts.context ?? 2, 0), 20);
    const hits = lines.flatMap((l, i) => (l.toLowerCase().includes(needle) ? [i] : []));
    if (hits.length === 0) return `${header}\n// ${total} lines — no line contains "${opts.search}".`;
    const parts: string[] = [];
    let used = 0;
    let shown = 0;
    let lastEnd = -1;
    for (const h of hits) {
      const from = Math.max(h - ctx, lastEnd + 1);
      const to = Math.min(h + ctx, total - 1);
      if (from > to) continue;
      const chunk = (from > lastEnd + 1 && parts.length ? "  ...\n" : "") + numbered(lines.slice(from, to + 1), from + 1);
      if (used + chunk.length > GAME_READ_MAX_CHARS) break;
      parts.push(chunk);
      used += chunk.length;
      lastEnd = to;
      shown++;
    }
    const more = shown < hits.length ? `\n\n// ${hits.length - shown} more match(es) not shown — narrow the search or page with startLine.` : "";
    return `${header}\n// ${total} lines — ${hits.length} line(s) contain "${opts.search}"\n\n${parts.join("\n")}${more}`;
  }

  const ranged = opts.startLine !== undefined || opts.maxLines !== undefined;
  if (!ranged && text.length <= GAME_READ_MAX_CHARS) return `${header}\n\n${text}`;

  const start = Math.min(Math.max(opts.startLine ?? 1, 1), total);
  const wanted = Math.min(opts.maxLines ?? total, total - start + 1);
  const slice: string[] = [];
  let used = 0;
  for (let i = start - 1; i < start - 1 + wanted; i++) {
    const cost = lines[i].length + 8;
    if (used + cost > GAME_READ_MAX_CHARS && slice.length > 0) break;
    slice.push(lines[i]);
    used += cost;
  }
  const end = start + slice.length - 1;
  const notes: string[] = [`// lines ${start}-${end} of ${total}`];
  if (end < total) notes.push(`// next: startLine=${end + 1} (or use search="..." to find a symbol)`);
  let outline = "";
  if (!ranged) {
    const o = outlineOf(subPath, lines);
    const budget = 6_000;
    let body = "";
    for (const entry of o) {
      if (body.length + entry.length > budget) { body += "\n..."; break; }
      body += `\n${entry}`;
    }
    if (o.length) outline = `\n\n// OUTLINE (line: declaration) — page to a line with startLine${body}`;
  }
  return `${header}\n${notes.join("\n")}${outline}\n\n${numbered(slice, start)}`;
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Up to five archive paths sharing the requested file name (case-insensitive). */
export function suggestPaths(requested: string, candidates: readonly string[]): string[] {
  const name = basename(requested).toLowerCase();
  const stem = name.replace(/\.[^.]+$/, "");
  const exact = candidates.filter((c) => basename(c).toLowerCase() === name);
  if (exact.length) return exact.slice(0, 5);
  if (stem.length < 4) return [];
  return candidates.filter((c) => basename(c).toLowerCase().includes(stem)).slice(0, 5);
}

export function registerGameRead(server: McpServer, config: Config): void {
  server.registerTool(
    "game_read",
    {
      description:
        "Read a file from the base game data (loose files and .pak archives). Use it to read vanilla .c scripts before " +
        "overriding them, and prefab .et / config .conf / layout files. Large files come back as a first page plus an " +
        "outline of classes and methods with line numbers: page with startLine/maxLines, or pass search to get only the " +
        "matching lines with context. Base-game .meta files are not shipped; use asset_search for a prefab's {GUID}.",
      inputSchema: {
        path: z
          .string()
          .describe("Relative path within the game data (e.g., 'Scripts/Game/Character/SCR_CharacterControllerComponent.c')"),
        startLine: z.number().int().min(1).optional().describe("First line to return (1-based)."),
        maxLines: z.number().int().min(1).max(5000).optional().describe("Number of lines to return from startLine."),
        search: z.string().min(1).max(200).optional()
          .describe("Return only lines containing this text (case-insensitive literal), with context lines."),
        context: z.number().int().min(0).max(20).optional().describe("Context lines around each search hit (default 2)."),
      },
    },
    async ({ path: subPath, startLine, maxLines, search, context }) => {
      const basePath = resolveGameDataPath(config.gamePath);
      if (!basePath) {
        return {
          content: [{ type: "text", text: `Base game not found at ${config.gamePath}. Set ENFUSION_GAME_PATH or ensure Arma Reforger is installed.` }],
          isError: true,
        };
      }
      const opts: GameReadOptions = { startLine, maxLines, search, context };
      const ext = extname(subPath).toLowerCase();

      try {
        const filePath = validateProjectPath(basePath, subPath);

        if (existsSync(filePath)) {
          const stats = statSync(filePath);
          if (stats.isDirectory()) {
            return { content: [{ type: "text", text: `"${subPath}" is a directory. Use game_browse to list its contents.` }] };
          }
          if (BINARY_EXTENSIONS.has(ext)) {
            return { content: [{ type: "text", text: `Binary file: ${subPath} (${ext}, ${stats.size} bytes). Only text resources can be read.` }] };
          }
          if (stats.size > MAX_FILE_BYTES) {
            return { content: [{ type: "text", text: `File too large: ${subPath} (${(stats.size / 1024).toFixed(0)} KB).` }] };
          }
          const buf = readFileSync(filePath);
          if (looksBinary(buf)) {
            return { content: [{ type: "text", text: `Binary file: ${subPath} (${stats.size} bytes). Only text resources can be read.` }] };
          }
          return { content: [{ type: "text", text: formatGameFile(subPath, `// ${subPath}\n// ${stats.size} bytes`, buf.toString("utf-8"), opts) }] };
        }

        const pakVfs = PakVirtualFS.get(config.gamePath);
        if (pakVfs && pakVfs.exists(subPath)) {
          if (BINARY_EXTENSIONS.has(ext)) {
            return { content: [{ type: "text", text: `Binary file: ${subPath} (${ext}). Only text resources can be read.` }] };
          }
          const fileSize = pakVfs.fileSize(subPath);
          if (fileSize < 0) {
            return { content: [{ type: "text", text: `"${subPath}" is a directory. Use game_browse to list its contents.` }] };
          }
          if (fileSize > MAX_FILE_BYTES) {
            return { content: [{ type: "text", text: `File too large: ${subPath} (${(fileSize / 1024).toFixed(0)} KB).` }] };
          }
          const buf = pakVfs.readFile(subPath);
          if (looksBinary(buf)) {
            return { content: [{ type: "text", text: `Binary file: ${subPath} (${fileSize} bytes). Only text resources can be read.` }] };
          }
          return { content: [{ type: "text", text: formatGameFile(subPath, `// ${subPath} (from .pak)\n// ${fileSize} bytes`, buf.toString("utf-8"), opts) }] };
        }

        const lines = [`File not found: ${subPath}`];
        if (ext === ".meta") {
          lines.push(
            "The base game ships no .meta files. To reference a vanilla resource use its \"{GUID}path\" form: " +
            "asset_search returns it for prefabs, and game_read on a prefab that references the resource shows it."
          );
        } else if (pakVfs) {
          const hits = suggestPaths(subPath, pakVfs.allFilePaths());
          if (hits.length) lines.push(`Did you mean:\n${hits.map((h) => `- ${h}`).join("\n")}`);
          else lines.push("No file with that name exists in the game data. Use asset_search or game_browse to locate it.");
        }
        return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text", text: `Error reading game file: ${msg}` }], isError: true };
      }
    }
  );
}
