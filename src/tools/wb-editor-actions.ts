/**
 * The single-call World Editor actions — save, undo/redo, open resource.
 *
 * Split out of `wb-editor.ts`, which keeps only `wb_play`/`wb_stop`: those two
 * poll `confirmMode` after switching mode and stay hand-written, while these
 * three are plain `guard → call → format once → footer → catch` tools and
 * belong in the envelope (ADR-0007).
 */

import { z } from "zod";
import { WorkbenchError } from "../workbench/client.js";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";
import { foregroundAuthorized } from "../workbench/tool-helpers.js";

/**
 * A timed-out save has an unknown outcome. A modal dialog is one possible
 * cause, not an observation. Do not claim success or retry a mutation blindly.
 */
type SaveOutcome =
  | { pending: false; result: Record<string, unknown> }
  | { pending: true };

const saveTool = defineWorkbenchTool({
  name: "wb_save",
  description:
    "Save the current world in the World Editor. Optionally save to a new path (Save As). Only works in edit mode.",
  inputSchema: {
    path: z
      .string()
      .optional()
      .describe("File path for Save As. Omit to save to the current file."),
  },
  requireMode: () => "edit",
  modeAction: "save",
  apiFunc: async ({ path }, client): Promise<SaveOutcome> => {
    const params: Record<string, unknown> = { action: path ? "saveAs" : "save" };
    if (path) params.path = path;

    try {
      // Save can open a modal dialog for unsaved worlds — use longer timeout
      const result = await client.call<Record<string, unknown>>("EMCP_WB_EditorControl", params, {
        timeout: 30_000,
      });
      return { pending: false, result };
    } catch (e) {
      if (e instanceof WorkbenchError && e.code === "TIMEOUT") return { pending: true };
      throw e;
    }
  },
  formatter: ({ result, input }) => {
    if (result.pending) {
      return {
        text: "**Save Unconfirmed** — Workbench did not reply before the timeout. A save dialog may require user confirmation, or the editor may still be busy. Inspect Workbench before retrying; saving has not been confirmed.",
        isError: true,
      };
    }

    const label = input.path ? `Saved as: ${input.path}` : "World saved.";
    const message = result.result.message;
    return { text: `**Save Complete**\n\n${label}${message ? `\n${message}` : ""}` };
  },
});

const undoRedoTool = defineWorkbenchTool({
  name: "wb_undo_redo",
  description: "Undo or redo the last action in the World Editor.",
  inputSchema: {
    action: z.enum(["undo", "redo"]).describe("Whether to undo or redo"),
  },
  apiFunc: ({ action }, client) =>
    client.call<Record<string, unknown>>("EMCP_WB_EditorControl", { action }),
  formatter: ({ result, input }) => {
    const label = input.action === "undo" ? "Undo" : "Redo";
    return { text: `**${label} Complete**${result.message ? `\n\n${result.message}` : ""}` };
  },
});

const openResourceTool = defineWorkbenchTool({
  name: "wb_open_resource",
  description:
    "Open a resource file in the appropriate Workbench editor. This can activate Workbench and requires explicit allowForeground permission.",
  inputSchema: {
    path: z
      .string()
      .describe("Resource path to open (e.g., 'Prefabs/Weapons/Rifles/AK74/Rifle_AK74.et', 'Scripts/Game/MyScript.c')"),
    allowForeground: z
      .boolean()
      .optional()
      .default(false)
      .describe("Required acknowledgement because opening a resource can activate a Workbench window."),
  },
  validate: ({ allowForeground }) =>
    allowForeground === true || foregroundAuthorized()
      ? null
      : "Error: opening a resource can activate Workbench. Pass `allowForeground: true` only when the user explicitly permits foreground window activity.",
  apiFunc: ({ path }, client) =>
    client.call<Record<string, unknown>>("EMCP_WB_EditorControl", {
      action: "openResource",
      path,
    }),
  formatter: ({ result, input }) => ({
    text: `**Resource Opened**\n\nOpened: ${input.path}${result.message ? `\n${result.message}` : ""}`,
  }),
});

/** The single-call editor actions, migrated to the envelope. */
export const editorActionTools: WorkbenchTool[] = [saveTool, undoRedoTool, openResourceTool];
