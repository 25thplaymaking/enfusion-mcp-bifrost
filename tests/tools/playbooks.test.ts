import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import {
  searchPlaybooks,
  playbookCatalogue,
  playbookFilesOnDisk,
  __resetPlaybookCache,
} from "../../src/tools/playbook-loader.js";
import { buildIndex, parseFrontMatter } from "../../scripts/build-playbook-index.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KB_DIR = join(REPO, "data", "kb");

describe("playbook index integrity", () => {
  // The whole layer is worthless if a playbook exists but cannot be found, which
  // is precisely how the KB's animation/ subtree became unreachable. These tests
  // make that failure loud instead of silent.
  it("indexes every playbook .md on disk", () => {
    const { entries, errors } = buildIndex();
    expect(errors, "Playbook front-matter errors").toEqual([]);
    const onDisk = playbookFilesOnDisk(KB_DIR).map((f) => f.replace(/\.md$/, ""));
    const listed = new Set(entries.map((e) => e.id));
    expect(
      onDisk.filter((p) => !listed.has(p)),
      "Playbooks on disk with no index entry — run: npx tsx scripts/build-playbook-index.ts"
    ).toEqual([]);
  });

  it("has no seeAlso pointer to a playbook that does not exist", () => {
    const { errors } = buildIndex();
    expect(errors.filter((e) => e.includes("seeAlso"))).toEqual([]);
  });

  it("gives every playbook a title, goal and at least one trigger", () => {
    const { entries } = buildIndex();
    for (const pb of entries) {
      expect(pb.title.trim(), pb.id).not.toBe("");
      expect(pb.goal.trim(), `${pb.id} goal`).not.toBe("");
      expect(pb.triggers.length, `${pb.id} triggers`).toBeGreaterThan(0);
    }
  });

  it("has a playbook for every domain the tool advertises", () => {
    // wb_playbook's description promises these. If one is missing, the tool
    // description is lying, and an agent will trust it and give up.
    const { entries } = buildIndex();
    const blob = `${entries.map((e) => `${e.id} ${e.title} ${e.goal} ${e.triggers.join(" ")}`).join(" ")}`.toLowerCase();
    for (const domain of [
      "layout",
      "menu",
      "script",
      "prefab",
      "config",
      "addon",
      "blender",
      "model",
      "animation",
      "particle",
      "terrain",
    ]) {
      expect(blob.includes(domain), `No playbook covers "${domain}"`).toBe(true);
    }
  });

  it("has a playbook for every KB domain that carries real content", () => {
    // Six KB domains originally had documentation and NO task entry point:
    // AI_And_Behavior, Audio_And_Sound, GameModes_And_Scenarios,
    // Inventory_And_Damage, Vehicles_And_Physics, Weapons_And_Attachments. An
    // agent holding "add a weapon" had a 16 KB topic doc and nothing that told it
    // the order to do things in. This test exists so a new domain cannot quietly
    // repeat that.
    //
    // Coverage is asserted by DECLARED IDENTITY (the ids below), NOT by scanning
    // for a keyword. A keyword test passes on a false positive — "weapon sound"
    // in the audio playbook's triggers made this very test report weapons as
    // covered while no weapon playbook existed. Identity does not lie.
    const REQUIRED = [
      "create-a-layout",
      "create-a-menu",
      "scaffold-a-new-addon",
      "write-an-enforcescript-component",
      "replicate-state-to-clients",
      "add-a-prefab",
      "create-a-config",
      "live-workbench-session",
      "import-a-model-from-blender",
      "create-a-model-in-workbench",
      "author-an-animation-graph",
      "create-a-particle-effect",
      "author-terrain-for-a-map",
      "create-a-game-mode",
      "add-a-sound",
      "react-to-damage",
      "author-ai-behaviour",
      "add-a-weapon",
      "add-a-vehicle",
    ];

    const { entries, errors } = buildIndex();
    expect(errors, "front-matter errors").toEqual([]);
    const ids = new Set(entries.map((e) => e.id));
    const missing = REQUIRED.filter((id) => !ids.has(id));
    expect(
      missing,
      `Domains that have KB documentation but no task playbook: ${missing.join(", ")}. ` +
        `An agent holding that task gets a topic dump and no ordering.`
    ).toEqual([]);
  });

  it("keeps each playbook short enough to be read in one go", () => {
    // A playbook that has grown into a reference doc defeats the purpose; that
    // material belongs in data/kb/patterns/. The tool truncates at 24 K chars,
    // so anything past that is unread in practice.
    for (const file of playbookFilesOnDisk(KB_DIR)) {
      const abs = join(KB_DIR, "playbooks", file);
      const size = readFileSync(abs, "utf-8").length;
      expect(size, `${file} is ${size} chars — split the reference material into the KB`).toBeLessThan(24_000);
    }
  });

  it("has real content behind every index entry", () => {
    const { entries } = buildIndex();
    for (const pb of entries) {
      expect(existsSync(join(KB_DIR, "playbooks", `${pb.id}.md`)), `${pb.id}.md`).toBe(true);
    }
  });
});

describe("front-matter parser", () => {
  it("parses inline lists, block lists, scalars and booleans", () => {
    const parsed = parseFrontMatter(
      ["---", "id: thing", "title: A Thing", "humanStep: true", "tools: [a, b]", "triggers:", "  - x", "  - y", "---", "body"].join("\n")
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.data.id).toBe("thing");
    expect(parsed!.data.humanStep).toBe("true");
    expect(parsed!.data.tools).toEqual(["a", "b"]);
    expect(parsed!.data.triggers).toEqual(["x", "y"]);
    expect(parsed!.body.trim()).toBe("body");
  });

  it("returns null for a missing or unterminated block", () => {
    expect(parseFrontMatter("# no front matter")).toBeNull();
    expect(parseFrontMatter("---\nid: x\nnever closed")).toBeNull();
  });
});

describe("searchPlaybooks — routing a task to its procedure", () => {
  beforeAll(() => __resetPlaybookCache());

  const ids = (q: string, n = 3): string[] => searchPlaybooks(KB_DIR, q, n).playbooks.map((p) => p.id);

  it("shows the catalogue for an empty or list query", () => {
    for (const q of ["", "catalogue", "list", "index"]) {
      expect(searchPlaybooks(KB_DIR, q, 3).showCatalogue, q).toBe(true);
    }
  });

  it("resolves an exact id", () => {
    expect(ids("create-a-layout")).toContain("create-a-layout");
  });

  it.each([
    ["make me a hud layout"],
    ["i want to import a truck from blender"],
    ["set up terrain for a new map"],
    ["add a particle effect"],
    ["write an enforcescript component"],
    ["animate a character"],
    ["create a new addon from scratch"],
  ])("routes %j to a real playbook instead of the catalogue", (q) => {
    const r = searchPlaybooks(KB_DIR, q, 3);
    expect(
      r.showCatalogue,
      `"${q}" matched nothing — the agent gets the catalogue and has to guess`
    ).toBe(false);
    expect(r.playbooks.length).toBeGreaterThan(0);
  });

  it("returns the playbook body, not just metadata", () => {
    const r = searchPlaybooks(KB_DIR, "create a layout", 1);
    expect(r.playbooks[0].content.length).toBeGreaterThan(300);
    expect(r.playbooks[0].content).toMatch(/##\s*(Before you start|Steps)/);
  });

  it("strips YAML front-matter from the rendered body", () => {
    // The front-matter drives retrieval and is read from disk by the index
    // generator, but it is metadata — rendering it puts `triggers:` and
    // `seeAlso:` at the top of the answer an agent reads.
    const raw = searchPlaybooks(KB_DIR, "create a layout", 1).playbooks[0].content;
    expect(raw.startsWith("---"), "fixture should have front-matter to strip").toBe(true);

    // Mirrors the strip in wb-playbook.ts.
    let body = raw;
    if (body.startsWith("---")) {
      const end = body.indexOf("\n---", 3);
      if (end !== -1) {
        const after = body.indexOf("\n", end + 1);
        if (after !== -1) body = body.slice(after + 1).replace(/^\r?\n/, "");
      }
    }
    expect(body.startsWith("---")).toBe(false);
    expect(body).toMatch(/^#\s/m);
    expect(body).not.toMatch(/^triggers:/m);
    expect(body).not.toMatch(/^seeAlso:/m);
    // The real content survives.
    expect(body).toMatch(/##\s*(Before you start|Steps)/);
  });

  it("flags which playbooks need a human click", () => {
    const { entries } = buildIndex();
    const withHuman = entries.filter((e) => e.humanStep);
    for (const pb of withHuman) {
      expect(pb.goal.length, `${pb.id} should explain what the human does`).toBeGreaterThan(10);
    }
  });
});

describe("playbookCatalogue", () => {
  it("lists every playbook id and separates human-click tasks", () => {
    const cat = playbookCatalogue(KB_DIR);
    const { entries } = buildIndex();
    for (const pb of entries) expect(cat).toContain(pb.id);
    expect(cat).toContain("needs a human click");
    expect(cat).toContain("fully scriptable");
  });
});

describe("degrading gracefully on a bad index", () => {
  // Found by running the search in isolation: a throw here propagates out of the
  // MCP tool and fails the call, so one bad file makes the whole feature
  // unavailable instead of merely unhelpful.
  it("shows the catalogue rather than throwing when index.json is malformed", () => {
    const tmp = join(REPO, "tests", ".tmp-kb-badindex");
    mkdirSync(tmp, { recursive: true });
    try {
      writeFileSync(join(tmp, "index.json"), "{ this is not json");
      __resetPlaybookCache();
      expect(() => searchPlaybooks(tmp, "create a layout", 2)).not.toThrow();
      expect(searchPlaybooks(tmp, "create a layout", 2).showCatalogue).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      __resetPlaybookCache();
    }
  });

  it("treats a wrong-shaped index as empty rather than throwing", () => {
    const tmp = join(REPO, "tests", ".tmp-kb-shapeindex");
    mkdirSync(tmp, { recursive: true });
    try {
      writeFileSync(join(tmp, "index.json"), JSON.stringify({ playbooks: "nope" }));
      __resetPlaybookCache();
      expect(() => searchPlaybooks(tmp, "layout", 2)).not.toThrow();
      expect(searchPlaybooks(tmp, "layout", 2).showCatalogue).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      __resetPlaybookCache();
    }
  });

  it("handles a missing index directory", () => {
    __resetPlaybookCache();
    const r = searchPlaybooks(join(REPO, "tests", ".tmp-kb-does-not-exist"), "layout", 2);
    expect(r.showCatalogue).toBe(true);
    expect(playbookCatalogue(join(REPO, "tests", ".tmp-kb-does-not-exist"))).toBe("No playbooks found.");
  });
});
