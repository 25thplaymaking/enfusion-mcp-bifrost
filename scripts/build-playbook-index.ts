#!/usr/bin/env tsx
/**
 * Build data/kb/playbooks/index.json from the playbooks on disk.
 *
 * Same anti-drift stance as build-kb-index.ts, for the same reason: a
 * hand-maintained index silently rots. Each playbook carries its own YAML
 * front-matter (id/title/goal/triggers/tools/seeAlso/humanStep); this script
 * reads those and emits the index, so a playbook cannot exist without being
 * findable, and cannot claim an id that disagrees with its filename.
 *
 * Deliberately hand-rolled rather than pulling in a YAML dependency: the
 * front-matter here is a fixed, flat schema, and this repo installs its deps
 * from a lockfile on the user's PC.
 *
 * USAGE
 *   npx tsx scripts/build-playbook-index.ts           # write
 *   npx tsx scripts/build-playbook-index.ts --check   # exit 1 if stale
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const PLAYBOOKS_DIR = join(REPO, "data", "kb", "playbooks");
const INDEX_PATH = join(PLAYBOOKS_DIR, "index.json");

export interface PlaybookEntry {
  id: string;
  title: string;
  goal: string;
  triggers: string[];
  tools: string[];
  seeAlso: string[];
  humanStep: boolean;
}

/** Strip quotes and inline comments from a scalar front-matter value. */
function unquote(v: string): string {
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.replace(/\s+#.*$/, "").trim();
}

/** Parse a flat YAML list: either `[a, b]` inline or `- item` lines. */
function parseList(raw: string, startIdx: number, lines: string[]): { value: string[]; next: number } {
  const v = raw.trim();
  if (v.startsWith("[")) {
    const inner = v.replace(/^\[/, "").replace(/\]$/, "");
    return { value: inner.split(",").map((s) => unquote(s)).filter(Boolean), next: startIdx };
  }
  const value: string[] = [];
  let i = startIdx;
  while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
    value.push(unquote(lines[i].replace(/^\s*-\s+/, "")));
    i++;
  }
  return { value, next: i };
}

export interface ParsedFrontMatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontMatter(text: string): ParsedFrontMatter | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;

  const data: Record<string, unknown> = {};
  let i = 1;
  while (i < lines.length && lines[i].trim() !== "---") {
    const line = lines[i];
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) {
      const key = m[1];
      const rest = m[2];

      if (rest.trim() === "") {
        // Block list on following lines: `key:` then `- a` / `- b`.
        const { value, next } = parseList("", i + 1, lines);
        data[key] = value;
        i = next;
      } else if (rest.trim().startsWith("[")) {
        // Inline list: `key: [a, b]`. Never consume following lines.
        const { value } = parseList(rest, i + 1, lines);
        data[key] = value;
        i++;
      } else {
        data[key] = unquote(rest);
        i++;
      }
      continue;
    }
    i++;
  }

  if (i >= lines.length) return null; // unterminated front-matter
  return { data, body: lines.slice(i + 1).join("\n") };
}

function playbookFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

export function buildIndex(): { entries: PlaybookEntry[]; errors: string[] } {
  const errors: string[] = [];
  const entries: PlaybookEntry[] = [];

  for (const file of playbookFiles(PLAYBOOKS_DIR)) {
    const idFromName = basename(file, ".md");
    const text = readFileSync(join(PLAYBOOKS_DIR, file), "utf-8");
    const parsed = parseFrontMatter(text);

    if (!parsed) {
      errors.push(`${file}: missing or unterminated YAML front-matter`);
      continue;
    }

    const d = parsed.data;
    const str = (k: string): string => (typeof d[k] === "string" ? (d[k] as string) : "");
    const list = (k: string): string[] => (Array.isArray(d[k]) ? (d[k] as string[]) : []);

    const id = str("id") || idFromName;
    if (id !== idFromName) {
      // playbook-loader resolves content by filename, so a mismatch means the
      // declared id silently finds nothing.
      errors.push(`${file}: id "${id}" does not match filename "${idFromName}"`);
      continue;
    }
    if (!str("title")) {
      errors.push(`${file}: missing title`);
      continue;
    }
    if (list("triggers").length === 0) {
      // Triggers are the retrieval surface; an empty list makes the playbook
      // unfindable, which is the exact failure this layer exists to prevent.
      errors.push(`${file}: missing triggers (the playbook would be unfindable)`);
      continue;
    }

    entries.push({
      id,
      title: str("title"),
      goal: str("goal"),
      triggers: list("triggers"),
      tools: list("tools"),
      seeAlso: list("seeAlso"),
      humanStep: d.humanStep === true || d.humanStep === "true",
    });
  }

  // seeAlso must point at playbooks that exist, or it is a dead pointer.
  const ids = new Set(entries.map((e) => e.id));
  for (const e of entries) {
    for (const ref of e.seeAlso) {
      if (!ids.has(ref)) errors.push(`${e.id}.md: seeAlso references unknown playbook "${ref}"`);
    }
  }

  entries.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { entries, errors };
}

function main(): void {
  const check = process.argv.includes("--check");
  const allowDangling = process.argv.includes("--allow-dangling");
  const { entries, errors } = buildIndex();

  if (errors.length > 0) {
    // While authoring a set of playbooks, the seeAlso pointers legitimately
    // reference playbooks that are not written yet. --allow-dangling downgrades
    // those to warnings so one in-progress file cannot block every other one;
    // the integrity TEST still fails on them, so nothing ships with a dead link.
    const fatal = allowDangling
      ? errors.filter((e) => !e.includes("seeAlso references unknown playbook"))
      : errors;
    const dangling = errors.filter((e) => e.includes("seeAlso references unknown playbook"));
    if (dangling.length > 0) {
      console.warn(`WARN: ${dangling.length} dangling seeAlso pointer(s) (allowed):`);
      for (const d of dangling) console.warn(`  ${d}`);
    }
    if (fatal.length > 0) {
      console.error("Playbook index build failed:");
      for (const e of fatal) console.error(`  ${e}`);
      process.exit(1);
    }
  }

  const nextJson = `${JSON.stringify({ playbooks: entries }, null, 2)}\n`;

  // A malformed EXISTING index must not crash the build — the whole point of this
  // script is to regenerate it. Treat an unreadable current file as "absent" so
  // --write always repairs it, and so --check reports staleness instead of
  // throwing a bare JSON.parse error.
  let currentJson = "";
  let before = 0;
  if (existsSync(INDEX_PATH)) {
    currentJson = readFileSync(INDEX_PATH, "utf-8");
    try {
      before = (JSON.parse(currentJson) as { playbooks?: unknown[] }).playbooks?.length ?? 0;
    } catch {
      currentJson = ""; // corrupt: force a rewrite
      before = 0;
    }
  }

  if (check) {
    if (nextJson === currentJson) {
      console.log(`playbook index is up to date (${entries.length} playbooks).`);
      return;
    }
    console.error(
      `playbook index is STALE. Regenerate: npx tsx scripts/build-playbook-index.ts`
    );
    process.exit(1);
  }

  writeFileSync(INDEX_PATH, nextJson, "utf-8");
  console.log(`Wrote ${INDEX_PATH}: ${before} -> ${entries.length} playbooks.`);
}

// Compare as paths: on Windows argv[1] is "C:\..." while import.meta.url is
// "file:///C:/...", so a string comparison never matched and the script
// silently did nothing when run directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
