import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runWorkbenchBatch, batchSchema, registerWorkbenchWorkflows, EDITOR_ROUTES } from "../../src/tools/wb-workflows.js";
import { defineWorkbenchTool } from "../../src/workbench/define-tool.js";
import { fakeClient } from "../workbench/fake-client.js";
import { stateTools } from "../../src/tools/wb-state.js";
import { projectTools } from "../../src/tools/wb-projects.js";
import { editorModuleTools } from "../../src/tools/wb-editor-module.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../src/config.js";

const schema = z.object(batchSchema);
const makeTool = (apiFunc = vi.fn(async (input: any) => input)) => defineWorkbenchTool({
  name: "edit", description: "Edit", inputSchema: { value: z.number().default(42) },
  requireMode: () => "edit", apiFunc, formatter: () => ({ text: "done" }),
});

describe("ordered Workbench batches", () => {
  it("preflights the whole plan before any operation, including unknown tools/fields", async () => {
    for (const last of [{ tool: "raw_api" }, { tool: "edit", arguments: { value: "bad" } }, { tool: "edit", arguments: { typo: 1 } }]) {
      const tool = makeTool();
      const result = await runWorkbenchBatch(schema.parse({ steps: [{ tool: "edit" }, last] }), fakeClient(), [tool]);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ executed: 0, failedStep: 1 });
      expect(tool.apiFunc).not.toHaveBeenCalled();
    }
  });

  it("applies defaults and awaits each step in input order", async () => {
    const seen: number[] = [];
    const tool = makeTool(vi.fn(async ({ value }) => { await Promise.resolve(); seen.push(value); return { value }; }));
    const result = await runWorkbenchBatch(schema.parse({ steps: [{ tool: "edit" }, { tool: "edit", arguments: { value: 2 } }] }), fakeClient(), [tool]);
    expect(seen).toEqual([42, 2]);
    expect(result.structuredContent).toMatchObject({ outcome: "completed", executed: 2, remaining: 0, atomic: false });
  });

  it("stops after an engine error and records partial completion", async () => {
    const tool = makeTool(vi.fn(async ({ value }) => { if (value === 2) throw new Error("engine rejected"); return { value }; }));
    const result = await runWorkbenchBatch(schema.parse({ steps: [1, 2, 3].map(value => ({ tool: "edit", arguments: { value } })) }), fakeClient(), [tool]);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ executed: 2, remaining: 1, stoppedReason: "step_error" });
    expect(tool.apiFunc).toHaveBeenCalledTimes(2);
  });

  it("can collect independent failures while preserving an overall error", async () => {
    const tool = makeTool(vi.fn(async () => { throw new Error("failed"); }));
    const result = await runWorkbenchBatch(schema.parse({ steps: [{ tool: "edit" }, { tool: "edit" }], stopOnError: false }), fakeClient(), [tool]);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ executed: 2, remaining: 0 });
  });

  it("honors mode guards and foreground checks without executing a mutation", async () => {
    const tool = makeTool();
    const blocked = await runWorkbenchBatch(schema.parse({ steps: [{ tool: "edit" }] }), fakeClient({ state: { mode: "play" } }), [tool]);
    expect(blocked.isError).toBe(true);
    expect(tool.apiFunc).not.toHaveBeenCalled();
    const foreground = await runWorkbenchBatch(schema.parse({ steps: [{ tool: "wb_editor_module", arguments: { module: "audioEditor", action: "open" } }] }), fakeClient(), editorModuleTools);
    expect(foreground.structuredContent).toMatchObject({ executed: 0, outcome: "blocked" });
  });

  it("respects cancellation before the first step", async () => {
    const tool = makeTool();
    const result = await runWorkbenchBatch(schema.parse({ steps: [{ tool: "edit" }] }), fakeClient(), [tool], AbortSignal.abort());
    expect(result.structuredContent).toMatchObject({ executed: 0, stoppedReason: "cancelled" });
    expect(tool.apiFunc).not.toHaveBeenCalled();
  });

  it("bounds response size and stops further mutations after oversized output", async () => {
    const tool = makeTool(vi.fn(async () => ({ huge: "x".repeat(250_000) })));
    const result = await runWorkbenchBatch(schema.parse({ steps: [{ tool: "edit" }, { tool: "edit" }] }), fakeClient(), [tool]);
    expect(result.structuredContent).toMatchObject({ executed: 1, remaining: 1, stoppedReason: "output_budget" });
    expect(JSON.stringify(result).length).toBeLessThan(3000);
  });
});

describe("Workbench capabilities", () => {
  it("reports offline routes without I/O and probes all supported modules only on request", async () => {
    const handlers: Record<string, any> = {};
    const server = { registerTool: (name: string, _schema: unknown, callback: unknown) => { handlers[name] = callback; } } as unknown as McpServer;
    const call = vi.fn(async (name, input) => name === "GetLoadedProjects" ? { "Loaded Projects": ["ActualAddon"] } : { status: "ok", mode: "edit", module: input?.module, result: 1 });
    registerWorkbenchWorkflows(server, { projectPath: "root", defaultMod: "DifferentFolder" } as Config, fakeClient({ call }), [...stateTools, ...projectTools, ...editorModuleTools]);
    const offline = await handlers.wb_capabilities({ live: false });
    expect(call).not.toHaveBeenCalled();
    expect(offline.structuredContent.editors).toHaveLength(9);
    const live = await handlers.wb_capabilities({ live: true });
    expect(live.structuredContent.configuredDefaultMod).toBe("DifferentFolder");
    expect(live.structuredContent.live.projects.data["Loaded Projects"]).toEqual(["ActualAddon"]);
    expect(Object.keys(live.structuredContent.live.modules)).toEqual(EDITOR_ROUTES.map(e => e.module));
    expect(call.mock.calls.filter(c => c[0] === "EMCP_WB_EditorModule").every(c => c[1].action === "state")).toBe(true);
  });
});
