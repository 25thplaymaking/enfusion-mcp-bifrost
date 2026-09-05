import { describe, it, expect } from "vitest";
import { resourceTools } from "../../src/tools/wb-resources.js";

const t = resourceTools[0];

describe("wb_resources — exported data seam", () => {
  it("exports a single tool named wb_resources", () => {
    expect(resourceTools.map((e) => e.name)).toEqual(["wb_resources"]);
  });
});

describe("wb_resources — requireMode + modeAction", () => {
  it("requires explicit foreground permission only when opening a resource", () => {
    expect(t.validate!({ action: "open", path: "P.et" })).toContain("can activate Workbench");
    expect(t.validate!({ action: "open", path: "P.et", allowForeground: true })).toBeNull();
    expect(t.validate!({ action: "getInfo", path: "P.et" })).toBeNull();
  });

  it("does not require a world for Resource Manager operations", () => {
    expect(t.requireMode!({ action: "register" })).toBeNull();
    expect(t.requireMode!({ action: "rebuild" })).toBeNull();
    expect(t.requireMode!({ action: "getInfo" })).toBeNull();
    expect(t.requireMode!({ action: "open" })).toBeNull();
  });

  it("derives the guard phrase per action", () => {
    const modeAction = t.modeAction as (input: unknown) => string;
    expect(modeAction({ action: "register" })).toBe("register resource");
    expect(modeAction({ action: "rebuild" })).toBe("rebuild resource");
  });
});

describe("wb_resources — formatter", () => {
  it("renders resource info with known and unknown keys", () => {
    const { text } = t.formatter({
      result: {
        guid: "0xABC",
        type: "Prefab",
        size: 128,
        dependencies: ["Dep/A.et", "Dep/B.et"],
        custom: { nested: true },
      },
      input: { action: "getInfo", path: "Prefabs/A.et" },
    });
    expect(text).toContain("**Resource Info**");
    expect(text).toContain("- **Path:** Prefabs/A.et");
    expect(text).toContain("- **GUID:** 0xABC");
    expect(text).toContain("- **Type:** Prefab");
    expect(text).toContain("- **Size:** 128");
    expect(text).toContain("### Dependencies (2)");
    expect(text).toContain("- Dep/A.et");
    expect(text).toContain('- **custom:** {"nested":true}');
  });

  it("labels register/rebuild/open success", () => {
    expect(
      t.formatter({ result: {}, input: { action: "register", path: "P.et" } }).text
    ).toContain("**Registered resource: P.et**");
    expect(
      t.formatter({ result: {}, input: { action: "rebuild", path: "P.et" } }).text
    ).toContain("Requested resource rebuild for: P.et; completion is unconfirmed");
    expect(
      t.formatter({ result: { message: "done" }, input: { action: "open", path: "P.et" } }).text
    ).toContain("**Opened resource: P.et**\n\ndone");
  });
});
