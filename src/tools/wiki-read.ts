import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SearchEngine } from "../index/search-engine.js";
import { formatToc, splitSections, type WikiSection } from "../index/wiki-sections.js";

/**
 * Default page budget. The largest pages (Diag Menu, Scenario Framework, Assets)
 * exceed 120 K chars; returning them whole overflowed the client's result cap.
 */
export const WIKI_READ_DEFAULT_CHARS = 30_000;

/** Sections whose heading contains `wanted`, each with its sub-sections. */
export function pickSections(sections: WikiSection[], wanted: string): WikiSection[] {
  const needle = wanted.toLowerCase().replace(/^#+\s*/, "").trim();
  const out: WikiSection[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!s.heading.toLowerCase().includes(needle)) continue;
    let text = s.text;
    for (let j = i + 1; j < sections.length && sections[j].level > s.level; j++) text += sections[j].text;
    out.push({ ...s, text });
    while (i + 1 < sections.length && sections[i + 1].level > s.level) i++;
  }
  return out;
}

export function renderWikiPage(
  page: { title: string; content: string; url?: string; source: string },
  opts: { section?: string; offset?: number; maxChars?: number } = {}
): string {
  const label =
    page.source === "bistudio-wiki" ? "BI Community Wiki" : page.source === "enfusion" ? "Enfusion Engine docs" : "Arma Reforger docs";
  const head = `## ${page.title}\nSource: ${label}${page.url ? ` — ${page.url}` : ""}\n`;
  const sections = splitSections(page.content);
  const toc = formatToc(sections);
  const maxChars = opts.maxChars ?? WIKI_READ_DEFAULT_CHARS;

  if (opts.section) {
    const picked = pickSections(sections, opts.section);
    if (picked.length === 0) {
      return `${head}\nNo section heading contains "${opts.section}". Sections:\n${toc || "(this page has no headings)"}`;
    }
    const body = picked.map((s) => s.text.trim()).join("\n\n");
    return body.length <= maxChars
      ? `${head}\n${body}`
      : `${head}\n${body.slice(0, maxChars)}\n\n... (section truncated at ${maxChars} of ${body.length} chars — pass a more specific section or raise maxChars)`;
  }

  const offset = Math.min(Math.max(opts.offset ?? 0, 0), page.content.length);
  if (offset === 0 && page.content.length <= maxChars) return `${head}\n${page.content}`;

  // Cut on a line boundary so code fences and table rows are not split mid-line.
  let end = Math.min(offset + maxChars, page.content.length);
  if (end < page.content.length) {
    const nl = page.content.lastIndexOf("\n", end);
    if (nl > offset) end = nl;
  }
  const chunk = page.content.slice(offset, end);
  const notes = [`(chars ${offset}-${end} of ${page.content.length})`];
  if (end < page.content.length) notes.push(`next: offset=${end}, or read one part with section="<heading>"`);
  const contents = offset === 0 && toc ? `\nSections:\n${toc}\n` : "";
  return `${head}${notes.join(" — ")}\n${contents}\n${chunk}`;
}

export function registerWikiRead(server: McpServer, searchEngine: SearchEngine): void {
  server.registerTool(
    "wiki_read",
    {
      description:
        "Read a wiki page by title (from wiki_search). Code samples are fenced with their indentation; tables are kept. " +
        "Accepts the plain title, the wiki form 'Arma_Reforger:Page_Name', or the page URL. " +
        "Long pages return the first part plus a section list: pass section to read one heading, or offset to continue.",
      inputSchema: {
        title: z.string().optional().describe("Page title (from wiki_search results), wiki-style name, or URL"),
        page: z.string().optional().describe("Alias of title"),
        section: z.string().optional().describe("Return only sections whose heading contains this text (with their sub-sections)"),
        offset: z.number().int().min(0).optional().describe("Character offset to continue a long page from"),
        maxChars: z.number().int().min(1000).max(60000).optional().describe(`Characters to return (default ${WIKI_READ_DEFAULT_CHARS})`),
      },
    },
    async ({ title, page: pageAlias, section, offset, maxChars }) => {
      const wanted = title ?? pageAlias;
      if (!wanted) {
        return { content: [{ type: "text", text: "Pass the page title as `title` (use wiki_search to find one)." }], isError: true };
      }
      const page = searchEngine.getWikiPage(wanted);

      if (!page) {
        const suggestions = searchEngine.searchWiki(wanted, 3);
        const text = suggestions.length > 0
          ? `No wiki page found with title "${wanted}". Did you mean: ${suggestions.map((p) => `"${p.title}"`).join(", ")}?`
          : `No wiki page found with title "${wanted}". Use wiki_search to find available pages.`;
        return { content: [{ type: "text", text }] };
      }

      return { content: [{ type: "text", text: renderWikiPage(page, { section, offset, maxChars }) }] };
    }
  );
}
