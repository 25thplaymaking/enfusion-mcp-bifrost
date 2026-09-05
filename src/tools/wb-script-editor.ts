import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const MUTATING_SCRIPT_ACTIONS = new Set(["setLine", "insertLine", "removeLine"]);
const LINE_ACTIONS = new Set(["getLine", "setLine", "insertLine", "removeLine", "readRange"]);
const TEXT_ACTIONS = new Set(["setLine", "insertLine"]);

const scriptEditorTool = defineWorkbenchTool({
  name: "wb_script_editor",
  description:
    "Read the live Script Editor buffer (including unsaved changes) and edit exact lines with conflict checks. saveAll dispatches Workbench's File > Save All for ALL open script buffers; inspect other unsaved tabs first, then verify disk contents. The inherited single-file save may be unavailable. Line edits require expectedFile, expectedLinesCount and expectedText, and return native readback. openFile/saveAll require allowForeground. Compilation is separate.",
  inputSchema: {
    action: z
      .enum(["getCurrentFile", "getLine", "setLine", "insertLine", "removeLine", "getLinesCount", "openFile", "readRange", "save", "saveAll"])
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
    expectedFile: z.string().min(1).optional().describe("Exact currentFile from a read; rejects an unexpected active tab."),
    expectedLinesCount: z.number().int().min(1).optional(),
    expectedText: z.string().optional().describe("Exact text at the zero-based line before set/insert/remove."),
    maxLines: z.number().int().min(1).max(200).default(50).describe("readRange: bounded live buffer lines, default 50."),
    allowForeground: z
      .boolean()
      .optional()
      .default(false)
      .describe("Required acknowledgement for openFile because it can activate the Script Editor window."),
  },
  validate: ({ action, line, text, path, allowForeground, expectedFile, expectedLinesCount, expectedText }) => {
    if (LINE_ACTIONS.has(action) && line === undefined) {
      return `Error: \`line\` number is required for the "${action}" action.`;
    }
    if (TEXT_ACTIONS.has(action) && text === undefined) {
      return `Error: \`text\` is required for the "${action}" action.`;
    }
    if (action === "openFile" && !path) {
      return `Error: \`path\` is required for the "openFile" action.`;
    }
    if ((action === "openFile" || action === "saveAll") && allowForeground !== true) {
      return "Error: opening a script can activate Workbench. Pass `allowForeground: true` only when the user explicitly permits foreground window activity.";
    }
    if (MUTATING_SCRIPT_ACTIONS.has(action) && (!expectedFile || expectedLinesCount === undefined || expectedText === undefined)) return "Line edits require expectedFile, expectedLinesCount and expectedText from a live buffer read.";
    if (TEXT_ACTIONS.has(action) && /[\r\n]/.test(text ?? "")) return "Line edits accept one line only.";
    if ((action === "save" || action === "saveAll") && !expectedFile) return "Save requires expectedFile to identify the current buffer.";
    return null;
  },
  // Source-buffer editing is independent of World Editor play/edit state.
  requireMode: () => null,
  modeAction: ({ action }) => `${action} in script editor`,
  apiFunc: async ({ action, line, text, path, expectedFile, expectedLinesCount, expectedText, maxLines }, client) => {
    const params: Record<string, unknown> = { action };
    if (expectedFile !== undefined) params.expectedFile = expectedFile;
    if (expectedLinesCount !== undefined) params.expectedLinesCount = expectedLinesCount;
    if (expectedText !== undefined) { params.expectedText = expectedText; params.checkText = true; }
    if (action === "readRange") params.maxLines = maxLines;
    if (line !== undefined) params.line = line;
    if (text !== undefined) params.text = text;
    if (path !== undefined) params.path = path;
    const result = await client.call<Record<string, unknown>>("EMCP_WB_ScriptEditor", params);
    for (const key of ["verified", "partial", "dispatched"]) {
      if (result[key] === 0 || result[key] === 1) result[key] = result[key] === 1;
    }
    return result;
  },
  formatter: ({ result, input }) => {
    const { action, line, text, path } = input;
    if (action === "saveAll") return { text: JSON.stringify(result), isError: result.dispatched !== true };
    if ((MUTATING_SCRIPT_ACTIONS.has(action) || action === "save") && result.verified !== true) return { text: "Editor operation was not verified; inspect the buffer before retrying. " + JSON.stringify(result), isError: true };
    if (["readRange", "save"].includes(action)) return { text: JSON.stringify(result) };

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
