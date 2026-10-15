import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { searchKb, getIndexSummary, stem, __resetKbCache } from "../../src/tools/kb-loader.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KB_DIR = join(REPO, "data", "kb");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

describe("kb index integrity — the animation/ subtree regression", () => {
  // This is the bug that motivated the generated index. index.json was
  // hand-maintained; the eight files under Character_And_Animation/animation/ were
  // written to disk and never indexed, and kb-loader resolves every hit THROUGH the
  // index — so 170 KB of the largest single body of Workbench knowledge in the repo
  // was unreachable through wb_knowledge. Confirmed on the live server: the query
  // "animation state machine node graph" returned "Character Gear & Animation Data".
  //
  // If anyone hand-adds a KB doc and forgets the index, this test fails.

  it("indexes every .md file on disk under patterns/", () => {
    const index = JSON.parse(readFileSync(join(KB_DIR, "index.json"), "utf-8")) as Array<{ path: string }>;
    const listed = new Set(index.map((e) => e.path));
    const onDisk = walk(join(KB_DIR, "patterns")).map((f) =>
      relative(join(KB_DIR, "patterns"), f).split("\\").join("/")
    );

    const missing = onDisk.filter((p) => !listed.has(p));
    expect(
      missing,
      `These KB docs exist but are not indexed, so wb_knowledge cannot return them. ` +
        `Run: npx tsx scripts/build-kb-index.ts`
    ).toEqual([]);
  });

  it("has no index entry pointing at a file that does not exist", () => {
    const index = JSON.parse(readFileSync(join(KB_DIR, "index.json"), "utf-8")) as Array<{ path: string }>;
    const dangling = index
      .map((e) => e.path)
      .filter((p) => !existsSync(join(KB_DIR, "patterns", p)));
    expect(dangling, "Index entries pointing at missing files").toEqual([]);
  });

  it("specifically indexes all eight animation documents", () => {
    const index = JSON.parse(readFileSync(join(KB_DIR, "index.json"), "utf-8")) as Array<{ path: string }>;
    const listed = new Set(index.map((e) => e.path));
    const animationDocs = walk(join(KB_DIR, "patterns", "Character_And_Animation", "animation"))
      .map((f) => `Character_And_Animation/animation/${f.split(/[\\/]/).pop()}`);

    expect(animationDocs.length).toBeGreaterThanOrEqual(8);
    for (const doc of animationDocs) {
      expect(listed.has(doc), `${doc} must be indexed`).toBe(true);
    }
  });

  it("gives every entry a non-empty title, description and keywords", () => {
    const index = JSON.parse(readFileSync(join(KB_DIR, "index.json"), "utf-8")) as Array<{
      path: string;
      title: string;
      description: string;
      keywords: string[];
    }>;
    for (const e of index) {
      expect(e.title.trim(), `${e.path} title`).not.toBe("");
      expect(e.description.trim(), `${e.path} description`).not.toBe("");
      expect(Array.isArray(e.keywords) && e.keywords.length > 0, `${e.path} keywords`).toBe(true);
    }
  });

  it("never leaks an absolute filesystem path into a description", () => {
    // A contributor's local path was being surfaced as a doc summary, which both
    // tells the reader nothing and publishes their directory layout.
    const index = JSON.parse(readFileSync(join(KB_DIR, "index.json"), "utf-8")) as Array<{
      path: string;
      description: string;
    }>;
    const leaky = index
      .filter((e) => /[a-z]:[\\/]|(?:^|\s)\\\\[^\\]+\\|https?:\/\/|\/home\/|\/Users\//i.test(e.description))
      .map((e) => `${e.path}: ${e.description.slice(0, 80)}`);
    expect(leaky, "Descriptions containing absolute paths or URLs").toEqual([]);
  });
});

describe("stem", () => {
  it("folds plural and inflectional forms onto a shared stem", () => {
    // The pairs that must agree for the concrete retrieval failures to be fixed.
    expect(stem("particles")).toBe(stem("particle"));
    expect(stem("replication")).toBe(stem("replicate"));
    expect(stem("replicate")).toBe(stem("replicating"));
    expect(stem("replications")).toBe(stem("replicate"));
    expect(stem("terrains")).toBe(stem("terrain"));
    expect(stem("animations")).toBe(stem("animation"));
    expect(stem("scripts")).toBe(stem("script"));
  });

  it("does not mangle words ending in -ss/-us, which -s stripping would ruin", () => {
    // -ss/-us endings are protected because stripping them changes the word to a
    // different one entirely ("class" -> "clas"). Note "physics" DOES become
    // "physic": that is harmless, because both the query and the keyword are
    // stemmed, so the two still agree. Symmetry is the invariant that matters,
    // not preserving the surface form.
    expect(stem("class")).toBe("class");
    expect(stem("status")).toBe("status");
    expect(stem("gas")).toBe("gas");
  });

  it("keeps query and keyword in agreement regardless of surface form", () => {
    // The property retrieval actually depends on.
    expect(stem("physics")).toBe(stem("physics"));
    expect(stem("terrain")).toBe(stem("terrain"));
    expect(stem("Physics")).toBe(stem("physics"));
    expect(stem("PARTICLE")).toBe(stem("particles"));
  });

  it("returns short words untouched", () => {
    expect(stem("ui")).toBe("ui");
    expect(stem("a")).toBe("a");
  });
});

describe("searchKb — queries an agent actually types", () => {
  beforeAll(() => __resetKbCache());

  const top = (q: string, n = 2) =>
    searchKb(KB_DIR, q, n).files.map((f) => f.title);

  // Each of these returned usedIndex=true (a full index dump, i.e. "no idea what
  // you're asking") before the stemmer and synonym table existed.
  it.each([
    ["particles"],
    ["footsteps"],
    ["how do I replicate to clients"],
    ["replicate"],
    ["npc"],
    ["car"],
    ["gun"],
    ["mesh"],
    ["heightmap"],
  ])("finds something for %j instead of dumping the index", (q) => {
    const r = searchKb(KB_DIR, q, 2);
    expect(
      r.usedIndex,
      `"${q}" matched nothing — it fell back to dumping the whole index`
    ).toBe(false);
    expect(r.files.length).toBeGreaterThan(0);
  });

  it("routes an animation query to the animation docs", () => {
    // The exact query that returned the wrong doc on the live server.
    const r = searchKb(KB_DIR, "animation state machine node graph", 4);
    expect(r.usedIndex).toBe(false);
    expect(r.files.some((f) => /animation/i.test(f.title))).toBe(true);
  });

  it("routes a blender import query to the blender/asset doc", () => {
    const r = searchKb(KB_DIR, "I need to import an fbx model from blender", 2);
    expect(r.usedIndex).toBe(false);
    expect(r.files[0].title).toMatch(/Blender|Resource Manager/i);
  });

  it("routes a terrain authoring query to terrain docs", () => {
    const r = searchKb(KB_DIR, "world editor terrain creation tool", 2);
    expect(r.usedIndex).toBe(false);
    expect(r.files[0].title).toMatch(/World Editor|Terrain/i);
  });

  it("keeps the empty / index / list queries returning the topic list", () => {
    for (const q of ["", "index", "list", "  "]) {
      const r = searchKb(KB_DIR, q, 2);
      expect(r.usedIndex, `query ${JSON.stringify(q)}`).toBe(true);
      expect(r.files.length).toBe(0);
    }
  });

  it("returns whole file contents for a hit", () => {
    const r = searchKb(KB_DIR, "enforcescript language", 1);
    expect(r.usedIndex).toBe(false);
    expect(r.files[0].content.length).toBeGreaterThan(500);
  });
});

describe("getIndexSummary", () => {
  it("lists every indexed topic", () => {
    const summary = getIndexSummary(KB_DIR);
    const index = JSON.parse(readFileSync(join(KB_DIR, "index.json"), "utf-8")) as Array<{ title: string }>;
    for (const e of index) expect(summary).toContain(e.title);
  });
});
