import { describe, expect, it } from "vitest";
import { editorModuleTools } from "../../src/tools/wb-editor-module.js";

const t = editorModuleTools[0];

describe("wb_editor_module — foreground safety", () => {
  it("requires explicit permission before opening an editor or resource", () => {
    expect(t.validate!({ action: "open" })).toContain("can activate Workbench");
    expect(t.validate!({ action: "open", allowForeground: true })).toBeNull();
    expect(t.validate!({ action: "openResource", resourcePath: "A.et" })).toContain(
      "can activate Workbench"
    );
    expect(
      t.validate!({ action: "openResource", resourcePath: "A.et", allowForeground: true })
    ).toBeNull();
  });

  it("leaves background-safe state and save operations unblocked", () => {
    expect(t.validate!({ action: "state" })).toBeNull();
    expect(t.validate!({ action: "save" })).toBeNull();
  });

  it("blocks compile/reload actions inside the replying handler", () => {
    expect(
      t.validate!({
        action: "executeAction",
        menuPath: "Build,Compile All",
        allowForeground: true,
      })
    ).toContain("cannot run inside a custom NET API reply");
    expect(
      t.validate!({ action: "executeAction", menuPath: "Edit,Undo" })
    ).toContain("can activate Workbench");
  });
});
