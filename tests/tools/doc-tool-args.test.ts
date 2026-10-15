/**
 * Every `tool {json}` example in the KB, playbooks and docs must be a call the
 * server accepts. Agents copy these verbatim; four playbooks told them to pass
 * wb_debug a `source` argument it does not have, wb_bridge examples omitted the
 * required projectPath, and wb_component was shown with an entityId it does
 * not take. Examples with placeholders that are not valid JSON (`<x>`, `...`)
 * are templates and are skipped.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface ToolEntry {
  name: string;
  inputSchema?: { properties?: Record<string, { enum?: unknown[] }>; required?: string[] };
}

function markdownFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) markdownFiles(full, out);
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

describe("tool-call examples in documentation", () => {
  const raw = JSON.parse(readFileSync(join(REPO, "dist", "tools.json"), "utf-8"));
  const tools: ToolEntry[] = Array.isArray(raw) ? raw : raw.tools;
  const byName = new Map(tools.map((t) => [t.name, t]));
  const files = [...markdownFiles(join(REPO, "data", "kb")), ...markdownFiles(join(REPO, "docs")),
    join(REPO, "CLAUDE.md"), join(REPO, "README.md")];

  it("use only arguments the tool accepts, include required ones, and respect enums", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      for (const m of text.matchAll(/\b([a-z][a-z0-9_]+)\s+(\{[^{}\n]*\})/g)) {
        const tool = byName.get(m[1]);
        if (!tool) continue;
        let args: Record<string, unknown>;
        try { args = JSON.parse(m[2]); } catch { continue; }
        checked++;
        const props = tool.inputSchema?.properties ?? {};
        const where = `${file.slice(REPO.length + 1)}: ${m[1]} ${m[2]}`;
        for (const k of Object.keys(args)) if (!(k in props)) problems.push(`${where} — unknown argument '${k}'`);
        for (const r of tool.inputSchema?.required ?? []) if (!(r in args)) problems.push(`${where} — missing '${r}'`);
        for (const [k, v] of Object.entries(args)) {
          const allowed = props[k]?.enum;
          if (allowed && !allowed.includes(v)) problems.push(`${where} — '${k}' must be one of ${JSON.stringify(allowed)}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(problems).toEqual([]);
  });
});
