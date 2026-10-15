import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../utils/logger.js";
import { expandQuery, stem } from "../utils/query-terms.js";
import { rankWiki } from "../index/wiki-sections.js";
import type { WikiPage } from "../index/types.js";

export { expandQuery, stem };

export interface KbEntry {
  path: string;
  title: string;
  description: string;
  keywords: string[];
}

let cachedKbIndex: KbEntry[] | null = null;
let cachedKbDir: string | null = null;

function loadIndex(kbDir: string): KbEntry[] {
  if (cachedKbIndex && cachedKbDir === kbDir) return cachedKbIndex;

  const indexPath = resolve(kbDir, "index.json");
  if (!existsSync(indexPath)) {
    logger.warn(`KB index not found: ${indexPath}`);
    return [];
  }
  try {
    const raw = readFileSync(indexPath, "utf-8");
    cachedKbIndex = JSON.parse(raw) as KbEntry[];
    cachedKbDir = kbDir;
    return cachedKbIndex;
  } catch (e) {
    logger.error(`Failed to load KB index: ${e}`);
    return [];
  }
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s\-_/.,;:!?()[\]{}]+/).filter(Boolean);
}

function scoreEntry(entry: KbEntry, tokens: string[]): number {
  let score = 0;
  // Pre-stem the entry side once per call rather than per token.
  const kwExact = new Set(entry.keywords);
  const kw = new Set(entry.keywords.map(stem));
  const tt = new Set(tokenize(entry.title).map(stem));
  const dt = new Set(tokenize(entry.description).map(stem));

  for (const t of tokens) {
    const s = stem(t);
    if (kwExact.has(t)) score += 3;
    else if (kw.has(s)) score += 2;
    if (tt.has(s)) score += 1;
    if (dt.has(s)) score += 1;
  }
  return score;
}

export function searchKb(
  kbDir: string,
  query: string,
  maxFiles: number
): { files: Array<{ title: string; content: string }>; usedIndex: boolean } {
  const index = loadIndex(kbDir);

  // Empty query or "index"/"list" → return index summary
  const q = query.trim().toLowerCase();
  if (!q || q === "index" || q === "list") {
    return { files: [], usedIndex: true };
  }

  const tokens = expandQuery(tokenize(query));
  const byIndex = index
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Index keywords alone missed multi-word questions ("how do I make an RPC"
  // ranked Conflict Building above Multiplayer & Replication), so fuse the
  // keyword ranking with a full-text ranking of the documents themselves.
  const docs = loadDocs(kbDir, index);
  const byContent = rankWiki(docs, query, 10);
  const fused = new Map<string, number>();
  // Scores are normalised to the best hit of each ranking, and content weighs
  // more: the generated keyword lists are broad (one document carries 120
  // keywords, "ai" and "characters" among them) and outvoted the document that
  // actually answers the question. Rank-position fusion was tried first and
  // flipped answers whenever a document was added.
  const CONTENT_WEIGHT = 0.65;
  const topIndex = byIndex[0]?.score ?? 1;
  const topContent = byContent[0]?.score ?? 1;
  for (const r of byIndex) {
    fused.set(r.entry.path, (fused.get(r.entry.path) ?? 0) + (1 - CONTENT_WEIGHT) * (r.score / topIndex));
  }
  for (const h of byContent) {
    const path = h.page.filename ?? "";
    fused.set(path, (fused.get(path) ?? 0) + CONTENT_WEIGHT * (h.score / topContent));
  }
  const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxFiles);

  if (ranked.length === 0) {
    return { files: [], usedIndex: true };
  }

  const docByPath = new Map(docs.map((d) => [d.filename, d]));
  const files = ranked.flatMap(([path]) => {
    const doc = docByPath.get(path);
    return doc ? [{ title: doc.title, content: doc.content }] : [];
  });

  return { files, usedIndex: false };
}

let cachedDocs: { dir: string; docs: WikiPage[] } | null = null;

/** Every indexed KB document, read once per process. */
function loadDocs(kbDir: string, index: KbEntry[]): WikiPage[] {
  if (cachedDocs && cachedDocs.dir === kbDir) return cachedDocs.docs;
  const patternsDir = resolve(kbDir, "patterns");
  const docs: WikiPage[] = [];
  for (const entry of index) {
    const filePath = resolve(patternsDir, entry.path);
    if (!existsSync(filePath)) {
      logger.warn(`KB file not found: ${filePath}`);
      continue;
    }
    try {
      docs.push({ title: entry.title, source: "arma", content: readFileSync(filePath, "utf-8"), filename: entry.path });
    } catch (e) {
      logger.warn(`Failed to read KB file ${filePath}: ${e}`);
    }
  }
  cachedDocs = { dir: kbDir, docs };
  return docs;
}

export function getIndexSummary(kbDir: string): string {
  const index = loadIndex(kbDir);
  if (index.length === 0) return "No KB entries found.";
  const lines = index.map((e) => `- **${e.title}**: ${e.description}`);
  return `# Arma Reforger KB — Available Topics\n\n${lines.join("\n")}`;
}

/** Test seam: drop the cached index so a test can point at a different dir. */
export function __resetKbCache(): void {
  cachedKbIndex = null;
  cachedKbDir = null;
  cachedDocs = null;
}
