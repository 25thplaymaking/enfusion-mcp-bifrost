import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { logger } from "../utils/logger.js";
import { stem } from "./kb-loader.js";

/**
 * PLAYBOOKS — the task-oriented layer over the topic-oriented KB.
 *
 * WHY THIS EXISTS
 * ---------------
 * `data/kb/patterns/` is organised by subject (Scripting_And_Core, Weapons_And_
 * Attachments, …). That is the right shape for a human browsing a shelf and the
 * wrong shape for an agent holding a task. An agent asked to "make a UI layout"
 * does not want every UI fact in the repository; it wants the ordered procedure,
 * the preconditions that make it work, the exact tool calls, the traps, and how
 * to tell it succeeded. Handing it a 94 KB topic dump instead is how agents end up
 * confidently building the wrong thing.
 *
 * A playbook is that procedure, one file per task, deliberately short. Each one
 * names its verification and — just as important — its failure modes, because the
 * expensive mistakes in Enfusion are the ones that compile cleanly and fail later.
 *
 * Retrieval reuses kb-loader's stemmer so "make a ui layout" and "layout" agree.
 */

export interface Playbook {
  id: string;
  title: string;
  /** One line: what the reader will have when they are done. */
  goal: string;
  /** Phrasings an agent would plausibly use. Drives retrieval. */
  triggers: string[];
  /** MCP tool names this playbook calls, in order. */
  tools: string[];
  /** Playbook ids to read next / alongside. */
  seeAlso: string[];
  /** True when a human must click something in the GUI. */
  humanStep: boolean;
}

export interface LoadedPlaybook extends Playbook {
  content: string;
}

const PLAYBOOKS_DIR_NAME = "playbooks";

interface PlaybookIndex {
  playbooks: Playbook[];
}

let cachedIndex: PlaybookIndex | null = null;
let cachedDir: string | null = null;

function loadIndex(kbRoot: string): PlaybookIndex {
  // Playbooks live in their own subdirectory under the KB root, so resolve the
  // directory once here rather than at each call site. Callers pass the KB root
  // (data/kb) for symmetry with searchKb.
  const dir = resolve(kbRoot, PLAYBOOKS_DIR_NAME);
  if (cachedIndex && cachedDir === dir) return cachedIndex;
  const p = resolve(dir, "index.json");
  if (!existsSync(p)) {
    logger.warn(`Playbook index not found: ${p}`);
    cachedIndex = { playbooks: [] };
    cachedDir = dir;
    return cachedIndex;
  }
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8")) as Partial<PlaybookIndex>;
    // Validate the shape: a truncated or wrong-shaped file must degrade to "no
    // playbooks" (which renders the catalogue message), never throw. An
    // unparseable index taking down every query is worse than an empty one.
    cachedIndex =
      Array.isArray(parsed.playbooks) && parsed.playbooks.every((x) => x && typeof x.id === "string")
        ? { playbooks: parsed.playbooks as Playbook[] }
        : { playbooks: [] };
    if (!Array.isArray(parsed.playbooks)) {
      logger.warn(`Playbook index at ${p} has no usable "playbooks" array; treating as empty.`);
    }
    cachedDir = dir;
  } catch (e) {
    logger.error(`Failed to load playbook index: ${e}`);
    cachedIndex = { playbooks: [] };
    cachedDir = dir;
  }
  return cachedIndex;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s\-_/.,;:!?()[\]{}]+/).filter(Boolean);
}

/**
 * Score a playbook against a query. Trigger phrases dominate: they are written
 * in the agent's own voice, which is exactly what a task query sounds like.
 * Title and goal contribute, tools and see-also are not scored (they are
 * navigation, not description).
 */
function score(pb: Playbook, tokens: string[]): number {
  let score = 0;
  const triggerTokens = pb.triggers.flatMap((t) => tokenize(t)).map(stem);
  const triggerSet = new Set(triggerTokens);
  const titleSet = new Set(tokenize(pb.title).map(stem));
  const goalSet = new Set(tokenize(pb.goal).map(stem));

  for (const t of tokens) {
    const s = stem(t);
    if (triggerSet.has(s)) score += 3;
    if (titleSet.has(s)) score += 2;
    if (goalSet.has(s)) score += 1;
  }
  // A multi-word trigger that matches in full is a much stronger signal than one
  // stray word, so reward phrase hits explicitly.
  for (const trig of pb.triggers) {
    const words = tokenize(trig).map(stem);
    if (words.length < 2) continue;
    if (words.every((w) => tokens.includes(w))) score += 4;
  }
  return score;
}

function readContent(dir: string, id: string): string | null {
  const p = resolve(dir, `${id}.md`);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, "utf-8");
  } catch (e) {
    logger.warn(`Failed to read playbook ${id}: ${e}`);
    return null;
  }
}

/** Every playbook .md on disk — used by the index-integrity test. */
export function playbookFilesOnDisk(dir: string): string[] {
  const base = resolve(dir, PLAYBOOKS_DIR_NAME);
  if (!existsSync(base)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".md")) out.push(relative(base, full).split("\\").join("/"));
    }
  };
  walk(base);
  return out;
}

export interface PlaybookSearchResult {
  /** True when nothing matched and the caller should show the catalogue. */
  showCatalogue: boolean;
  playbooks: LoadedPlaybook[];
}

/**
 * Resolve a task description to playbooks. `exact` short-circuits on an id match so
 * an agent that already knows which playbook it wants gets exactly that one.
 */
export function searchPlaybooks(
  dir: string,
  query: string,
  maxFiles: number
): PlaybookSearchResult {
  const { playbooks } = loadIndex(dir);
  const q = query.trim().toLowerCase();
  const base = resolve(dir, PLAYBOOKS_DIR_NAME);

  if (!q || q === "index" || q === "list" || q === "catalogue") {
    return { showCatalogue: true, playbooks: [] };
  }

  // Exact id, or a bare id mentioned in a longer query, wins outright.
  const byId = playbooks.filter((p) => p.id === q || q.includes(p.id));
  if (byId.length > 0) {
    const loaded = byId
      .map((p) => ({ ...p, content: readContent(base, p.id) }))
      .filter((p): p is LoadedPlaybook => p.content !== null);
    if (loaded.length > 0) return { showCatalogue: false, playbooks: loaded };
  }

  const tokens = tokenize(q);
  const scored = playbooks
    .map((pb) => ({ pb, score: score(pb, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles);

  if (scored.length === 0) return { showCatalogue: true, playbooks: [] };

  const loaded = scored
    .map(({ pb }) => ({ ...pb, content: readContent(base, pb.id) }))
    .filter((p): p is LoadedPlaybook => p.content !== null);

  return { showCatalogue: false, playbooks: loaded };
}

export function playbookCatalogue(dir: string): string {
  const { playbooks } = loadIndex(dir);
  if (playbooks.length === 0) return "No playbooks found.";

  const byHuman: Record<string, Playbook[]> = {};
  for (const pb of playbooks) {
    const bucket = pb.humanStep ? "needs a human click" : "fully scriptable";
    (byHuman[bucket] ??= []).push(pb);
  }

  const lines: string[] = ["# Enfusion Playbooks — pick a task", ""];
  for (const [bucket, group] of Object.entries(byHuman)) {
    lines.push(`## ${bucket}`);
    for (const pb of group) {
      lines.push(`- **${pb.id}** — ${pb.title}. ${pb.goal}`);
    }
    lines.push("");
  }
  lines.push(
    "Read a playbook BEFORE starting the task. Each one lists its preconditions, the " +
      "exact tool calls, the traps, and how to verify the result."
  );
  return lines.join("\n");
}

/** Test seam: drop the cached index so a test can point at a different dir. */
export function __resetPlaybookCache(): void {
  cachedIndex = null;
  cachedDir = null;
}
