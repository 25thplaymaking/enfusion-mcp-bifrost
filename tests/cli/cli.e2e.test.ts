/**
 * Subprocess tests against the built CLI (dist/cli.js), per the CLI-Anything
 * harness rule that E2E tests run the real command, not source imports.
 * Only offline tools are used, so no Workbench is needed. Needs `npm run build`.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(REPO, "dist", "cli.js");

function run(args: string[], input?: string) {
  const r = spawnSync("node", [CLI, ...args], { cwd: REPO, input, encoding: "utf-8", maxBuffer: 64e6, timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const json = (args: string[], input?: string) => {
  const r = run([...args, "--json"], input);
  return { ...r, data: JSON.parse(r.out) };
};

describe("enfusion-cli (built)", () => {
  it("lists every registered tool with the offline/live split of dist/tools.json", () => {
    const idx = JSON.parse(readFileSync(join(REPO, "dist", "tools.json"), "utf-8"));
    const r = json(["list"]);
    expect(r.code).toBe(0);
    expect(r.data.total).toBe(idx.total);
    const offline = r.data.tools.filter((t: { offline: boolean }) => t.offline).map((t: { name: string }) => t.name).sort();
    expect(offline).toEqual(idx.tools.filter((t: { offline: boolean }) => t.offline).map((t: { name: string }) => t.name).sort());
  });

  it("help reports a tool's real params", () => {
    const r = json(["help", "script_create"]);
    expect(r.code).toBe(0);
    expect(r.data.positional).toEqual(["className", "scriptType"]);
    expect(r.data.params.find((p: { name: string }) => p.name === "scriptType").values).toContain("component");
  });

  it("runs an offline tool with a bare value and returns its text", () => {
    const r = json(["wb_playbook", "catalogue"]);
    expect(r.code).toBe(0);
    expect(r.data).toMatchObject({ ok: true, tool: "wb_playbook" });
    expect(r.data.text).toContain("add-a-prefab");
  });

  it("writes a real file through an authoring tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "enfusion-cli-"));
    try {
      const r = run(["script_create", "TAG_CliTest", "component", "--methods", "void OnPostInit(IEntity owner)", "--project-path", dir]);
      expect(r.code).toBe(0);
      const src = readFileSync(join(dir, "Scripts", "Game", "TAG_CliTest.c"), "utf-8");
      expect(src).toContain("class TAG_CliTest : ScriptComponent");
      expect(src).toContain("override void OnPostInit(IEntity owner)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("takes input from --args-file - (stdin) with flags overriding it", () => {
    const full = run(["wb_knowledge", "--args-file", "-"], '{"query":"weapon suppressor","max_files":3}');
    const one = run(["wb_knowledge", "--args-file", "-", "--max-files", "1"], '{"query":"weapon suppressor","max_files":3}');
    expect(full.code).toBe(0);
    expect(one.code).toBe(0);
    expect(one.out.length).toBeLessThan(full.out.length);
  });

  it("exits 2 with a usable message on a bad call", () => {
    const r = run(["wb_knowledge", "x", "--maxfile", "1"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/Did you mean --max_files\?.*enfusion-cli help wb_knowledge/s);
    const t = json(["wb_knowlege", "x"]);
    expect(t.code).toBe(2);
    expect(t.data).toMatchObject({ ok: false, error: "usage" });
    expect(t.data.message).toContain("wb_knowledge");
  });

  it("runs a stdin script in one REPL process as JSON lines, worst exit code wins", () => {
    const r = run(["repl", "--json"], "# comment\nlist --offline\nwb_playbook catalogue\nnot_a_tool\nexit\nlist\n");
    const lines = r.out.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0].ok).toBe(true);
    expect(lines[1].tool).toBe("wb_playbook");
    expect(lines[2].error).toBe("usage");
    expect(r.code).toBe(2);
  });

  it("gives the help hint even when --args comes before the tool name", () => {
    const r = run(["--args", '{"query":"x","maxFile":1}', "wb_knowledge"]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/Unknown key "maxFile".*Run `enfusion-cli help wb_knowledge`/s);
  });

  it("refuses --args-file - inside a REPL script instead of eating the script", () => {
    const r = run(["repl", "--json"], "wb_knowledge --args-file -\nwb_playbook catalogue\n");
    const lines = r.out.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ ok: false, error: "usage" });
    expect(lines[1]).toMatchObject({ ok: true, tool: "wb_playbook" });
  });

  it("info reports the resolved configuration", () => {
    const r = json(["info"]);
    expect(r.code).toBe(0);
    expect(r.data.paths.map((p: { key: string }) => p.key)).toContain("gamePath");
  });
});
