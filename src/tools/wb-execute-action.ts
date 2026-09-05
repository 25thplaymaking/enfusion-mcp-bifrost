import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

// Menu paths that are known-destructive and blocked for safety.
const BLOCKED_MENU_PREFIXES = [
  "File,Close",
  "File,New",
  "File,Exit",
  "File,Quit",
];

// Compiling/reloading WorkbenchGame from inside a custom handler's GetResponse
// tears down the handler while NET API is still serializing it. Those actions
// must use the native endpoints whose completion is confirmed out-of-band.
const executeActionTool = defineWorkbenchTool({
  name: "wb_execute_action",
  description:
    "Execute a Workbench menu action by its menu path. Arbitrary menu actions can activate windows and require explicit allowForeground permission. " +
    "Destructive actions and script compile/reload actions are blocked; use wb_validate_scripts or wb_reload for scripts.",
  inputSchema: {
    menuPath: z
      .string()
      .describe(
        "Comma-separated menu path (e.g., 'File,Save', 'Edit,Undo')"
      ),
    allowForeground: z
      .boolean()
      .optional()
      .default(false)
      .describe("Required acknowledgement because an arbitrary menu action can activate a Workbench window."),
  },
  // Reject known-destructive menu paths before any mode probe or I/O. Rendered
  // through the envelope's usage-error path (now flagged isError).
  validate: ({ menuPath, allowForeground }) => {
    const normalizedPath = menuPath.trim();
    const lowerPath = normalizedPath.toLowerCase();
    for (const blocked of BLOCKED_MENU_PREFIXES) {
      if (lowerPath.startsWith(blocked.toLowerCase())) {
        return `**Blocked:** "${menuPath}" is a destructive action and cannot be executed via this tool. Perform it manually in Workbench.`;
      }
    }
    if (lowerPath.includes("reload scripts") || lowerPath.includes("compile")) {
      return `**Blocked:** "${menuPath}" can destroy the NET API handler during its reply. Use \`wb_validate_scripts\` or \`wb_reload\` instead.`;
    }
    if (allowForeground !== true) {
      return "Error: an arbitrary menu action can activate Workbench. Pass `allowForeground: true` only when the user explicitly permits foreground window activity.";
    }
    return null;
  },
  requireMode: () => "edit",
  modeAction: ({ menuPath }) => `execute menu action "${menuPath}"`,
  apiFunc: ({ menuPath }, client) =>
    client.call<Record<string, unknown>>("EMCP_WB_ExecuteAction", { menuPath }),
  formatter: ({ result, input }) => ({
    text: `**Action Executed**\n\nMenu path: ${input.menuPath}${result.message ? `\n${result.message}` : ""}${result.result ? `\nResult: ${JSON.stringify(result.result)}` : ""}`,
  }),
});

/** The execute-menu-action tool, migrated to the envelope. */
export const executeActionTools: WorkbenchTool[] = [executeActionTool];
