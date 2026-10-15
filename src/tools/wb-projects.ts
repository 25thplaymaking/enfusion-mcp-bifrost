import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";
import { toEnginePath, normalizeOsPath } from "../utils/wsl-path.js";
import { foregroundAuthorized } from "../workbench/tool-helpers.js";

const projectsTool = defineWorkbenchTool({
  name: "wb_projects",
  description:
    "Query actual loaded addon IDs, locate the loaded project containing an absolute filesystem path, or open a .gproj with explicit foreground permission. Configured defaults are not evidence of which project is loaded.",
  inputSchema: {
    action: z
      .enum(["list", "locate", "open"])
      .describe("Action: list (loaded addon IDs), locate (identify project from an absolute path), open (open .gproj)"),
    name: z
      .string()
      .optional()
      .describe("Legacy alias for path. For locate this must be an absolute path, not an addon ID."),
    path: z.string().optional().describe("Absolute path inside a loaded project for locate; .gproj path for open."),
    allowForeground: z.boolean().optional().default(false).describe("Permit opening the project window when the user has authorized foreground activity."),
  },
  validate: ({ action, name, path, allowForeground }) => {
    const target = path || name;
    if (action === "open" && !target) {
      return "Error: `path` is required for the open action. Provide the .gproj file path.";
    }
    if (action === "locate" && (!target || !/^(?:[A-Za-z]:[/\\]|[/\\])/.test(target))) {
      return "Error: `path` must be an absolute filesystem path inside a loaded project. LocateProject does not accept addon names.";
    }
    if (action === "open" && allowForeground !== true && !foregroundAuthorized()) return "Error: opening a project can activate Workbench. Pass `allowForeground: true` when foreground activity is authorized.";
    return null;
  },
  apiFunc: ({ action, name, path }, client) => {
    const target = path || name;
    if (action === "open") {
      // `name` may be an addon name or a .gproj file path in any form
      // (/mnt/..., D:\..., or D:/...). Normalize to WSL form then convert to
      // the Windows path the NET API expects, so all input forms round-trip
      // consistently. Addon names and resource paths pass through unchanged.
      return client.call<Record<string, unknown>>("EMCP_WB_EditorControl", {
        action: "openResource",
        path: toEnginePath(normalizeOsPath(target!)),
      });
    }
    if (action === "locate") {
      // Shipped LocateProject uses a case-sensitive Contains against a root
      // ending in '/'. Include the separator so locating the root itself works.
      const lookupPath = toEnginePath(normalizeOsPath(target!)).replace(/\\/g, "/");
      return client.call<Record<string, unknown>>("LocateProject", { path: lookupPath.endsWith("/") ? lookupPath : lookupPath + "/" });
    }
    return client.call<Record<string, unknown>>("GetLoadedProjects");
  },
  formatter: ({ result, input }) => {
    const { action } = input;
    const name = input.path || input.name;

    if (action === "open") {
      return {
        text: `**Project Opened**\n\nLoaded: ${name}${result.message ? `\n${result.message}` : ""}`,
      };
    }

    if (action === "locate") {
      const path = result.path || result.projectPath || "(not found)";
      return {
        text: `**Project Located**\n\n- **Name:** ${result.projectName || name}\n- **Path:** ${path}${result.guid ? `\n- **GUID:** ${result.guid}` : ""}`,
        ...(path === "(not found)" ? { isError: true } : {}),
      };
    }

    // list
    const projects = Array.isArray(result["Loaded Projects"])
      ? result["Loaded Projects"]
      : Array.isArray(result.projects)
      ? result.projects
      : Array.isArray(result.addons)
        ? result.addons
        : null;

    if (projects === null) return { text: "Unrecognized loaded-project response; inspect structured data. Project identity is unconfirmed.", isError: true };

    if (projects.length === 0) {
      return { text: `**No projects loaded** in Workbench.` };
    }

    const lines = [`**Loaded Projects** (${projects.length})\n`];
    for (const proj of projects) {
      if (typeof proj === "string") {
        lines.push(`- ${proj}`);
      } else {
        const p = proj as Record<string, unknown>;
        const pName = p.name || p.id || "(unnamed)";
        const pPath = p.path ? ` - ${p.path}` : "";
        const pGuid = p.guid ? ` (${p.guid})` : "";
        lines.push(`- **${pName}**${pPath}${pGuid}`);
      }
    }

    return { text: lines.join("\n") };
  },
});

/** The project-query tool, migrated to the envelope. */
export const projectTools: WorkbenchTool[] = [projectsTool];
