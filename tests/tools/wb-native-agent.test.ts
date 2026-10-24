import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../../src/config.js";
import { editorModuleTools } from "../../src/tools/wb-editor-module.js";
import { scriptEditorTools } from "../../src/tools/wb-script-editor.js";
import { runWorkbenchTool } from "../../src/workbench/define-tool.js";
import { registerWbBridge, inspectBridge, writeBridgeFiles } from "../../src/tools/wb-bridge.js";
import { readRuntimeLog, registerWbDebug } from "../../src/tools/wb-debug.js";
import { fakeClient } from "../workbench/fake-client.js";

const inspector = editorModuleTools[0];
const input = (fields: Record<string, unknown>) => z.object(inspector.inputSchema).parse({ module: "worldEditor", action: "inspect", ...fields });
const mutation = { action: "setProperty", expectedTarget: "epoch|entity", expectedValue: "1", propertyKey: "Scale", valueType: "number", value: 2 };

describe("native inspector boundaries", () => {
  it("requires inspection and enforces native value shapes before I/O", async () => {
    const call = vi.fn();
    for (const fields of [ { ...mutation, expectedTarget: undefined }, { ...mutation, value: "2" }, { ...mutation, valueType: "vector3" }, { ...mutation, valueType: "integer", value: 1.5 }, { ...mutation, entityId: "id", entityIndex: 1 } ]) {
      const result = await runWorkbenchTool(inspector, input(fields), fakeClient({ call }));
      expect(result.isError).toBe(true);
    }
    expect(call).not.toHaveBeenCalled();
  });
  it("rejects malformed or excessively deep node paths", () => {
    for (const objectPath of ["child:-1", "array:Items:x", "component:2/", Array(17).fill("object:A").join("/")]) expect(() => input({ objectPath })).toThrow();
    expect(input({ objectPath: "component:0/array:Items:2/object:Settings" }).objectPath).toContain("Items:2");
  });
  it("accepts numeric wire normalization but refuses false readback claims", async () => {
    const call = vi.fn(async () => ({ bridgeVersion: "0.15.0", result: 1, applied: 1, verified: 1, beforeValue: "1", afterValue: "2.000000" }));
    const result = await runWorkbenchTool(inspector, input(mutation), fakeClient({ call }));
    expect(result.isError).not.toBe(true);
    expect(call.mock.calls[0]).toEqual(["EMCP_WB_EditorModule", expect.objectContaining({ value: "2", checkValue: true, expectedValue: "1" })]);
    call.mockResolvedValueOnce({ bridgeVersion: "0.15.0", result: 1, applied: 1, verified: 1, beforeValue: "1", afterValue: "1" });
    expect((await runWorkbenchTool(inspector, input(mutation), fakeClient({ call }))).isError).toBe(true);
  });
  it("does not claim support from an older installed handler", async () => {
    const result = await runWorkbenchTool(inspector, input({}), fakeClient({ call: async () => ({ status: "ok" }) }));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Bridge version mismatch");
  });
  it("permits non-world native editing when no world is open", () => {
    expect(inspector.requireMode!(input({ ...mutation, module: "audioEditor" }))).toBeNull();
  });
});

describe("buffer conflict evidence", () => {
  const tool = scriptEditorTools[0];
  it("requires current file, size and exact line, including an empty line", () => {
    expect(tool.validate!({ action: "setLine", line: 0, text: "new" })).toContain("expectedFile");
    expect(tool.validate!({ action: "setLine", line: 0, text: "new", expectedFile: "A.c", expectedLinesCount: 2, expectedText: "" })).toBeNull();
    expect(tool.validate!({ action: "save" })).toContain("expectedFile");
    expect(tool.formatter({ input: { action: "setLine" }, result: { status: "ok", verified: false } }).isError).toBe(true);
  });
  it("normalizes wire booleans without corrupting line counts and requires explicit Save All", async () => {
    const call = vi.fn(async () => ({ status: "ok", verified: 1, dispatched: 0, partial: 0, currentLine: 0, linesCount: 1, lineText: "new" }));
    const input = z.object(tool.inputSchema).parse({ action: "setLine", line: 0, text: "new", expectedFile: "A.c", expectedLinesCount: 1, expectedText: "old" });
    const result = await runWorkbenchTool(tool, input, fakeClient({ call }));
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent?.data).toMatchObject({ verified: true, dispatched: false, partial: false, currentLine: 0, linesCount: 1 });
    expect(tool.validate!({ action: "saveAll", expectedFile: "A.c" })).toContain("allowForeground");
    expect(tool.validate!({ action: "saveAll", expectedFile: "A.c", allowForeground: true })).toBeNull();
  });
});

describe("bridge and documentation deployment", () => {
  it("checks the loaded project, hashes existing files, and preflights before writes", async () => {
    const root = mkdtempSync(join(tmpdir(), "emcp-native-test-"));
    try {
      writeFileSync(join(root, "addon.gproj"), "GameProject {}");
      const config = { projectPath: root } as Config;
      await expect(inspectBridge(root, fakeClient({ call: async () => ({ projectPath: tmpdir(), projectName: "Wrong" }) }))).rejects.toThrow("native located project");
      const snapshot = await inspectBridge(root, fakeClient({ call: async () => ({ projectPath: root, projectName: "Right" }) }));
      expect(snapshot.projectId).toBe("Right");
      expect(snapshot.files.some(f => f.path.endsWith("EMCP_WB_Inspector.c"))).toBe(true);
      const files = [{ path: "Docs/one.md", content: "one", changed: true, previousSha256: null }, { path: "../bad.c", content: "bad", changed: true, previousSha256: null }];
      expect(() => writeBridgeFiles(root, files, config, false)).toThrow();
      expect(readdirSync(root)).toEqual(["addon.gproj"]);
      writeBridgeFiles(root, files.slice(0, 1), config, false);
      expect(readFileSync(join(root, "Docs/one.md"), "utf8")).toBe("one");
      expect(() => writeBridgeFiles(root, files.slice(0, 1), config, false)).toThrow("CONFLICT");
      const previousSha256 = createHash("sha256").update("one").digest("hex");
      writeBridgeFiles(root, [{ ...files[0], previousSha256, content: "two" }], config, false);
      expect(readFileSync(join(root, "Docs/one.md"), "utf8")).toBe("two");
      expect(readdirSync(join(root, "Docs"))).toEqual(["one.md"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("deploys docs idempotently and protects locally edited documentation", async () => {
    const root = mkdtempSync(join(tmpdir(), "emcp-native-docs-"));
    const handlers: Record<string, any> = {};
    const server = { registerTool: (n: string, _s: unknown, f: unknown) => { handlers[n] = f; }, registerResource: vi.fn() } as unknown as McpServer;
    try {
      registerWbBridge(server, { projectPath: root } as Config, fakeClient());
      const args = { action: "deploy", projectPath: root, overwrite: false, dryRun: false };
      const result = await handlers.wb_docs(args);
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent.written).toHaveLength(3);
      expect((await handlers.wb_docs(args)).structuredContent.written).toEqual([]);
      writeFileSync(join(root, "Docs/EnfusionMCP/NATIVE_AGENT_WORKFLOW.md"), "user notes");
      expect((await handlers.wb_docs(args)).isError).toBe(true);
      expect(readFileSync(join(root, "Docs/EnfusionMCP/NATIVE_AGENT_WORKFLOW.md"), "utf8")).toBe("user notes");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("runtime debugging evidence", () => {
  it("reports panel toggles without claiming the pane is visible", async () => {
    const handlers: Record<string, any> = {};
    const server = { registerTool: (n: string, _s: unknown, f: unknown) => { handlers[n] = f; } } as unknown as McpServer;
    const call = vi.fn(async () => ({ result: true }));
    registerWbDebug(server, {} as Config, fakeClient({ call }));
    const result = await handlers.wb_debug({ action: "togglePanel", panel: "Watch", allowForeground: true });
    expect(result.structuredContent).toMatchObject({ outcome: "dispatched", visibility: "unobserved" });
    expect(call).toHaveBeenLastCalledWith("EMCP_WB_EditorModule", expect.objectContaining({ menuPath: "Window,Watch" }));
  });
  it("pages UTF-8 by actual byte offsets and resets after log truncation/rotation", () => {
    const root = mkdtempSync(join(tmpdir(), "emcp-debug-"));
    try {
      const session = join(root, "logs/logs_2026-09-05_10-00-00");
      mkdirSync(session, { recursive: true });
      const file = join(session, "script.log");
      writeFileSync(file, 'normal ü\nSCRIPT (E): @"Scripts/A.c,7": bad expression\nFunction: Execute\n');
      const first = readRuntimeLog(root, "script.log", undefined, 1);
      const second = readRuntimeLog(root, "script.log", first.nextCursor, 1);
      expect(first.lines).toEqual(["normal ü"]);
      expect(second.diagnostics[0]).toMatchObject({ severity: "error", file: "Scripts/A.c", line: 7 });
      const third = readRuntimeLog(root, "script.log", second.nextCursor, 1);
      expect(third.lines).toEqual(["Function: Execute"]);
      expect(third.hasMore).toBe(false);
      writeFileSync(file, "new\n");
      expect(readRuntimeLog(root, "script.log", third.nextCursor, 10).reset).toBe(true);
      const rotated = join(root, "logs/logs_2026-09-05_11-00-00");
      mkdirSync(rotated); writeFileSync(join(rotated, "script.log"), "fresh\n");
      expect(readRuntimeLog(root, "script.log", first.nextCursor, 10)).toMatchObject({ reset: true, lines: ["fresh"] });
      expect(readRuntimeLog(root, "error.log").available).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("requires actual runtime observation before debugger step dispatch", async () => {
    const handlers: Record<string, any> = {};
    const server = { registerTool: (n: string, _s: unknown, f: unknown) => { handlers[n] = f; } } as unknown as McpServer;
    const call = vi.fn(async () => ({ result: true }));
    registerWbDebug(server, {} as Config, fakeClient({ call }));
    const base = { action: "command", command: "stepOver", expectedFile: "A.c", allowForeground: true, runtimeObserved: false, debugTarget: "external" };
    expect((await handlers.wb_debug(base)).isError).toBe(true);
    expect(call).not.toHaveBeenCalled();
    const pausedWorkbench = await handlers.wb_debug({ ...base, runtimeObserved: true, debugTarget: "workbench" });
    expect(pausedWorkbench.structuredContent.outcome).toBe("computer_use_required");
    expect(call).not.toHaveBeenCalled();
    const result = await handlers.wb_debug({ ...base, runtimeObserved: true });
    expect(result.structuredContent).toMatchObject({ outcome: "dispatched", debuggerStateConfirmed: false });
    expect(call).toHaveBeenCalledWith("EMCP_WB_EditorModule", expect.objectContaining({ expectedFile: "A.c", menuPath: "Debug,Step Over" }));
  });
});
