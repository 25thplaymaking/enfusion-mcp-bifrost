import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";
import { normalizeOsPath } from "../utils/wsl-path.js";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Local source discovery avoids the engine FileIO.FindFiles permission dialog. */
export function findPrefabSources(searchPath: string, maxResults = 200): Record<string, unknown> {
  const root = resolve(normalizeOsPath(searchPath));
  if (!statSync(root).isDirectory()) throw new Error("searchPath must be a directory accessible on the MCP host.");
  const prefabsPaths: string[] = [];
  let scannedEntries = 0;
  let skippedLinks = 0;
  let stopReason: string | null = null;
  const visit = (directory: string, depth: number) => {
    if (depth > 64) { stopReason = "directory_depth"; return; }
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (stopReason) return;
      if (++scannedEntries > 10_000) { stopReason = "entry_budget"; return; }
      if ([".git", "node_modules"].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) { skippedLinks++; continue; }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".et")) {
        prefabsPaths.push(path.replace(/\\/g, "/"));
        if (prefabsPaths.length >= maxResults) { stopReason = "result_limit"; return; }
      }
    }
  };
  visit(root, 0);
  return { status: "ok", source: "filesystem", prefabsPaths, scannedEntries, skippedLinks,
    partial: stopReason !== null || skippedLinks > 0, stopReason };
}

const MUTATING_PREFAB_ACTIONS = new Set(["createTemplate", "save"]);

const prefabsTool = defineWorkbenchTool({
  name: "wb_prefabs",
  description:
    "Create/save Workbench prefab templates, look up registered GUIDs, or discover prefab source files in a directory on the MCP host. Local locate avoids engine filesystem permission dialogs and reports partial scans. createTemplate/save require edit mode.",
  inputSchema: {
    action: z
      .enum(["createTemplate", "save", "getGuid", "locate", "getAncestor"])
      .describe(
        "Action: createTemplate (create .et from entity), save (save prefab changes), getGuid (look up GUID), locate (find prefabs in path), getAncestor (get the ancestor prefab path of a scene entity)"
      ),
    entityName: z
      .string()
      .optional()
      .describe("Entity name (required for createTemplate and save)"),
    templatePath: z
      .string()
      .optional()
      .describe("Output path for createTemplate (e.g., 'Prefabs/Custom/MyEntity.et')"),
    searchPath: z
      .string()
      .optional()
      .describe("Absolute project directory on the MCP host for local source discovery"),
    maxResults: z.number().int().min(1).max(2000).default(200).describe("Maximum source files returned by locate; narrower searchPath continues a partial scan."),
  },
  requireMode: ({ action }) => (MUTATING_PREFAB_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => (action === "createTemplate" ? "create template" : "save prefab"),
  validate: ({ action, entityName, templatePath, searchPath }) => {
    if (action === "getGuid" && !templatePath && !searchPath) {
      return "Error: Provide `templatePath` (prefab resource path) for getGuid.";
    }
    if (action === "locate" && (!searchPath || !/^(?:[A-Za-z]:[/\\]|[/\\])/.test(searchPath))) {
      return "Error: Provide `searchPath` as an absolute directory on the MCP host for the locate action.";
    }
    if (action === "getAncestor" && !entityName) {
      return "Error: `entityName` is required for getAncestor.";
    }
    if ((action === "createTemplate" || action === "save") && !entityName) {
      return `Error: \`entityName\` is required for the "${action}" action.`;
    }
    return null;
  },
  apiFunc: async ({ action, entityName, templatePath, searchPath, maxResults }, client) => {
    if (action === "getGuid") {
      return client.call<Record<string, unknown>>("GetPrefabGUID", {
        prefabPath: templatePath || searchPath,
      });
    }
    if (action === "locate") {
      return findPrefabSources(searchPath!, maxResults);
    }
    if (action === "getAncestor") {
      return client.call<Record<string, unknown>>("EMCP_WB_Prefabs", {
        action: "getAncestor",
        entityName,
      });
    }
    // createTemplate and save use EMCP_WB_Prefabs
    const params: Record<string, unknown> = { action, entityName };
    if (templatePath) params.templatePath = templatePath;
    return client.call<Record<string, unknown>>("EMCP_WB_Prefabs", params);
  },
  formatter: ({ result, input }) => {
    const { action, entityName, templatePath, searchPath } = input;

    if (action === "getGuid") {
      return {
        text: `**Prefab GUID**\n\n- **Path:** ${templatePath || searchPath}\n- **GUID:** ${result.guid || result.GUID || "(not found)"}`,
      };
    }

    if (action === "locate") {
      const prefabs = Array.isArray(result.prefabsPaths) ? result.prefabsPaths : Array.isArray(result.prefabs) ? result.prefabs : null;
      if (prefabs === null) return { text: "Unrecognized prefab-location response; inspect structured data.", isError: true };
      if (prefabs.length === 0) {
        return { text: `**No prefabs found** in: ${searchPath}${result.partial ? "\nPartial scan: absence is not established." : ""}` };
      }

      const lines = [`**Prefabs in ${searchPath}** (${prefabs.length})\n`];
      for (const p of prefabs) {
        if (typeof p === "string") {
          lines.push(`- ${p}`);
        } else {
          const pObj = p as Record<string, unknown>;
          lines.push(`- ${pObj.path || pObj.name || JSON.stringify(pObj)}`);
        }
      }
      if (result.source === "filesystem") lines.push("\nSource files on the MCP host; engine registration is checked separately with getGuid.");
      if (result.partial) lines.push(`\nPartial scan: ${result.stopReason || "symlink/junctions skipped"}. Narrow searchPath to continue.`);
      return { text: lines.join("\n") };
    }

    if (action === "getAncestor") {
      return {
        text: `**Ancestor Prefab**\n\n- **Entity:** ${entityName}\n- **Ancestor:** ${result.ancestorPath || "(none)"}`,
      };
    }

    if (action === "createTemplate") {
      return {
        text: `**Template Created**\n\n- **Entity:** ${entityName}\n- **Path:** ${templatePath || result.path || "(auto)"}${result.guid ? `\n- **GUID:** ${result.guid}` : ""}`,
      };
    }

    // save
    return {
      text: `**Prefab Saved**\n\n- **Entity:** ${entityName}${result.message ? `\n- **Note:** ${result.message}` : ""}`,
    };
  },
});

/** The prefab-operations tool, migrated to the envelope. */
export const prefabTools: WorkbenchTool[] = [prefabsTool];
