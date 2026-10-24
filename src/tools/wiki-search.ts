import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SearchEngine } from "../index/search-engine.js";
import { splitSections } from "../index/wiki-sections.js";

const sourceLabel = (source: string) =>
  source === "bistudio-wiki" ? "BI Community Wiki" : source === "enfusion" ? "Enfusion Engine docs" : "Arma Reforger docs";

export function registerWikiSearch(server: McpServer, searchEngine: SearchEngine): void {
  server.registerTool(
    "wiki_search",
    {
      description:
        "Search pre-downloaded Bohemia Interactive Wiki (BIKI) content, tutorials, and guides about Enfusion engine concepts, scripting patterns, and Arma Reforger modding topics. " +
        "Always use this tool instead of trying to access the wiki via the web — all wiki content is already available here. " +
        "Each result shows the section that best matches the query; use wiki_read with the title (and optionally section) for more.",
      inputSchema: {
        query: z
          .string()
          .describe("Topic to search for (e.g., 'replication', 'event system', 'world systems')"),
        limit: z
          .number()
          .min(1)
          .max(10)
          .default(5)
          .describe("Maximum results to return"),
      },
    },
    async ({ query, limit }) => {
      const results = searchEngine.searchWikiSections(query, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No wiki/tutorial pages found matching "${query}". Try broader terms like "replication", "entities", "scripting", or "components".`,
            },
          ],
        };
      }

      // One result gets room for a whole section; several get a preview each.
      const maxLength = results.length === 1 ? 8000 : 1800;
      const parts = results.map(({ page, section }) => {
        const lines: string[] = [];
        lines.push(`## ${page.title}`);
        lines.push(`Source: ${sourceLabel(page.source)}${page.url ? ` — ${page.url}` : ""}`);
        const others = splitSections(page.content).map((s) => s.heading).filter((h) => h && h !== section.heading);
        if (section.heading) lines.push(`Best match: section "${section.heading}"`);
        lines.push("");
        const body = section.text.trim();
        if (body.length <= maxLength) {
          lines.push(body);
        } else {
          lines.push(body.slice(0, maxLength));
          lines.push(`\n... (section continues, ${body.length} chars — wiki_read title="${page.title}"${section.heading ? ` section="${section.heading}"` : ""})`);
        }
        if (others.length) {
          const toc = others.slice(0, 25).join(" · ");
          lines.push(`\nOther sections: ${toc}${others.length > 25 ? " · …" : ""}`);
        }
        return lines.join("\n");
      });

      return {
        content: [{ type: "text", text: parts.join("\n\n---\n\n") }],
      };
    }
  );
}
