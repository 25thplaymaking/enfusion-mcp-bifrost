import { z } from "zod";
import { defineWorkbenchTool, type WorkbenchTool } from "../workbench/define-tool.js";

export const moduleNames = [
  "resourceManager",
  "scriptEditor",
  "worldEditor",
  "audioEditor",
  "animationEditor",
  "particleEditor",
  "behaviorEditor",
  "localizationEditor",
  "proceduralAnimationEditor",
  "navmeshEditor",
] as const;

const editorModuleTool = defineWorkbenchTool({
  name: "wb_editor_module",
  description:
    "Shared control for every Reforger Workbench editor. Inspect state, save, or execute an editor-local menu action. Save refuses unnamed worlds that would open Save As; native dialogs need observation. " +
    "Opening an editor or resource can activate Workbench and therefore requires explicit allowForeground permission. " +
    "Use containers then inspect to navigate native properties, children, components and object arrays. " +
    "Pass the returned target and raw value as expectedTarget/expectedValue for conflict-checked setProperty/clearProperty. Edits return native readback and remain in memory until saved. Unsupported property types are explicit; source authoring is available through project.",
  inputSchema: {
    module: z.enum(moduleNames).describe("Workbench editor module to control"),
    action: z.enum(["open", "close", "state", "openResource", "save", "executeAction", "containers", "inspect", "setProperty", "clearProperty"]),
    containerIndex: z.number().int().min(0).default(0),
    entityIndex: z.number().int().min(0).optional().describe("World Editor entity index for initial inspection. Prefer returned entityId for later calls."),
    entityId: z.string().min(1).optional().describe("Opaque native entity ID from inspection; handles unnamed/duplicate-name entities."),
    objectPath: z.string().max(2000).default("").refine(p => !p || p.split("/").length <= 16 && p.split("/").every(s => /^(?:(?:child|component):\d+|object:[^/:]+|array:[^/:]+:\d+)$/.test(s)), "Use returned node paths, up to 16 segments").describe("Native node path from inspection, e.g. component:0/object:Config/array:Items:0."),
    expectedTarget: z.string().min(1).optional().describe("Fingerprint returned by inspect; required for property writes and rejects stale editor/world/reload targets."),
    expectedValue: z.string().optional().describe("Exact raw property value from inspect. Required for property writes, including empty strings."),
    propertyKey: z.string().min(1).optional(),
    valueType: z.enum(["string", "resource", "integer", "number", "boolean", "vector3"]).optional(),
    value: z.union([z.string().max(16384), z.number().finite(), z.boolean(), z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])]).optional(),
    offset: z.number().int().min(0).default(0).describe("First property/container, zero-based."),
    childOffset: z.number().int().min(0).default(0).describe("First node in the current property page's combined object/array/child/component list. Continue with nextNodeOffset, keeping offset unchanged."),
    limit: z.number().int().min(1).max(100).default(50),
    resourcePath: z.string().optional().describe("Project-relative resource path for openResource"),
    menuPath: z.string().optional().describe("Comma-separated module-local menu path for executeAction"),
    expectedFile: z.string().optional().describe("Script Editor executeAction: refuse if the active file differs."),
    keepFocus: z.boolean().optional().default(false).describe("Keep focus in Workbench after the action. Defaults to false for agentic/background operation."),
    allowForeground: z
      .boolean()
      .optional()
      .default(false)
      .describe("Required acknowledgement for open/openResource because those actions can activate a Workbench window."),
  },
  validate: ({ action, resourcePath, menuPath, allowForeground, expectedTarget, expectedValue, propertyKey, value, valueType, entityId, entityIndex, module }) => {
    if (entityId !== undefined && entityIndex !== undefined) return "Choose entityId or entityIndex, not both.";
    if ((entityId !== undefined || entityIndex !== undefined) && module !== "worldEditor") return "Entity targets require worldEditor.";
    if (["setProperty", "clearProperty"].includes(action) && (!expectedTarget || expectedValue === undefined || !propertyKey)) return "Inspect first: property writes require expectedTarget, expectedValue and propertyKey.";
    if (action === "setProperty") {
      if (value === undefined || !valueType) return "setProperty requires value and valueType from inspection.";
      if (["string", "resource"].includes(valueType) && typeof value !== "string") return "String/resource properties require a string.";
      if (["integer", "number"].includes(valueType) && typeof value !== "number") return "Numeric properties require a number.";
      if (valueType === "integer" && (!Number.isInteger(value) || Number(value) < -2147483648 || Number(value) > 2147483647)) return "Integer properties require a signed 32-bit integer.";
      if (valueType === "boolean" && typeof value !== "boolean") return "Boolean properties require true or false.";
      if (valueType === "vector3" && !Array.isArray(value)) return "vector3 requires [x, y, z].";
    }
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
    if ((action === "open" || action === "close" || action === "openResource" || action === "executeAction") && allowForeground !== true) {
      return "Error: this action can activate Workbench. Pass `allowForeground: true` only when the user explicitly permits foreground window activity.";
    }
    return null;
  },
  requireMode: ({ action, module }) => (module === "worldEditor" && ["save", "setProperty", "clearProperty"].includes(action) ? "edit" : null),
  modeAction: ({ action, module }) => `${action} in ${module}`,
  apiFunc: async (input, client) => {
    const result = await client.call<Record<string, unknown>>("EMCP_WB_EditorModule", { ...input,
      checkValue: input.expectedValue !== undefined,
      value: Array.isArray(input.value) ? input.value.join(" ") : input.value === undefined ? "" : String(input.value),
    });
    // RegV bool fields in the engine's JSON API can arrive as 0/1.
    for (const key of ["result", "applied", "verified"]) {
      if (result[key] === 0 || result[key] === 1) result[key] = result[key] === 1;
    }
    if (["containers", "inspect", "setProperty", "clearProperty"].includes(input.action) && result.bridgeVersion !== "0.15.0") throw new Error("Bridge version mismatch. Run wb_bridge install for the verified project, then wb_reload.");
    if (input.action === "setProperty") {
      const after = String(result.afterValue ?? "");
      let matches = after === String(input.value);
      if (input.valueType === "number" || input.valueType === "integer") matches = Number(after) === input.value;
      if (input.valueType === "vector3") matches = after.split(/\s+/).length === 3 && after.split(/\s+/).every((v, i) => Math.abs(Number(v) - (input.value as number[])[i]) <= Math.max(1e-5, Math.abs((input.value as number[])[i]) * 1e-6));
      if (input.valueType === "number") matches = Math.abs(Number(after) - Number(input.value)) <= Math.max(1e-6, Math.abs(Number(input.value)) * 1e-6);
      result.verified = result.applied === true && result.verified === true && matches;
    }
    return result;
  },
  formatter: ({ result, input }) => ({
    isError: result.result === false || (["setProperty", "clearProperty"].includes(input.action) && result.verified !== true),
    text:
      ["containers", "inspect", "setProperty", "clearProperty"].includes(input.action) ? JSON.stringify(result) : `**${input.module}: ${input.action}**\n\n${String(result.message ?? "Completed")}` +
      (typeof result.containerCount === "number" && result.containerCount >= 0
        ? `\nContainers: ${result.containerCount}`
        : ""),
  }),
});

export const editorModuleTools: WorkbenchTool[] = [editorModuleTool];
