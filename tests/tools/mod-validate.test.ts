import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { runModChecks } from "../../src/tools/mod.js";

const TEST_DIR = resolve(import.meta.dirname, "../../tmp-test-validate");

/** Every class is "known" unless listed here. */
function classIndex(unknown: string[] = []) {
  return { hasClass: (name: string) => !unknown.includes(name) };
}

function setup(files: Record<string, string>) {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TEST_DIR, path);
    mkdirSync(resolve(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
}

function messages(level: "error" | "warning" | "info", issues: { level: string; message: string }[]) {
  return issues.filter((i) => i.level === level).map((i) => i.message);
}

const GOOD_GPROJ = `GameProject {
 ID "TestMod"
 GUID "AAAAAAAAAAAAAAAA"
 TITLE "Test Mod"
 Dependencies {
  "58D0FB3206B6F859"
 }
}`;

afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe("mod validate checks", () => {
  it("passes every check on a well-formed addon", () => {
    setup({
      "TestMod.gproj": GOOD_GPROJ,
      "Scripts/Game/TM_Test.c": `class TM_Test : ScriptComponent
{
  override void EOnInit(IEntity owner)
  {
  }
}
`,
      "Prefabs/Test.et": `GenericEntity {
 ID "BBBBBBBBBBBBBBBB"
}`,
    });

    const { issues, passedChecks } = runModChecks(TEST_DIR, undefined, classIndex());
    expect(issues).toEqual([]);
    expect(passedChecks).toEqual(["structure", "gproj", "scripts", "prefabs", "configs", "references", "naming"]);
  });

  it("flags a script outside a valid module folder as an error", () => {
    setup({
      "TestMod.gproj": GOOD_GPROJ,
      "BadScript.c": `class BadClass
{
}`,
      "Scripts/Game/Good.c": `class TM_Good : ScriptComponent
{
}`,
    });

    const { issues, passedChecks } = runModChecks(TEST_DIR, ["scripts"], classIndex());
    const errors = messages("error", issues);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("BadScript.c");
    expect(errors[0]).toContain("silently ignored");
    expect(passedChecks).not.toContain("scripts");
  });

  it("flags a missing base game dependency", () => {
    setup({
      "TestMod.gproj": `GameProject {
 ID "TestMod"
 GUID "AAAAAAAAAAAAAAAA"
 Dependencies {
 }
}`,
    });

    const { issues } = runModChecks(TEST_DIR, ["gproj"], classIndex());
    expect(messages("error", issues)).toEqual([
      "TestMod.gproj: Missing base game dependency (58D0FB3206B6F859)",
    ]);
  });

  it("flags a missing Dependencies block and a malformed GUID", () => {
    setup({
      "TestMod.gproj": `GameProject {
 ID "TestMod"
 GUID "NOT-A-GUID"
}`,
    });

    const { issues } = runModChecks(TEST_DIR, ["gproj"], classIndex());
    expect(messages("error", issues)).toEqual(["TestMod.gproj: Missing Dependencies block — mod won't load"]);
    expect(messages("warning", issues)).toEqual([
      'TestMod.gproj: GUID "NOT-A-GUID" is not a valid 16-char hex string',
    ]);
  });

  it("flags a prefab that does not parse", () => {
    setup({
      "TestMod.gproj": GOOD_GPROJ,
      "Prefabs/Bad.et": "GenericEntity {\n ID \"BBBBBBBBBBBBBBBB\"\n",
    });

    const { issues } = runModChecks(TEST_DIR, ["prefabs"], classIndex());
    const errors = messages("error", issues);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Prefabs\/Bad\.et: Invalid prefab format/);
  });

  it("flags a missing .gproj and a missing Scripts/Game folder", () => {
    setup({
      "Scripts/Test.c": `class Test { }`,
    });

    const { issues } = runModChecks(TEST_DIR, ["structure"], classIndex());
    expect(messages("error", issues)).toEqual(["No .gproj file found in project root"]);
    expect(messages("warning", issues)).toEqual(["Missing expected directory: Scripts/Game"]);
  });

  it("warns when a script extends a class missing from the API index", () => {
    setup({
      "TestMod.gproj": GOOD_GPROJ,
      "Scripts/Game/TM_Thing.c": `class TM_Thing : OtherMod_Base
{
}`,
    });

    const { issues } = runModChecks(TEST_DIR, ["references"], classIndex(["OtherMod_Base"]));
    expect(messages("warning", issues)).toEqual([
      'Scripts/Game/TM_Thing.c: Extends "OtherMod_Base" which is not in the API index (may be from another mod)',
    ]);
  });

  it("reports classes that break the dominant prefix", () => {
    setup({
      "TestMod.gproj": GOOD_GPROJ,
      "Scripts/Game/TM_A.c": "class TM_A {}",
      "Scripts/Game/TM_B.c": "class TM_B {}",
      "Scripts/Game/XX_C.c": "class XX_C {}",
    });

    const { issues } = runModChecks(TEST_DIR, ["naming"], classIndex());
    expect(messages("info", issues)).toEqual([
      '1 class(es) use prefix "XX_" instead of the most common prefix "TM_"',
    ]);
  });
});
