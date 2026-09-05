import { describe, expect, it, vi } from "vitest";
import { projectTools } from "../../src/tools/wb-projects.js";
import { prefabTools } from "../../src/tools/wb-prefabs.js";
import { scriptEditorTools } from "../../src/tools/wb-script-editor.js";
import { fakeClient } from "../workbench/fake-client.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

describe("shipped Workbench handler contracts", () => {
  it("accepts the native Loaded Projects key and rejects unknown response shapes", () => {
    const tool = projectTools[0];
    expect(tool.formatter({ input: { action: "list" }, result: { "Loaded Projects": ["ArmaReforger", "ActualAddon"] } }).text).toContain("ActualAddon");
    expect(tool.formatter({ input: { action: "list" }, result: {} }).isError).toBe(true);
  });

  it("sends LocateProject a normalized path and reports the engine project name", async () => {
    const call = vi.fn(async () => ({ status: "OK", projectName: "ActualAddon", projectPath: "C:/mods/ActualAddon/" }));
    const result = await projectTools[0].apiFunc({ action: "locate", path: "C:\\mods\\ActualAddon\\Prefabs" }, fakeClient({ call }));
    expect(call).toHaveBeenCalledWith("LocateProject", { path: "C:/mods/ActualAddon/Prefabs/" });
    expect(projectTools[0].formatter({ input: { action: "locate", path: "C:/mods/ActualAddon/Prefabs" }, result }).text).toContain("**Name:** ActualAddon");
  });

  it("sends prefabPath for GUID lookup, not the previously ignored path key", async () => {
    const call = vi.fn(async () => ({ status: "OK", guid: "1234567890ABCDEF" }));
    await prefabTools[0].apiFunc({ action: "getGuid", templatePath: "Prefabs/A.et" }, fakeClient({ call }));
    expect(call).toHaveBeenCalledWith("GetPrefabGUID", { prefabPath: "Prefabs/A.et" });
  });

  it("discovers bounded prefab sources without invoking engine filesystem authorization", async () => {
    const root = mkdtempSync(join(tmpdir(), "enfusion-prefab-test-"));
    try {
      mkdirSync(join(root, "Prefabs"));
      writeFileSync(join(root, "Prefabs", "A.et"), "GenericEntity {}");
      writeFileSync(join(root, "Prefabs", "B.et"), "GenericEntity {}");
      const call = vi.fn();
      const result = await prefabTools[0].apiFunc({ action: "locate", searchPath: root, maxResults: 1 }, fakeClient({ call }));
      expect(call).not.toHaveBeenCalled();
      expect(result).toMatchObject({ source: "filesystem", partial: true, stopReason: "result_limit" });
      expect(result.prefabsPaths).toHaveLength(1);
      expect(prefabTools[0].formatter({ input: { action: "locate", searchPath: root }, result }).text).toContain("Prefabs/A.et");
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir()))) throw new Error("Unexpected fixture root");
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders actual Script Editor currentFile and lineText fields", () => {
    const tool = scriptEditorTools[0];
    expect(tool.formatter({ input: { action: "getCurrentFile" }, result: { currentFile: "Scripts/A.c" } }).text).toContain("Scripts/A.c");
    expect(tool.formatter({ input: { action: "getLine", line: 0 }, result: { lineText: "class A {}" } }).text).toContain("class A {}");
    expect(tool.inputSchema.line.safeParse(0).success).toBe(true);
    expect(tool.inputSchema.line.safeParse(-1).success).toBe(false);
    expect(tool.inputSchema.line.safeParse(0.5).success).toBe(false);
  });
});
