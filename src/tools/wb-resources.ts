import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";
import { foregroundAuthorized } from "../workbench/tool-helpers.js";

const resourcesTool = defineWorkbenchTool({
  name: "wb_resources",
  description:
    "Manage Workbench resources. Register resources, rebuild databases, or inspect resource info in the background. Opening a resource can activate Workbench and requires explicit allowForeground permission.",
  inputSchema: {
    action: z
      .enum(["register", "rebuild", "getInfo", "open"])
      .describe(
        "Action: register (add resource to DB), rebuild (regenerate resource DB), getInfo (resource metadata), open (open in editor)"
      ),
    path: z
      .string()
      .describe(
        "Resource path. Required for all actions."
      ),
    buildRuntime: z
      .boolean()
      .optional()
      .describe("Build runtime data during register/rebuild (slower but ensures assets are ready)"),
    allowForeground: z
      .boolean()
      .optional()
      .default(false)
      .describe("Required acknowledgement for action=open because it can activate a Workbench window."),
  },
  validate: ({ action, allowForeground }) =>
    action !== "open" || allowForeground === true || foregroundAuthorized()
      ? null
      : "Error: opening a resource can activate Workbench. Pass `allowForeground: true` only when the user explicitly permits foreground window activity.",
  // Resource Manager does not require a loaded World Editor scene.
  requireMode: () => null,
  modeAction: ({ action }) => `${action} resource`,
  apiFunc: ({ action, path, buildRuntime }, client) => {
    if (action === "getInfo") {
      // Use built-in GetResourceInfo handler
      return client.call<Record<string, unknown>>("GetResourceInfo", { path });
    }
    // register, rebuild, open all use EMCP_WB_Resources
    const params: Record<string, unknown> = { action, path };
    if (buildRuntime !== undefined) params.buildRuntime = buildRuntime;
    return client.call<Record<string, unknown>>("EMCP_WB_Resources", params);
  },
  formatter: ({ result, input }) => {
    const { action, path } = input;

    if (action === "getInfo") {
      const lines = [`**Resource Info**\n`];
      lines.push(`- **Path:** ${path}`);
      if (result.guid) lines.push(`- **GUID:** ${result.guid}`);
      if (result.type) lines.push(`- **Type:** ${result.type}`);
      if (result.size !== undefined) lines.push(`- **Size:** ${result.size}`);
      if (result.lastModified) lines.push(`- **Modified:** ${result.lastModified}`);
      if (result.dependencies && Array.isArray(result.dependencies)) {
        lines.push(`\n### Dependencies (${result.dependencies.length})`);
        for (const dep of result.dependencies) {
          lines.push(`- ${dep}`);
        }
      }

      // Fallback for unknown response shapes
      const knownKeys = new Set(["guid", "type", "size", "lastModified", "dependencies", "path"]);
      for (const [key, val] of Object.entries(result)) {
        if (!knownKeys.has(key) && val !== undefined) {
          lines.push(`- **${key}:** ${typeof val === "object" ? JSON.stringify(val) : val}`);
        }
      }

      return { text: lines.join("\n") };
    }

    // register, rebuild, open
    const actionLabels: Record<string, string> = {
      register: `Registered resource: ${path}`,
      rebuild: `Requested resource rebuild for: ${path}; completion is unconfirmed until resource/log inspection`,
      open: `Opened resource: ${path}`,
    };

    return { text: `**${actionLabels[action]}**${result.message ? `\n\n${result.message}` : ""}` };
  },
});

/** The resource-management tool, migrated to the envelope. */
export const resourceTools: WorkbenchTool[] = [resourcesTool];
