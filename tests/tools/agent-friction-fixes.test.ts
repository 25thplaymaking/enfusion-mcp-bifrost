/**
 * Regression tests for tool failures recorded in real agent sessions
 * (2026-10 transcript sweep): oversized results, wrong argument names,
 * misreported reload refusals and racing lifecycle calls.
 */
import { describe, expect, it } from "vitest";
import { WorkbenchError } from "../../src/workbench/client.js";
import { isRefusedReload } from "../../src/tools/wb-reload.js";
import { withLifecycleLock, sleep } from "../../src/workbench/tool-helpers.js";
import { formatGameFile, outlineOf, suggestPaths, GAME_READ_MAX_CHARS } from "../../src/tools/game-read.js";
import { normalizeWikiTitle, rankWiki, splitSections } from "../../src/index/wiki-sections.js";
import { pickSections, renderWikiPage, WIKI_READ_DEFAULT_CHARS } from "../../src/tools/wiki-read.js";
import { allocateKbBudget, fitKbDocument, KB_TOTAL_CHARS } from "../../src/tools/wb-knowledge.js";
import type { WikiPage } from "../../src/index/types.js";
import { SearchEngine } from "../../src/index/search-engine.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

describe("wb_reload refusal vs compile failure", () => {
  it("calls 'Compilation failed' with no compile block a refusal", () => {
    const err = new WorkbenchError("Workbench error: Compilation failed", "API_ERROR");
    expect(isRefusedReload(err, { sawCompile: false, failed: false })).toBe(true);
  });

  it("keeps a real compile failure a failure", () => {
    const err = new WorkbenchError("Workbench error: Compilation failed", "API_ERROR");
    expect(isRefusedReload(err, { sawCompile: true, failed: true })).toBe(false);
    expect(isRefusedReload(err, { sawCompile: false, failed: true })).toBe(false);
  });

  it("does not treat unrelated errors as refusals", () => {
    expect(isRefusedReload(new Error("connection refused"), { sawCompile: false, failed: false })).toBe(false);
  });
});

describe("lifecycle lock", () => {
  it("runs transitions one at a time, in arrival order", async () => {
    const events: string[] = [];
    const task = (name: string, ms: number) => withLifecycleLock(async () => {
      events.push(`${name}:start`);
      await sleep(ms);
      events.push(`${name}:end`);
      return name;
    });
    const results = await Promise.all([task("stop", 30), task("reload", 5), task("play", 1)]);
    expect(results).toEqual(["stop", "reload", "play"]);
    expect(events).toEqual(["stop:start", "stop:end", "reload:start", "reload:end", "play:start", "play:end"]);
  });

  it("keeps the queue moving after a failure", async () => {
    const failed = withLifecycleLock(async () => { throw new Error("boom"); });
    await expect(failed).rejects.toThrow("boom");
    await expect(withLifecycleLock(async () => "next")).resolves.toBe("next");
  });
});

describe("game_read paging", () => {
  const big = Array.from({ length: 6000 }, (_, i) =>
    i % 200 === 0 ? `class TAG_Class${i}\n{` : `\tvoid Method${i}(int a)\n\t{\n\t\tPrint("x");\n\t}`
  ).join("\n");

  it("returns small files whole", () => {
    expect(formatGameFile("a.c", "// a.c", "class A {}\n")).toBe("// a.c\n\nclass A {}\n");
  });

  it("pages large files under the response budget with an outline and a next pointer", () => {
    const out = formatGameFile("big.c", "// big.c", big);
    expect(out.length).toBeLessThan(GAME_READ_MAX_CHARS + 8_000);
    expect(out).toContain("// OUTLINE");
    expect(out).toMatch(/next: startLine=\d+/);
  });

  it("returns an exact line range", () => {
    const out = formatGameFile("big.c", "// big.c", big, { startLine: 10, maxLines: 3 });
    expect(out).toContain("// lines 10-12 of");
    expect(out.split("\n").filter((l) => /^\s+\d+ {2}/.test(l))).toHaveLength(3);
  });

  it("returns only matching lines for a search", () => {
    const out = formatGameFile("big.c", "// big.c", big, { search: "TAG_Class5800", context: 0 });
    expect(out).toContain("1 line(s) contain");
    expect(out).toContain("TAG_Class5800");
    expect(out).not.toContain("TAG_Class200");
  });

  it("outlines classes and methods but not control flow", () => {
    const o = outlineOf("x.c", ["class A", "{", "\tvoid Foo(int a)", "\t{", "\t\tif (a)", "\t}", "\toverride void EOnInit(IEntity owner)", "}"]);
    expect(o).toEqual(["1: class A", "3: void Foo(int a)", "7: override void EOnInit(IEntity owner)"]);
  });

  it("suggests real paths for a wrong guess", () => {
    const all = ["Scripts/Game/AI/Actions/SCR_AILookAction.c", "Scripts/Game/AI/Other.c"];
    expect(suggestPaths("scripts/Game/AI/Behaviors/SCR_AILookAction.c", all)).toEqual(["Scripts/Game/AI/Actions/SCR_AILookAction.c"]);
  });
});

describe("wiki title forms", () => {
  it("normalizes the forms agents actually pass", () => {
    expect(normalizeWikiTitle("Arma_Reforger:Scripting:_Keywords")).toBe("Scripting: Keywords");
    expect(normalizeWikiTitle("https://community.bistudio.com/wiki/Arma_Reforger:Capture_%26_Hold_Setup")).toBe("Capture & Hold Setup");
    expect(normalizeWikiTitle("Persistence System")).toBe("Persistence System");
  });
});

describe("wiki sections", () => {
  const content = "Intro text.\n\n## Usage\n\nUse it.\n\n```c\n// ## not a heading\n```\n\n### Detail\n\nMore.\n\n## Other\n\nUnrelated.";

  it("splits at headings but not inside code fences", () => {
    const s = splitSections(content);
    expect(s.map((x) => x.heading)).toEqual(["", "Usage", "Detail", "Other"]);
  });

  it("picks a section with its sub-sections", () => {
    const picked = pickSections(splitSections(content), "usage");
    expect(picked).toHaveLength(1);
    expect(picked[0].text).toContain("More.");
    expect(picked[0].text).not.toContain("Unrelated.");
  });

  it("pages a long page with a section list and continuation offset", () => {
    const page = { title: "Big", source: "bistudio-wiki", content: `## A\n\n${"x".repeat(50_000)}\n\n## B\n\nend` };
    const out = renderWikiPage(page);
    expect(out.length).toBeLessThan(WIKI_READ_DEFAULT_CHARS + 2_000);
    expect(out).toContain("Sections:");
    expect(out).toMatch(/next: offset=\d+/);
    expect(renderWikiPage(page, { section: "B" })).toContain("end");
  });

  it("keeps the section list bounded on pages with hundreds of headings", () => {
    const content = Array.from({ length: 800 }, (_, i) => `${i % 4 === 0 ? "##" : "####"} Heading number ${i}\n\nbody ${i}`).join("\n\n");
    const out = renderWikiPage({ title: "Diag", source: "bistudio-wiki", content: content + "x".repeat(40_000) });
    expect(out.length).toBeLessThan(WIKI_READ_DEFAULT_CHARS + 4_000);
    expect(out).toMatch(/headings not listed/);
  });

  it("ranks the page whose section answers the query, ignoring stopwords", () => {
    const pages: WikiPage[] = [
      { title: "Multiplayer Scripting", source: "bistudio-wiki", content: "## RPC\n\nUse Rpc() to replicate calls to clients. Replication of properties uses RplProp." },
      { title: "Weapons", source: "bistudio-wiki", content: "## Muzzle\n\nHow to do a muzzle to the weapon, and how to add it." },
    ];
    const hits = rankWiki(pages, "how do I replicate to clients", 5);
    expect(hits[0].page.title).toBe("Multiplayer Scripting");
    expect(hits[0].section.heading).toBe("RPC");
    expect(hits.find((h) => h.page.title === "Weapons")).toBeUndefined();
  });
});

describe("API index inheritance (repaired from game script source)", () => {
  const engine = new SearchEngine(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data"));

  it("matches the class declarations in the game scripts", () => {
    expect(engine.getInheritanceChain("SCR_GameModeCampaign").slice(-3)).toEqual(["BaseGameMode", "SCR_BaseGameMode", "SCR_GameModeCampaign"]);
    expect(engine.getInheritanceChain("SCR_ChimeraCharacter").slice(-2)).toEqual(["ChimeraCharacter", "SCR_ChimeraCharacter"]);
    expect(engine.getInheritanceChain("DoorComponent")).toContain("GenericComponent");
  });

  it("never lists a subclass as a parent", () => {
    expect(engine.getInheritanceChain("SCR_Task")).not.toContain("SCR_AttackTaskEntity");
    expect(engine.getInheritanceChain("AIAgent")).not.toContain("AIAnimal");
  });
});

describe("wb_knowledge budget", () => {
  it("never exceeds the shared budget and lets short documents donate their share", () => {
    const alloc = allocateKbBudget([2_000, 90_000, 60_000], KB_TOTAL_CHARS);
    expect(alloc[0]).toBe(2_000);
    expect(alloc.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(KB_TOTAL_CHARS);
    expect(alloc[1]).toBeGreaterThan(KB_TOTAL_CHARS / 3);
  });

  it("trims a long document to the sections that match the query", () => {
    const doc = ["# Doc", "## Doors", `door navmesh ${"d ".repeat(4000)}`, "## Vehicles", `wheel ${"v ".repeat(20000)}`].join("\n\n");
    const out = fitKbDocument(doc, "door navmesh", 15_000);
    expect(out.length).toBeLessThanOrEqual(15_000 + 200);
    expect(out).toContain("## Doors");
    expect(out).not.toContain("wheel");
  });
});
