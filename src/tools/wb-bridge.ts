import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { projectSchema, projectFile, runProjectTool } from "./project.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bundlePath = join(root, "mod/Scripts/WorkbenchGame/EnfusionMCP");
export const WORKBENCH_DOCS = ["CODEX_WORKBENCH.md", "WORKBENCH_EDITOR_OPERATIONS.md", "NATIVE_AGENT_WORKFLOW.md"] as const;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const samePath = (a: string, b: string) => {
  const normalize = (p: string) => realpathSync(p).replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b);
};
const reply = (data: Record<string, unknown>, error = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data, ...(error ? { isError: true } : {}) });

export async function inspectBridge(projectPath: string, client: WorkbenchClient) {
  if (!isAbsolute(projectPath)) throw new Error("projectPath must be an absolute addon root.");
  if (!readdirSync(projectPath).some(f => f.endsWith(".gproj"))) throw new Error("projectPath must contain a .gproj.");
  const located = await client.call<Record<string, unknown>>("LocateProject", { path: projectPath.replace(/\\/g, "/").replace(/\/+$/, "") + "/" });
  if (typeof located.projectPath !== "string" || typeof located.projectName !== "string" || !samePath(projectPath, located.projectPath)) throw new Error("Requested root is not the native located project root; inspect wb_projects before installing.");
  const files = readdirSync(bundlePath).filter(f => f.endsWith(".c")).sort().map(name => {
    const path = `Scripts/WorkbenchGame/EnfusionMCP/${name}`;
    const content = readFileSync(join(bundlePath, name), "utf8");
    const full = projectFile(projectPath, path);
    const existing = existsSync(full) ? readFileSync(full, "utf8") : null;
    return { path, content, sha256: sha(content), previousSha256: existing === null ? null : sha(existing), changed: content !== existing };
  });
  if (!files.length) throw new Error("Bundled bridge scripts are missing.");
  return { projectPath, projectId: located.projectName, files };
}

export function writeBridgeFiles(projectPath: string, files: Array<{ path: string; content: string; previousSha256: string | null; changed: boolean }>, config: Config, dryRun: boolean) {
  // Preflight every path before the first write, including descendant junctions.
  for (const file of files.filter(f => f.changed)) {
    const result = runProjectTool(projectSchemaObject({ action: "write", projectPath, path: file.path, content: file.content, expectedSha256: file.previousSha256 ?? undefined, expectedMissing: file.previousSha256 === null, dryRun: true }), config);
    if ("isError" in result && result.isError) throw new Error(result.content[0].text);
  }
  const written: string[] = [];
  if (!dryRun) for (const file of files.filter(f => f.changed)) {
    const result = runProjectTool(projectSchemaObject({ action: "write", projectPath, path: file.path, content: file.content, expectedSha256: file.previousSha256 ?? undefined, expectedMissing: file.previousSha256 === null }), config);
    if ("isError" in result && result.isError) throw new Error(`Partial installation; wrote ${written.join(", ") || "no files"}. ${result.content[0].text}`);
    if (sha(readFileSync(join(projectPath, file.path), "utf8")) !== sha(file.content)) throw new Error(`Readback differs: ${file.path}. Installation is incomplete.`);
    written.push(file.path);
  }
  return written;
}
const projectSchemaObject = (input: unknown) => z.object(projectSchema).parse(input);

export function registerWbBridge(server: McpServer, config: Config, client: WorkbenchClient) {
  server.registerTool("wb_bridge", {
    description: "Inspect or install/update the native MCP plugin in an explicitly selected, currently loaded addon. Verifies native project identity, preflights all managed script paths, hashes/readbacks changes, and never launches or restarts Workbench. After install use wb_validate_scripts then wb_reload; installed files alone do not prove compiled handlers. Existing session authorization permits installation without another question.",
    inputSchema: { action: z.enum(["status", "install"]), projectPath: z.string(), dryRun: z.boolean().default(false) },
  }, async ({ action, projectPath, dryRun }) => {
    try {
      const snapshot = await inspectBridge(projectPath, client);
      const written = action === "install" ? writeBridgeFiles(projectPath, snapshot.files, config, dryRun) : [];
      return reply({ outcome: "completed", projectPath, projectId: snapshot.projectId, action, dryRun, written,
        files: snapshot.files.map(({ content: _content, ...file }) => file),
        compilation: "unverified", next: "wb_validate_scripts configuration=WORKBENCH, then wb_reload target=scripts, then wb_editor_module state to verify bridgeVersion." });
    } catch (error) { return reply({ outcome: "error", message: String(error) }, true); }
  });

  server.registerTool("wb_docs", {
    description: "List/read the bundled agent Workbench guides or deploy them into an explicit project's Docs/EnfusionMCP folder. Existing different documentation is preserved unless overwrite=true; all files are preflighted and read back. Use project write/edit for your own task documentation. No web publishing or extra process.",
    inputSchema: { action: z.enum(["list", "read", "deploy"]), document: z.enum(WORKBENCH_DOCS).optional(), projectPath: z.string().optional(), overwrite: z.boolean().default(false), dryRun: z.boolean().default(false) },
  }, async ({ action, document, projectPath, overwrite, dryRun }) => {
    try {
      if (action === "list") return reply({ documents: WORKBENCH_DOCS, source: "bundled" });
      if (action === "read") {
        if (!document) throw new Error("read requires document.");
        return { content: [{ type: "text" as const, text: readFileSync(join(root, "docs", document), "utf8") }], structuredContent: { document } };
      }
      if (!projectPath || !isAbsolute(projectPath)) throw new Error("deploy requires an explicit absolute projectPath.");
      const files = (document ? [document] : WORKBENCH_DOCS).map(name => {
        const path = `Docs/EnfusionMCP/${name}`;
        const content = readFileSync(join(root, "docs", name), "utf8");
        // Read through the project boundary first, before inspecting any existing file.
        const check = runProjectTool(projectSchemaObject({ action: "write", projectPath, path, content, dryRun: true }), config);
        if ("isError" in check && check.isError) throw new Error(check.content[0].text);
        const previous = existsSync(join(projectPath, path)) ? readFileSync(join(projectPath, path), "utf8") : null;
        if (previous !== null && previous !== content && !overwrite) throw new Error(`${path} differs; use overwrite=true to replace it, or project edit to merge.`);
        return { path, content, previousSha256: previous === null ? null : sha(previous), changed: previous !== content };
      });
      const written = writeBridgeFiles(projectPath, files, config, dryRun);
      return reply({ outcome: "completed", projectPath, dryRun, written, documents: files.map(f => ({ path: f.path, sha256: sha(f.content), changed: f.changed })) });
    } catch (error) { return reply({ outcome: "error", message: String(error) }, true); }
  });
  for (const name of WORKBENCH_DOCS) server.registerResource(name, `enfusion://workbench/docs/${name}`, { description: "Native Workbench agent workflow", mimeType: "text/markdown" }, async uri => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(join(root, "docs", name), "utf8") }] }));
}
