import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

const moduleNames = [
  "resourceManager",
  "scriptEditor",
  "worldEditor",
  "audioEditor",
  "animationEditor",
  "particleEditor",
  "behaviorEditor",
  "localizationEditor",
  "proceduralAnimationEditor",
] as const;

const editorModuleTool = defineWorkbenchTool({
  name: "wb_editor_module",
  description:
    "Shared control for every Reforger Workbench editor. Inspect state, save, or execute an editor-local menu action without opening a window. " +
    "Opening an editor or resource can activate Workbench and therefore requires explicit allowForeground permission. " +
    "Audio, Animation, Particle, Behavior, and Procedural Animation expose this common module surface publicly; use the structured asset tools for file authoring.",
  inputSchema: {
    module: z.enum(moduleNames).describe("Workbench editor module to control"),
    action: z.enum(["open", "state", "openResource", "save", "executeAction"]),
    resourcePath: z.string().optional().describe("Project-relative resource path for openResource"),
    menuPath: z.string().optional().describe("Comma-separated module-local menu path for executeAction"),
    keepFocus: z.boolean().optional().default(false).describe("Keep focus in Workbench after the action. Defaults to false for agentic/background operation."),
    allowForeground: z
      .boolean()
      .optional()
      .default(false)
      .describe("Required acknowledgement for open/openResource because those actions can activate a Workbench window."),
  },
  validate: ({ action, resourcePath, menuPath, allowForeground }) => {
    if (action === "openResource" && !resourcePath) return "Error: `resourcePath` is required for openResource.";
    if (action === "executeAction" && !menuPath) return "Error: `menuPath` is required for executeAction.";
    if (
      action === "executeAction" &&
      menuPath &&
      (menuPath.toLowerCase().includes("reload scripts") ||
        menuPath.toLowerCase().includes("compile"))
    ) {
      return "Error: script compile/reload cannot run inside a custom NET API reply. Use `wb_validate_scripts` or `wb_reload` instead.";
    }
    if ((action === "open" || action === "openResource" || action === "executeAction") && allowForeground !== true) {
      return "Error: this action can activate Workbench. Pass `allowForeground: true` only when the user explicitly permits foreground window activity.";
    }
    return null;
  },
  requireMode: ({ action }) => (action === "state" || action === "open" ? null : "edit"),
  modeAction: ({ action, module }) => `${action} in ${module}`,
  apiFunc: (input, client) => client.call<Record<string, unknown>>("EMCP_WB_EditorModule", input),
  formatter: ({ result, input }) => ({
    text:
      `**${input.module}: ${input.action}**\n\n${String(result.message ?? "Completed")}` +
      (typeof result.containerCount === "number" && result.containerCount >= 0
        ? `\nContainers: ${result.containerCount}`
        : ""),
  }),
});

export const editorModuleTools: WorkbenchTool[] = [editorModuleTool];
