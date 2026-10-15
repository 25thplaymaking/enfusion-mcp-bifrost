import { expandQuery, stem } from "../utils/query-terms.js";
import type { WikiPage } from "./types.js";

/** One heading-delimited part of a wiki page (Markdown capture). */
export interface WikiSection {
  heading: string;
  level: number;
  text: string;
}

export interface WikiHit {
  page: WikiPage;
  score: number;
  section: WikiSection;
}

/**
 * Words that carry no topic. Without this, "how do I replicate to clients"
 * scored every page that contains "to" or "do", which is all of them.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "for", "and", "or", "is", "are", "be", "do", "does", "how",
  "i", "my", "me", "what", "when", "where", "why", "which", "with", "it", "its", "this", "that", "can",
  "use", "using", "via", "from", "by", "at", "as", "into", "about", "should", "would", "make", "way",
]);

const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));

/** Split a page at Markdown headings. Pages without headings are one section. */
export function splitSections(content: string): WikiSection[] {
  const sections: WikiSection[] = [];
  let current: WikiSection = { heading: "", level: 0, text: "" };
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|````)/.test(line)) inFence = !inFence;
    const h = !inFence && line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (h) {
      if (current.text.trim() || current.heading) sections.push(current);
      current = { heading: h[2], level: h[1].length, text: `${line}\n` };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim() || current.heading) sections.push(current);
  return sections;
}

/**
 * A bounded table of contents. Diag Menu alone has hundreds of headings; an
 * uncapped list was 32 K chars. Deeper levels are dropped first.
 */
export function formatToc(sections: WikiSection[], maxChars = 3_000): string {
  const headed = sections.filter((s) => s.heading);
  for (const maxLevel of [6, 3, 2, 1]) {
    const lines = headed
      .filter((s) => s.level <= maxLevel)
      .map((s) => `${"  ".repeat(Math.max(0, s.level - 2))}- ${s.heading}`);
    const text = lines.join("\n");
    if (text.length <= maxChars) {
      const hidden = headed.length - lines.length;
      return hidden > 0 ? `${text}\n(${hidden} deeper headings not listed)` : text;
    }
  }
  const top = headed.filter((s) => s.level <= 2).map((s) => `- ${s.heading}`);
  let text = "";
  let shown = 0;
  for (const l of top) {
    if (text.length + l.length + 1 > maxChars) break;
    text += `${l}\n`;
    shown++;
  }
  return `${text}(${headed.length - shown} more headings not listed)`;
}

/**
 * Accept the forms agents actually pass: "Scripting: Keywords",
 * "Arma_Reforger:Scripting:_Keywords", or a full community.bistudio.com URL.
 */
export function normalizeWikiTitle(input: string): string {
  let t = input.trim();
  t = t.replace(/^https?:\/\/community\.bistudio\.com\/wiki\//i, "");
  t = t.replace(/[?#].*$/, "");
  try { t = decodeURIComponent(t); } catch { /* keep as-is */ }
  t = t.replace(/_/g, " ").replace(/^Arma Reforger:\s*/i, "");
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Score every section of one document against a query (best first). Used to
 * trim a long KB document to the parts that answer the question.
 */
export function rankSections(content: string, query: string): Array<{ section: WikiSection; score: number }> {
  const terms = new Set(expandQuery(tokenize(query)).map(stem));
  return splitSections(content)
    .map((section) => {
      const heading = new Set(tokenize(section.heading).map(stem));
      const counts = new Map<string, number>();
      for (const t of tokenize(section.text)) { const s = stem(t); counts.set(s, (counts.get(s) ?? 0) + 1); }
      let score = 0;
      for (const t of terms) {
        if (heading.has(t)) score += 3;
        const tf = counts.get(t) ?? 0;
        if (tf) score += Math.min(3, Math.log2(1 + tf));
      }
      return { section, score };
    })
    .sort((a, b) => b.score - a.score);
}

interface PageIndex {
  title: Set<string>;
  sections: Array<{ section: WikiSection; heading: Set<string>; tf: Map<string, number>; len: number; lower: string }>;
}

const cache = new WeakMap<WikiPage, PageIndex>();
const CHUNK_CHARS = 3_000;

/**
 * Break a long section into paragraph-aligned chunks (never inside a code
 * fence) so a ranking hit points at a passage, not a 40 K wall of text. The
 * legacy Doxygen pages have no headings at all and were otherwise one section.
 */
function chunkSection(section: WikiSection): WikiSection[] {
  if (section.text.length <= CHUNK_CHARS * 2) return [section];
  const out: WikiSection[] = [];
  let buf = "";
  let inFence = false;
  const flush = () => {
    if (buf.trim()) {
      const n = out.length + 1;
      out.push({ heading: section.heading ? `${section.heading} (part ${n})` : `part ${n}`, level: section.level, text: buf });
    }
    buf = "";
  };
  for (const line of section.text.split("\n")) {
    if (/^\s*(```|````)/.test(line)) inFence = !inFence;
    buf += `${line}\n`;
    if (!inFence && line.trim() === "" && buf.length >= CHUNK_CHARS) flush();
  }
  flush();
  return out;
}

function indexPage(page: WikiPage): PageIndex {
  let idx = cache.get(page);
  if (idx) return idx;
  idx = {
    title: new Set(tokenize(page.title).map(stem)),
    sections: splitSections(page.content).flatMap(chunkSection).map((section) => {
      const tf = new Map<string, number>();
      const tokens = tokenize(section.text);
      for (const t of tokens) {
        const s = stem(t);
        tf.set(s, (tf.get(s) ?? 0) + 1);
      }
      return {
        section,
        heading: new Set(tokenize(section.heading).map(stem)),
        tf,
        len: tokens.length,
        lower: section.text.toLowerCase().replace(/\s+/g, " "),
      };
    }),
  };
  cache.set(page, idx);
  return idx;
}

/**
 * Rank pages for a query and pick each page's best-matching section, so a
 * result shows the passage that answered the query rather than the page intro.
 */
export function rankWiki(pages: readonly WikiPage[], query: string, limit: number): WikiHit[] {
  const raw = tokenize(query);
  if (raw.length === 0) return [];
  const base = [...new Set(raw.map(stem))];
  const expanded = new Set(expandQuery(raw).map(stem));
  const df = new Map<string, number>();
  let totalLen = 0;
  let sectionCount = 0;
  for (const page of pages) {
    const seen = new Set<string>();
    for (const s of indexPage(page).sections) {
      for (const k of s.tf.keys()) seen.add(k);
      totalLen += s.len;
      sectionCount++;
    }
    for (const k of seen) df.set(k, (df.get(k) ?? 0) + 1);
  }
  const idf = (t: string) => Math.log(1 + pages.length / (1 + (df.get(t) ?? 0)));
  const avgLen = sectionCount ? totalLen / sectionCount : 1;
  // Agents paste compiler messages verbatim ("Multiple declaration of class");
  // a section containing the whole phrase is the answer, however long it is.
  const phrase = query.toLowerCase().replace(/['"`]/g, "").replace(/\s+/g, " ").trim();
  const phraseBonus = phrase.length >= 12 && raw.length >= 2 ? base.reduce((sum, t) => sum + idf(t), 0) * 1.5 : 0;
  // BM25 term saturation with length normalisation (k1 1.2, b 0.75).
  const tfWeight = (tf: number, len: number) => (tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * len) / avgLen));

  // A page is as good as its best section (weighted by how many query terms
  // that section covers), plus a little for a runner-up. Summing every section
  // let the two 130 K+ pages (Diag Menu, Scenario Framework) into most results.
  const hits: WikiHit[] = [];
  for (const page of pages) {
    const idx = indexPage(page);
    let titleScore = 0;
    const titleTerms = new Set<string>();
    for (const t of base) if (idx.title.has(t)) { titleScore += 4 * idf(t); titleTerms.add(t); }

    const scored = idx.sections.map((s) => {
      let sScore = 0;
      const covered = new Set(titleTerms);
      for (const t of expanded) {
        const weight = base.includes(t) ? 1 : 0.4;
        const tf = s.tf.get(t) ?? 0;
        if (tf > 0) sScore += weight * idf(t) * tfWeight(tf, s.len);
        if (s.heading.has(t)) sScore += weight * 2 * idf(t);
        if ((tf > 0 || s.heading.has(t)) && base.includes(t)) covered.add(t);
      }
      if (phraseBonus && s.lower.replace(/['"`]/g, "").includes(phrase)) sScore += phraseBonus;
      return { section: s.section, score: sScore * (0.4 + covered.size / base.length) };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || (best.score <= 0 && titleScore <= 0)) continue;
    const score = titleScore + best.score + 0.15 * (scored[1]?.score ?? 0);
    hits.push({ page, score, section: best.section });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
