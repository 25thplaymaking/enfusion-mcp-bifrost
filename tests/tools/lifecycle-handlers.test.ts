/**
 * Handler-level checks for the Workbench lifecycle tools, driven through the
 * real registered handlers with a fake MCP server and a fake Workbench client.
 * These cover the field failures that cannot be reproduced without a running
 * editor: a reload refused mid-transition, and wb_stop called in edit mode.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { WorkbenchError, type WorkbenchClient } from "../../src/workbench/client.js";
import { registerWbReload } from "../../src/tools/wb-reload.js";
import { registerWbEditorTools } from "../../src/tools/wb-editor.js";
import type { Config } from "../../src/config.js";

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

function captureTools(register: (server: any) => void): Map<string, Handler> {
  const tools = new Map<string, Handler>();
  register({ registerTool: (name: string, _schema: unknown, handler: Handler) => tools.set(name, handler) });
  return tools;
}

function fakeClient(mode: "edit" | "play", onCall: (fn: string) => unknown): WorkbenchClient {
  const state = { connected: true, mode, lastUpdated: Date.now() };
  return {
    get state() { return state; },
    async call(fn: string) { state.lastUpdated = Date.now(); return onCall(fn); },
    async refreshState() { state.lastUpdated = Date.now(); return state; },
    markStale() { state.lastUpdated = 0; },
  } as unknown as WorkbenchClient;
}

const profile = mkdtempSync(join(tmpdir(), "emcp-lifecycle-"));
mkdirSync(join(profile, "logs", "logs_2026-10-11_00-00-00"), { recursive: true });
writeFileSync(join(profile, "logs", "logs_2026-10-11_00-00-00", "script.log"), "SCRIPT       : older session line\n");
afterAll(() => rmSync(profile, { recursive: true, force: true }));

describe("wb_reload handler", () => {
  it("reports a refused reload (no compile block) as Reload Refused, not a compile failure", async () => {
    const client = fakeClient("edit", (fn) => {
      if (fn === "ReloadScripts") throw new WorkbenchError("Workbench error: Compilation failed", "API_ERROR");
      return {};
    });
    const tools = captureTools((s) => registerWbReload(s, { workbenchProfile: profile } as Config, client));
    const result = await tools.get("wb_reload")!({ target: "scripts" });
    const text = result.content[0].text;
    expect(result.isError).toBe(true);
    expect(text).toContain("Reload Refused — no compile ran");
    expect(text).not.toContain("Compile Failed");
  }, 15_000);

  it("still reports a real compile error with its file and line", async () => {
    const log = join(profile, "logs", "logs_2026-10-11_00-00-00", "script.log");
    const client = fakeClient("edit", (fn) => {
      if (fn === "ReloadScripts") {
        writeFileSync(log, 'SCRIPT       : Compiling Game scripts\nSCRIPT    (E): @"Scripts/Game/TAG_Thing.c,12": Broken expression (missing \';\'?)\n', { flag: "a" });
        throw new WorkbenchError("Workbench error: Compilation failed", "API_ERROR");
      }
      return {};
    });
    const tools = captureTools((s) => registerWbReload(s, { workbenchProfile: profile } as Config, client));
    const result = await tools.get("wb_reload")!({ target: "scripts" });
    const text = result.content[0].text;
    expect(result.isError).toBe(true);
    expect(text).not.toContain("Reload Refused");
    expect(text).toContain("Scripts/Game/TAG_Thing.c:12");
  }, 15_000);
});

describe("wb_stop handler", () => {
  it("succeeds without calling the editor when already in edit mode", async () => {
    const calls: string[] = [];
    const client = fakeClient("edit", (fn) => { calls.push(fn); return { mode: "edit" }; });
    const tools = captureTools((s) => registerWbEditorTools(s, client));
    const result = await tools.get("wb_stop")!({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Already in Edit Mode");
    expect(calls).not.toContain("EMCP_WB_EditorControl");
  });
});
