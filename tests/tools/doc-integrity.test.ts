import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Tool names, as declared in source. Derived from the registration sites rather
 * than a hand-kept list, so adding a tool and forgetting the docs fails here.
 */
function declaredToolNames(): string[] {
  const names = new Set<string>();

  // src/server.ts registers the hand-written tools as registerXxx(server, ...)
  // and the Workbench tools via the defineWorkbenchTool() array.
  for (const f of readdirSync(join(REPO, "src", "tools")).filter((n) => n.endsWith(".ts"))) {
    const body = readFileSync(join(REPO, "src", "tools", f), "utf-8");
    for (const m of body.matchAll(/registerTool\(\s*"([a-z_]+)"/g)) names.add(m[1]);
    for (const m of body.matchAll(/defineWorkbenchTool\(\s*\{[\s\S]{0,80}?name:\s*"([a-z_]+)"/g))
      names.add(m[1]);
    // Named exports that ARE tools: `export const xxxTools = [ defineWorkbenchTool({ name: "y"
    for (const m of body.matchAll(/name:\s*"([a-z_]+)"/g)) names.add(m[1]);
  }

  const server = readFileSync(join(REPO, "src", "server.ts"), "utf-8");
  for (const m of server.matchAll(/name:\s*"([a-z_]+)"/g)) names.add(m[1]);

  return [...names].sort();
}

const DECLARED = declaredToolNames();

describe("agent tool index is current", () => {
  // AGENT_TOOLS.md and dist/tools.json are GENERATED from the server's own
  // tools/list (scripts/gen-agent-index.mjs). They exist because an agent picking
  // a tool from prose picks badly, and because the offline/live split is not
  // derivable from the wb_ prefix.
  //
  // This runs the generator's --check rather than re-deriving the logic, so
  // there is exactly one definition of "offline" in the repo.

  it("AGENT_TOOLS.md and dist/tools.json match the registered tools", () => {
    const r = spawnSync("node", ["scripts/gen-agent-index.mjs", "--check"], {
      cwd: REPO,
      encoding: "utf-8",
      timeout: 60_000,
    });
    expect(
      r.status,
      `agent index is stale:\n${r.stdout ?? ""}${r.stderr ?? ""}\nRegenerate: node scripts/gen-agent-index.mjs`
    ).toBe(0);
  });

  it("emits each tool's full inputSchema, so argument names are never guessed", () => {
    // Regression: the first version of this file carried only inputKeys/required.
    // A caller then had to read src/tools/*.ts to learn that script_create
    // REQUIRES scriptType, or that scenario_create takes `type`. Guessing an
    // argument name costs a wasted round trip, which is exactly what this repo
    // keeps trying to prevent.
    const idx = JSON.parse(readFileSync(join(REPO, "dist", "tools.json"), "utf-8")) as {
      tools: Array<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }>;
    };
    const missing = idx.tools.filter((t) => !t.inputSchema || !t.inputSchema.properties);
    expect(
      missing.map((t) => t.name),
      "Tools with no inputSchema in dist/tools.json — callers must be able to read argument names"
    ).toEqual([]);

    const sc = idx.tools.find((t) => t.name === "script_create");
    expect(Object.keys(sc!.inputSchema!.properties!)).toContain("scriptType");
  });

  it("AGENT_TOOLS.md is valid markdown, not a truncated template", () => {
    // Regression: a markdown table header containing an UNESCAPED backtick
    // (Inputs (`*` = required)) silently terminated the template literal, so the
    // whole document evaluated to NaN and writeFileSync threw. That failed the
    // build loudly — but only because the header had a backtick in it. Assert
    // the rendered output is a real document.
    const md = readFileSync(join(REPO, "AGENT_TOOLS.md"), "utf-8");
    expect(md.length).toBeGreaterThan(5000);
    expect(md).not.toContain("NaN");
    expect(md).not.toContain("undefined");
    expect(md).toContain("# Agent tool index");
    expect(md).toContain("63 tools: 26 offline, 37 live");
    // Every table row must have a consistent column count.
    const rows = md.split("\n").filter((l) => l.startsWith("| `"));
    expect(rows.length).toBeGreaterThan(60);
    for (const r of rows) expect(r.split("|").length).toBe(5);
  });

  it("records wb_knowledge and wb_playbook as offline despite the wb_ prefix", () => {
    // The single most load-bearing fact in the file. If the prefix were treated
    // as "needs a live editor", an agent would skip the two tools most likely to
    // save it and report "Workbench required" for work needing nothing.
    const idx = JSON.parse(readFileSync(join(REPO, "dist", "tools.json"), "utf-8")) as {
      total: number;
      offline: number;
      live: number;
      tools: Array<{ name: string; offline: boolean }>;
    };
    for (const name of ["wb_knowledge", "wb_playbook"]) {
      const t = idx.tools.find((x) => x.name === name);
      expect(t, `${name} missing from the index`).toBeDefined();
      expect(t!.offline, `${name} must be marked offline`).toBe(true);
    }
    expect(idx.offline + idx.live).toBe(idx.total);
  });

  it("counts 37 live and 26 offline", () => {
    // Asserted literally: adding or removing a tool should make the docs and
    // this number change together, in the same commit.
    const idx = JSON.parse(readFileSync(join(REPO, "dist", "tools.json"), "utf-8")) as {
      total: number;
      offline: number;
      live: number;
    };
    expect(idx.total).toBe(63);
    expect(idx.offline).toBe(26);
    expect(idx.live).toBe(37);
  });
});

describe("documentation integrity", () => {
  // The README used to advertise `mod_create`, `mod_build`, `mod_validate`,
  // `prefab_create` and `prefab_inspect` — five tools that do not exist. An agent
  // that trusted the table called them and got nothing back, having no way to
  // tell a wrong doc from a wrong call. Docs drift from code silently; this makes
  // it a test failure instead.

  it("the tool-name scraper actually found the tools", () => {
    expect(DECLARED.length).toBeGreaterThan(50);
    expect(DECLARED).toContain("wb_playbook");
    expect(DECLARED).toContain("wb_knowledge");
    expect(DECLARED).toContain("script_create");
  });

  it("README documents every declared tool", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf-8");
    const missing = DECLARED.filter((n) => !readme.includes(`\`${n}\``));
    expect(
      missing,
      `Tools missing from README.md: ${missing.join(", ")}. Add a row to the tools table.`
    ).toEqual([]);
  });

  it("README does not advertise tools that do not exist", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf-8");
    // Backticked snake_case identifiers in the README that look like tool names.
    const referenced = [...readme.matchAll(/`([a-z][a-z0-9]*_[a-z0-9_]+)`/g)].map((m) => m[1]);
    const known = new Set([
      ...DECLARED,
      // Non-tool identifiers that legitimately appear in backticks.
      "action_create", "action_build", "action_validate", "action_list", "action_create",
      "armor_workbench", "enfusion_default_mod", "project_path",
    ]);
    const phantom = [...new Set(referenced)].filter(
      (n) => !known.has(n) && /^(mod|prefab|layout|menu|script|config|wb|api|wiki|game|editor|animation|building|asset|scenario|server|workshop|component|project|asset)_/.test(n)
    );
    expect(
      phantom,
      `README references tool-shaped names that are not registered: ${phantom.join(", ")}`
    ).toEqual([]);
  });

  it("CONTEXT.md states the current tool count, not a stale one", () => {
    const ctx = readFileSync(join(REPO, "CONTEXT.md"), "utf-8");
    // 63 = 24 offline + 39 wb_*. Asserted as a literal so a tool addition that
    // forgets to update the architecture doc fails here.
    expect(ctx).toContain("63 MCP tools");
    expect(ctx).not.toMatch(/\b50 MCP tools\b/);
    expect(ctx).not.toMatch(/\b41 files\b/);
    expect(ctx).not.toMatch(/31 of the 50/);
  });

  it("CONTEXT.md documents the playbooks layer and the generated indexes", () => {
    const ctx = readFileSync(join(REPO, "CONTEXT.md"), "utf-8");
    expect(ctx).toContain("wb_playbook");
    expect(ctx).toMatch(/GENERATED, never hand-edited/);
    expect(ctx).toContain("build-playbook-index.ts");
  });

  it("README tells an agent to start with wb_playbook", () => {
    const readme = readFileSync(join(REPO, "README.md"), "utf-8");
    expect(readme).toMatch(/Start every authoring task with `wb_playbook`/);
    // And warns that the wb_ prefix does not imply a live editor.
    expect(readme).toMatch(/does not mean "needs Workbench"/);
  });
});
