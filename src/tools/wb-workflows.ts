import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { runWorkbenchTool, type WorkbenchTool, type ToolResponse } from "../workbench/define-tool.js";

export const EDITOR_ROUTES = [
  { module: "resourceManager", tools: ["wb_resources", "asset_search", "game_read", "game_duplicate"], source: "project", formats: [".meta", ".emat"], boundary: "Runtime resource compilation belongs to Workbench." },
  { module: "scriptEditor", tools: ["wb_script_editor", "wb_validate_scripts", "wb_reload", "api_search"], source: "project", formats: [".c"], boundary: "Use native reload/validation; never compile inside a custom handler reply." },
  { module: "worldEditor", tools: ["wb_entity_list", "wb_entity_inspect", "wb_entity_modify", "wb_component", "wb_layers", "wb_terrain", "wb_prefabs", "scenario_create", "layout_create", "menu_create"], source: "project", formats: [".et", ".ent", ".layer", ".layout", ".conf"], boundary: "Terrain queries are supported; a general terrain sculpting/navmesh API is not implemented." },
  { module: "localizationEditor", tools: ["wb_localization"], source: "project", formats: [".st", ".csv"], boundary: "Save editor changes explicitly." },
  { module: "animationEditor", tools: ["animation_graph"], source: "project", formats: [".agr", ".ast", ".agf", ".asi", ".aw"], boundary: "Source authoring and inspection; compiled graph caches remain engine-owned." },
  { module: "audioEditor", tools: ["editor_asset"], source: "project", formats: [".acp"], boundary: "Minimal graph generation plus full text source editing; no public live graph-node API." },
  { module: "particleEditor", tools: ["editor_asset"], source: "project", formats: [".ptc"], boundary: "Basic emitter generation plus full text source editing; no public live graph-node API." },
  { module: "proceduralAnimationEditor", tools: ["editor_asset"], source: "project", formats: [".pap", ".siga"], boundary: "Signal/bone graph source editing; no public live graph-node API." },
  { module: "behaviorEditor", tools: ["wb_editor_module"], source: "project", formats: [], boundary: "Common module control only; no verified serialized graph generator." },
  { module: "navmeshEditor", tools: ["wb_editor_module"], source: "project", formats: [], boundary: "Native module navigation and exposed containers. Generation requires an observed/documented editor action and resource verification." },
] as const;

export const batchSchema = {
  steps: z.array(z.object({
    tool: z.string().describe("An eligible tool listed by wb_capabilities; no raw NET API function names."),
    arguments: z.record(z.unknown()).default({}),
  }).strict()).min(1).max(25),
  stopOnError: z.boolean().default(true).describe("Stop at the first failed or unconfirmed operation. Earlier mutations remain applied."),
};

export async function runWorkbenchBatch(
  input: z.infer<z.ZodObject<typeof batchSchema>>,
  client: WorkbenchClient,
  tools: WorkbenchTool[],
  signal?: AbortSignal,
): Promise<ToolResponse> {
  // Check the entire plan before the first mutation. Reuse exactly the same
  // schemas/defaults/usage checks and runtime guards as individual tool calls.
  const prepared: Array<{ tool: WorkbenchTool; input: Record<string, unknown> }> = [];
  for (const [index, step] of input.steps.entries()) {
    const tool = tools.find((candidate) => candidate.name === step.tool);
    const parsed = tool ? z.object(tool.inputSchema).strict().safeParse(step.arguments) : null;
    const error = !tool ? `Tool is not batch eligible: ${step.tool}`
      : !parsed?.success ? parsed?.error.message || "Invalid arguments"
      : tool.validate?.(parsed.data);
    if (error) {
      const data = { outcome: "blocked", failedStep: index, executed: 0, message: error };
      return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: true };
    }
    prepared.push({ tool: tool!, input: parsed!.data! });
  }

  const results: Array<Record<string, unknown>> = [];
  const deadline = Date.now() + 60_000;
  let stoppedReason: string | null = null;
  let anyError = false;
  let outputSize = 0;
  for (const [index, step] of prepared.entries()) {
    if (signal?.aborted || Date.now() >= deadline) {
      stoppedReason = signal?.aborted ? "cancelled" : "time_budget";
      break;
    }
    const response = await runWorkbenchTool(step.tool, step.input, client);
    anyError ||= response.isError === true;
    const result = { index, tool: step.tool.name, isError: response.isError === true,
      ...response.structuredContent, text: response.content.map((item) => item.text).join("\n") };
    const size = JSON.stringify(result).length;
    if (outputSize + size > 240_000) {
      results.push({ index, tool: step.tool.name, isError: response.isError === true,
        outcome: response.structuredContent?.outcome, outputOmitted: true,
        message: "Operation executed; output exceeded batch budget. Inspect separately before continuing." });
      stoppedReason = "output_budget";
      break;
    }
    outputSize += size;
    results.push(result);
    if (response.isError && input.stopOnError) {
      stoppedReason = "step_error";
      break;
    }
  }
  const failed = anyError || stoppedReason !== null;
  const data = { outcome: failed ? "incomplete" : "completed", atomic: false,
    executed: results.length, remaining: prepared.length - results.length, stoppedReason, results };
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data,
    ...(failed ? { isError: true } : {}) };
}

export function registerWorkbenchWorkflows(server: McpServer, config: Config, client: WorkbenchClient, tools: WorkbenchTool[]): void {
  server.registerTool("wb_batch", {
    description: "Run up to 25 existing Workbench tools in order. Preflights every step before I/O, preserves normal guards and defaults, stops on error by default, and returns structured per-step outcomes. Not atomic: earlier edits remain applied. A 60-second budget is checked between calls; an in-flight call retains its normal timeout. Launch/reload/play/stop and offline authoring remain individual tools. Use wb_capabilities for eligible names.",
    inputSchema: batchSchema,
  }, async (input, extra) => runWorkbenchBatch(input, client, tools, extra.signal));

  server.registerTool("wb_capabilities", {
    description: "Start here for Codex/Astra Workbench work. Discover all ten supported editor modules, source formats, authoring tools, native inspection, debugging and documentation workflows. live=true probes native loaded projects even when bridge handlers are missing, then state and module availability without opening windows or changing files.",
    inputSchema: { live: z.boolean().default(false) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ live }) => {
    const data: Record<string, unknown> = {
      configuredProjectRoot: config.projectPath, configuredDefaultMod: config.defaultMod ?? null,
      identityRule: "A default folder is not live project identity. Use actual loaded IDs and wb_projects locate with an absolute path; pass the intended projectPath to file tools.",
      editors: EDITOR_ROUTES,
      commonEditorTool: "wb_editor_module",
      nativeInspection: "containers -> inspect -> returned node path/entityId -> setProperty with expectedTarget and expectedValue -> native readback -> explicit save",
      bridge: "wb_bridge status/install; never launch over a running native endpoint",
      documentation: "wb_docs list/read/deploy; project write/edit for task notes",
      debugging: "wb_debug for runtime log cursors, source context and debugger control guidance; native debugger panes remain observable through computer use",
      batchTools: tools.map((tool) => ({ name: tool.name, description: tool.description,
        parameters: Object.entries(tool.inputSchema).map(([name, schema]) => ({ name, description: schema.description, required: !schema.isOptional() })) })),
      researchOrder: ["api_search / wb_knowledge", "wiki_search / wiki_read", "game_read / game_browse"],
      verification: "Source parsing, Workbench compilation, and in-game/multiplayer validation are distinct evidence.",
      focus: "State and file operations run in the background. Opens and arbitrary actions require allowForeground=true when authorized by the user; no repeated user question is required if that authorization already exists.",
    };
    if (live) {
      const projects = await runWorkbenchTool(tools.find((t) => t.name === "wb_projects")!, { action: "list" }, client);
      const state = await runWorkbenchTool(tools.find((t) => t.name === "wb_state")!, {}, client);
      const probes: Record<string, unknown> = { projects: projects.structuredContent, state: state.structuredContent };
      if (!state.isError) {
        const modules: Record<string, unknown> = {};
        for (const editor of EDITOR_ROUTES) {
          const result = await runWorkbenchTool(tools.find((t) => t.name === "wb_editor_module")!, { action: "state", module: editor.module }, client);
          modules[editor.module] = result.structuredContent;
          if (result.isError && !client.state.connected) break;
        }
        probes.modules = modules;
      }
      data.live = probes;
    }
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  });
}
