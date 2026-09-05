import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const MUTATING_SCRIPT_ACTIONS = new Set(["setLine", "insertLine", "removeLine"]);
const LINE_ACTIONS = new Set(["getLine", "setLine", "insertLine", "removeLine"]);
const TEXT_ACTIONS = new Set(["setLine", "insertLine"]);

const scriptEditorTool = defineWorkbenchTool({
  name: "wb_script_editor",
  description:
    "Interact with the Workbench Script Editor. Get the current file, read/write individual lines, insert or remove lines, or get the line count. Opening a file can activate Workbench and requires explicit allowForeground permission.",
  inputSchema: {
    action: z
      .enum(["getCurrentFile", "getLine", "setLine", "insertLine", "removeLine", "getLinesCount", "openFile"])
      .describe(
        "Action: getCurrentFile (path of open file), getLine (read line N), setLine (overwrite line N), insertLine (insert before line N), removeLine (delete line N), getLinesCount (total lines), openFile (open file by path)"
      ),
    line: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Zero-based engine line index (0 is the first line). Required for getLine, setLine, insertLine, removeLine. project read uses 1-based display lines."),
    text: z
      .string()
      .optional()
      .describe("Text content for setLine and insertLine"),
    path: z
      .string()
      .optional()
      .describe("File path for openFile action (e.g., 'Scripts/Game/MyScript.c')"),
    allowForeground: z
      .boolean()
      .optional()
      .default(false)
      .describe("Required acknowledgement for openFile because it can activate the Script Editor window."),
  },
  validate: ({ action, line, text, path, allowForeground }) => {
    if (LINE_ACTIONS.has(action) && line === undefined) {
      return `Error: \`line\` number is required for the "${action}" action.`;
    }
    if (TEXT_ACTIONS.has(action) && text === undefined) {
      return `Error: \`text\` is required for the "${action}" action.`;
    }
    if (action === "openFile" && !path) {
      return `Error: \`path\` is required for the "openFile" action.`;
    }
    if (action === "openFile" && allowForeground !== true) {
      return "Error: opening a script can activate Workbench. Pass `allowForeground: true` only when the user explicitly permits foreground window activity.";
    }
    return null;
  },
  requireMode: ({ action }) => (MUTATING_SCRIPT_ACTIONS.has(action) ? "edit" : null),
  modeAction: ({ action }) => `${action} in script editor`,
  apiFunc: ({ action, line, text, path }, client) => {
    const params: Record<string, unknown> = { action };
    if (line !== undefined) params.line = line;
    if (text !== undefined) params.text = text;
    if (path !== undefined) params.path = path;
    return client.call<Record<string, unknown>>("EMCP_WB_ScriptEditor", params);
  },
  formatter: ({ result, input }) => {
    const { action, line, text, path } = input;

    if (action === "getCurrentFile") {
      const filePath = result.currentFile || result.path || result.file || "(no file open)";
      return { text: `**Current Script File:** ${filePath}` };
    }

    if (action === "getLine") {
      const lineText = result.lineText ?? result.text ?? result.content ?? "";
      return { text: `**Line ${line}:**\n\`\`\`\n${lineText}\n\`\`\`` };
    }

    if (action === "getLinesCount") {
      const count = result.count ?? result.lineCount ?? result.lines ?? result.linesCount ?? "unknown";
      return { text: `**Line Count:** ${count}` };
    }

    if (action === "setLine") {
      return { text: `**Line ${line} Updated**\n\nNew content:\n\`\`\`\n${text}\n\`\`\`` };
    }

    if (action === "insertLine") {
      return { text: `**Line Inserted** at position ${line}\n\nContent:\n\`\`\`\n${text}\n\`\`\`` };
    }

    if (action === "removeLine") {
      return {
        text: `**Line ${line} Removed**${result.text ? `\n\nRemoved content:\n\`\`\`\n${result.text}\n\`\`\`` : ""}`,
      };
    }

    if (action === "openFile") {
      return { text: `**Opened:** ${path}` };
    }

    return { text: JSON.stringify(result, null, 2) };
  },
});

/** The script-editor tool, migrated to the envelope. */
export const scriptEditorTools: WorkbenchTool[] = [scriptEditorTool];
