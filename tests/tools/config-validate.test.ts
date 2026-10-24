import { describe, it, expect, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { runModChecks } from "../../src/tools/mod.js";

const TEST_DIR = resolve(import.meta.dirname, "../../tmp-test-config-validate");

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

afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe("mod validate: configs check", () => {
  it("passes a valid .conf whose classes are all in the API index", () => {
    setup({
      "Configs/Factions/TestFaction.conf": `SCR_Faction {
 m_sKey "test_faction"
 m_sName "Test Faction"
 m_Color "0,100,200,255"
}`,
    });

    const { issues, passedChecks } = runModChecks(TEST_DIR, ["configs"], classIndex());
    expect(issues).toEqual([]);
    expect(passedChecks).toEqual(["configs"]);
  });

  it("errors on a .conf that does not parse", () => {
    setup({
      "Configs/Bad.conf": "SCR_Faction {\n m_sKey \"x\"\n",
    });

    const { issues } = runModChecks(TEST_DIR, ["configs"], classIndex());
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe("error");
    expect(issues[0].message).toMatch(/^Configs\/Bad\.conf: Invalid config format/);
  });

  it("warns on root and nested classes missing from the API index", () => {
    setup({
      "Missions/MissionHeader.conf": `OtherMod_MissionHeader {
 m_sName "Test Scenario"
 m_Entries {
  OtherMod_Entry "{AAAAAAAAAAAAAAAA}" {
  }
 }
}`,
    });

    const { issues } = runModChecks(
      TEST_DIR,
      ["configs"],
      classIndex(["OtherMod_MissionHeader", "OtherMod_Entry"])
    );
    const warnings = issues.filter((i) => i.level === "warning").map((i) => i.message);
    expect(warnings).toContain(
      'Missions/MissionHeader.conf: Root class "OtherMod_MissionHeader" not found in API index — may be from another mod or misspelled.'
    );
    expect(warnings).toContain('Missions/MissionHeader.conf: Class "OtherMod_Entry" not found in API index.');
  });

  it("passes an addon with no config files", () => {
    setup({
      "Scripts/Game/Test.c": "class Test {}",
    });

    const { issues, passedChecks } = runModChecks(TEST_DIR, ["configs"], classIndex());
    expect(issues).toEqual([]);
    expect(passedChecks).toEqual(["configs"]);
  });
});
