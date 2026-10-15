#!/usr/bin/env tsx
/**
 * Rebuild data/kb/index.json from the files actually on disk.
 *
 * WHY THIS EXISTS
 * ---------------
 * index.json was hand-maintained. When the animation/ subtree was added under
 * Character_And_Animation/, its eight files were written to disk but never added
 * to the index, and because kb-loader.ts resolves every hit *through the index*,
 * the entire animation domain (170 KB — the largest single body of Workbench
 * knowledge in the repo) was unreachable through wb_knowledge. Verified against
 * the live server: `wb_knowledge "animation state machine node graph"` returned
 * "Character Gear & Animation Data" instead.
 *
 * A hand-maintained index silently rots exactly this way. This script derives the
 * index from the filesystem so the two cannot drift, and refuses to write when a
 * declared file is missing (an index entry pointing at nothing is the same bug in
 * the other direction).
 *
 * ENTRY SHAPE is preserved exactly as the old hand-written file used it —
 * { path, title, description, keywords[] } — so kb-loader.ts and its consumers
 * need no changes. `keywords` stays lowercase for the loader's `includes()` test.
 *
 * USAGE
 *   npx tsx scripts/build-kb-index.ts           # write
 *   npx tsx scripts/build-kb-index.ts --check   # exit 1 if the index is stale
 *
 * --check runs in tests/tools/kb-index.test.ts, which is what stops the drift
 * from coming back.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const PATTERNS_DIR = join(REPO, "data", "kb", "patterns");
const INDEX_PATH = join(REPO, "data", "kb", "index.json");

export interface KbEntry {
  path: string;
  title: string;
  description: string;
  keywords: string[];
}

/** Docs that route to other docs rather than answer a question themselves. */
const INDEX_DOCS = new Set(["INDEX.md", "README.md"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** First `# ` heading, or the filename when the file has none. */
function titleOf(absPath: string, body: string): string {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return basename(absPath, ".md")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Boilerplate that makes a poor one-line summary even though it is prose.
 * These are navigational/meta lines — they tell a reader where to look, not what
 * the doc is, so they are skipped in favour of the next real sentence.
 */
const META_LINE = /^(read (this|first|only)\b|sources?\s*:|condensed from\b|for more (detail|information)\b|see (also|below|the)\b|note[d]?:\s|tip\s*:|updated\b|last updated\b)/i;

/** Absolute filesystem paths, drive letters, UNC paths, and bare URLs. */
const PATH_OR_URL = /(^[a-z]:[\\/])|(\\\\[^\\]+\\)|(^\/[\w.-]+\/)|(https?:\/\/)|(file:\/\/)/i;

/**
 * A path is often wrapped in backticks or emphasis (`C:\Users\...`), which hides
 * it from an anchored test. Strip the inline markdown before testing, and also
 * treat "a line that is mostly a path" as a path.
 */
function isPathLine(line: string): boolean {
  const bare = line.replace(/^[`*_>\s]+|[`*_>\s.,;:)]+$/g, "");
  if (PATH_OR_URL.test(bare)) return true;
  // A prose line mentioning a path once is fine; a line that IS a path is not.
  const windowsish = bare.match(/[a-z]:[\\/][^\s"']+/gi) ?? [];
  if (windowsish.length > 0 && windowsish.join(" ").length > bare.length * 0.5) return true;
  return false;
}

/**
 * Description = first real prose line: no fenced code, no headings, no tables,
 * no badges, and no pure navigation boilerplate. Falls back to a derived summary
 * so an entry is never blank.
 */
function descriptionOf(body: string, title: string): string {
  let inFence = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();

    // Fenced code blocks must never contribute: a file that opens with a code
    // sample would otherwise be described by its first statement.
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("|") || line.startsWith("---")) continue;
    if (line.startsWith("<!--") || line.startsWith(">")) continue;
    if (/^\[!\[/.test(line)) continue;
    // A bare reference-definition or a line ending in ':' introduces a link or
    // list rather than making a statement.
    if (/^\[.+\]:\s/.test(line)) continue;
    if (line.length < 12) continue;
    if (META_LINE.test(line)) continue;
    // A line that IS a local path leaks the author's directory layout and tells a
    // reader nothing; a line merely containing one (a doc referencing a path) is
    // still fine.
    if (isPathLine(line)) continue;

    return line.replace(/[*`_]/g, "").slice(0, 200);
  }
  return `${title} — pattern notes.`;
}

/** Words that carry no retrieval signal. */
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "how", "into", "your", "you",
  "are", "was", "will", "can", "not", "but", "has", "have", "its", "it's", "use",
  "using", "used", "when", "what", "which", "who", "why", "where", "then", "than",
  "also", "any", "all", "one", "two", "get", "got", "set", "run", "via", "per",
  "a", "an", "of", "to", "in", "on", "is", "as", "it", "at", "be", "by", "or",
  "do", "does", "did", "if", "so", "up", "out", "no", "yes", "more", "most",
]);

/** Modding jargon an agent will type that never appears verbatim in prose. */
const DOMAIN_TERMS = [
  "enforce", "enforcescript", "reforger", "workbench", "enfusion", "bifrost",
  "replication", "prefabs", "prefab", "layout", "layouts", "gui", "hud", "menu",
  "config", "configs", "script", "scripts", "scripting", "entity", "entities",
  "component", "components", "terrain", "terrains", "navmesh", "animation",
  "animations", "animated", "anim", "agf", "agr", "anm", "asi", "ast", "txa",
  "particle", "particles", "vfx", "sound", "sounds", "audio", "weapon", "weapons",
  "vehicle", "vehicles", "physics", "damage", "inventory", "faction", "factions",
  "scenario", "scenarios", "gamemode", "campaign", "conflict", "ai", "spawn",
  "spawns", "spawnpoint", "blender", "fbx", "asset", "assets", "qt5", "widget",
  "widgets", "dialog", "dialogs", "tooltip", "tooltips", "serialize",
  "serialization", "rpc", "jip", "event", "events", "variable", "variables",
  "fn", "func", "struct", "class", "classes", "instance", "instances", "node",
  "nodes", "graph", "texture", "textures", "model", "models", "meshes", "mesh",
  "material", "materials", "modifier", "modifiers", "addon", "addons", "mod",
  "mods", "modding", "editor", "editors", "net", "api", "tool", "tools",
  "footsteps", "footstep", "replicate", "replicated", "netcode", "packet",
  "packets", "json", "resource", "resources", "engine", "game", "client",
  "server", "dedicated", "workbenchnet", "bridge", "handler", "handlers",
];

function keywordsFor(relPath: string, title: string, body: string): string[] {
  const set = new Set<string>();

  // Domain nouns from the path: each path segment is a retrieval handle
  // ("Tools_And_Workbench/particle-editor.md" must be findable by "tools").
  for (const seg of relPath.split("/")) {
    const word = seg.replace(/\.md$/, "").replace(/[-_]/g, " ").trim();
    if (!word || word.toLowerCase() === "index") continue;
    for (const part of word.split(/\s+/)) {
      const p = part.toLowerCase();
      if (p && !STOP.has(p)) set.add(p);
      // singular/plural, so "particles" and "particle" both land
      if (p.endsWith("s") && p.length > 3) set.add(p.slice(0, -1));
      else if (p.length > 3) set.add(`${p}s`);
    }
  }

  // Title words.
  for (const w of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w && !STOP.has(w)) set.add(w);
  }

  // Domain vocabulary the agent is likely to type.
  const lower = `${title}\n${relPath}\n${body.slice(0, 20_000)}`.toLowerCase();
  for (const term of DOMAIN_TERMS) {
    if (new RegExp(`\\b${term}\\b`).test(lower)) set.add(term);
  }

  // Frequent content words from headings — headings are what an agent skims.
  for (const m of body.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    for (const w of m[1].toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length > 3 && !STOP.has(w)) set.add(w);
    }
  }

  return [...set].sort();
}

export function buildIndex(): KbEntry[] {
  const files = walk(PATTERNS_DIR);
  const entries: KbEntry[] = [];

  for (const abs of files) {
    const rel = relative(PATTERNS_DIR, abs).split("\\").join("/");
    const body = readFileSync(abs, "utf-8");
    const title = titleOf(abs, body);
    entries.push({
      path: rel,
      title,
      description: descriptionOf(body, title),
      keywords: keywordsFor(rel, title, body),
    });
  }

  // Path segments before the filename are the browsing axis, so sort by them to
  // keep index.json diffs readable and stable across rebuilds.
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return entries;
}

/** True when every indexed path exists on disk (an index entry pointing at nothing). */
export function danglingEntries(index: KbEntry[]): string[] {
  return index
    .filter((e) => !existsSync(join(PATTERNS_DIR, e.path)))
    .map((e) => e.path);
}

/** Every on-disk .md that the index does not list (the drift that hid animation/). */
export function unindexedFiles(index: KbEntry[]): string[] {
  const listed = new Set(index.map((e) => e.path));
  return walk(PATTERNS_DIR)
    .map((f) => relative(PATTERNS_DIR, f).split("\\").join("/"))
    .filter((p) => !listed.has(p));
}

function main(): void {
  const check = process.argv.includes("--check");

  // Index-doc detection is for reporting only; INDEX.md files ARE indexed, since
  // wb_knowledge returning an animation INDEX.md is far better than returning
  // nothing for an animation query.
  let current: KbEntry[] = [];
  if (existsSync(INDEX_PATH)) {
    try {
      current = JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as KbEntry[];
    } catch {
      current = [];
    }
  }

  const next = buildIndex();
  const dangling = danglingEntries(next);
  if (dangling.length > 0) {
    console.error(`Refusing to write: ${dangling.length} indexed file(s) missing on disk:`);
    for (const d of dangling) console.error(`  ${d}`);
    process.exit(1);
  }

  const nextJson = `${JSON.stringify(next, null, 2)}\n`;
  const currentJson = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf-8") : "";

  if (check) {
    if (nextJson === currentJson) {
      console.log(`index.json is up to date (${next.length} entries).`);
      return;
    }
    const missing = unindexedFiles(current);
    console.error(
      `index.json is STALE: ${missing.length} file(s) on disk are not indexed` +
        (missing.length ? `:\n${missing.map((m) => `  ${m}`).join("\n")}` : "") +
        `\nRegenerate: npx tsx scripts/build-kb-index.ts`
    );
    process.exit(1);
  }

  writeFileSync(INDEX_PATH, nextJson, "utf-8");
  const before = current.length;
  console.log(`Wrote ${INDEX_PATH}: ${before} -> ${next.length} entries.`);
  const added = unindexedFiles(current);
  if (added.length) console.log(`Newly reachable:\n${added.map((a) => `  + ${a}`).join("\n")}`);
}

// Compare as paths: on Windows argv[1] is "C:\..." while import.meta.url is
// "file:///C:/...", so a string comparison never matched and the script
// silently did nothing when run directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
