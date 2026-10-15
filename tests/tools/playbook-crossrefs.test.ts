import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchKb } from "../../src/tools/kb-loader.js";
import { buildIndex } from "../../scripts/build-playbook-index.js";
import { searchPlaybooks, __resetPlaybookCache } from "../../src/tools/playbook-loader.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KB_DIR = join(REPO, "data", "kb");
const PLAYBOOKS = join(KB_DIR, "playbooks");

function playbookFiles(): string[] {
  return readdirSync(PLAYBOOKS).filter((f) => f.endsWith(".md"));
}

const bodies = () =>
  playbookFiles().map((f) => ({ name: f, text: readFileSync(join(PLAYBOOKS, f), "utf-8") }));

describe("cross-references between playbooks and the KB resolve", () => {
  // Every playbook ends with "Related" pointers like
  //   wb_knowledge "animation graph" -> then the animation INDEX.md
  // If one of those queries matches nothing, the tool returns the whole index
  // instead of the document — and the agent that followed the pointer concludes
  // the knowledge base does not cover the topic. That is worse than no pointer,
  // so the pointers are executed here rather than trusted.
  __resetPlaybookCache();

  it("every wb_knowledge query a playbook recommends actually matches", () => {
    const queries = new Set<string>();
    for (const { text } of bodies()) {
      for (const m of text.matchAll(/wb_knowledge "([^"]+)"/g)) queries.add(m[1]);
    }
    expect(queries.size, "expected playbooks to reference the KB").toBeGreaterThan(5);

    const dead: string[] = [];
    for (const q of queries) {
      const r = searchKb(KB_DIR, q, 1);
      if (r.usedIndex || r.files.length === 0) dead.push(q);
    }
    expect(
      dead,
      `These playbook cross-references resolve to nothing (the tool would dump the ` +
        `whole index instead of the document). Fix the query or the playbook: ${dead.join(", ")}`
    ).toEqual([]);
  });

  it("every playbook a playbook points at via its id exists", () => {
    const ids = new Set(playbookFiles().map((f) => f.replace(/\.md$/, "")));
    const dead: string[] = [];
    for (const { name, text } of bodies()) {
      for (const m of text.matchAll(/`([a-z][a-z0-9-]{4,})`\s+playbook|playbook `([a-z][a-z0-9-]{4,})`/g)) {
        const ref = m[1] ?? m[2];
        if (ref && !ids.has(ref)) dead.push(`${name} -> ${ref}`);
      }
    }
    expect(dead, `Playbooks pointing at non-existent playbooks: ${dead.join(", ")}`).toEqual([]);
  });

  it("each playbook is reachable by its own id", () => {
    for (const f of playbookFiles()) {
      const id = f.replace(/\.md$/, "");
      const r = searchPlaybooks(KB_DIR, id, 1);
      expect(r.showCatalogue, `${id} not findable by its own id`).toBe(false);
      expect(r.playbooks[0]?.id).toBe(id);
    }
  });

  it("each playbook is reachable by a natural task phrasing", () => {
    // The triggers are the retrieval surface. A playbook whose triggers do not
    // match a plausible task phrasing is a playbook nobody finds.
    const missed: string[] = [];
    for (const f of playbookFiles()) {
      const id = f.replace(/\.md$/, "");
      const r = searchPlaybooks(KB_DIR, id.replace(/-/g, " "), 3);
      if (r.showCatalogue || !r.playbooks.some((p) => p.id === id)) missed.push(id);
    }
    expect(missed, `Playbooks not findable by their own name in prose form: ${missed.join(", ")}`)
      .toEqual([]);
  });

  it("no playbook recommends a tool that is not registered", () => {
    // Backticked snake_case words that look like tool names inside playbook
    // bodies. Not every snake_case word is a tool (tool args are camelCase), so
    // this checks only the known tool-ish prefixes.
    const known = new Set<string>();
    const { entries } = buildIndex();
    for (const e of entries) for (const t of e.tools) known.add(t);
    for (const f of readdirSync(join(REPO, "src", "tools")).filter((n) => n.endsWith(".ts"))) {
      const body = readFileSync(join(REPO, "src", "tools", f), "utf-8");
      for (const m of body.matchAll(/(?:registerTool\(|name:\s*)"([a-z][a-z0-9_]{3,})"/g))
        known.add(m[1]);
    }
    const prefix = /^(wb|api|wiki|game|editor|animation|building|asset|scenario|workshop|component|project|layout|menu|script|config|server|mod|prefab|menu|knowledge|playbook)_/;

    const phantom: string[] = [];
    for (const { name, text } of bodies()) {
      for (const m of text.matchAll(/`([a-z][a-z0-9_]{3,})`/g)) {
        const tok = m[1];
        if (!prefix.test(tok) || known.has(tok)) continue;
        // A playbook may legitimately NAME a non-existent tool in order to warn
        // against it ("`scenario_create_base`. No such tool is registered.").
        // That is the opposite of a defect, so skip a token whose own sentence
        // says it does not exist.
        const after = text.slice(m.index!, m.index! + 200);
        if (/\b(no such tool|does not exist|not registered|is not a real)\b/i.test(after)) continue;
        phantom.push(`${name}: ${tok}`);
      }
    }
    expect(
      [...new Set(phantom)],
      `Playbooks naming tools that are not registered: ${[...new Set(phantom)].join(", ")}`
    ).toEqual([]);
  });
});
