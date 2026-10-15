import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { searchKb, getIndexSummary } from "./kb-loader.js";
import { formatToc, rankSections, splitSections } from "../index/wiki-sections.js";
import { pickSections } from "./wiki-read.js";

/**
 * Ceiling on one whole answer. The old per-file cap (30 K) still let three
 * files reach 90 K chars, which overflowed the client's result limit in the
 * field ("AI movement individual move precision door navmesh ..." with
 * max_files 3). The budget is now shared across files.
 */
export const KB_TOTAL_CHARS = 45_000;

/**
 * Split one budget across documents: short ones take only what they need and
 * hand the rest to the long ones. Returns each document's allowance in input order.
 */
export function allocateKbBudget(lengths: number[], total: number): number[] {
  const alloc = new Array<number>(lengths.length).fill(0);
  const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => a.len - b.len);
  let remaining = total;
  order.forEach(({ len, i }, k) => {
    const share = Math.floor(remaining / (order.length - k));
    alloc[i] = Math.min(len, share);
    remaining -= alloc[i];
  });
  return alloc;
}

const KB_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "kb"
);

/**
 * Fit one KB document into `budget`: whole if it fits, otherwise its section
 * list plus the sections that best match the query, in document order.
 */
export function fitKbDocument(content: string, query: string, budget: number): string {
  if (content.length <= budget) return content;
  const sections = splitSections(content);
  const toc = formatToc(sections, 2_000);
  const header = `*(Long document — showing the sections that match the query. Sections:)*\n${toc}\n\n`;
  const ranked = rankSections(content, query).filter((r) => r.score > 0);
  const chosen = new Set<string>();
  let used = header.length;
  for (const { section } of ranked) {
    if (used + section.text.length > budget) continue;
    chosen.add(section.text);
    used += section.text.length;
  }
  const body = sections.filter((s) => chosen.has(s.text)).map((s) => s.text.trim()).join("\n\n");
  if (!body) {
    return `${header}${content.slice(0, Math.max(0, budget - header.length))}\n\n... (truncated — pass section="<heading>" to read one part)`;
  }
  return `${header}${body}\n\n*(Other sections omitted — pass section="<heading>" to read one.)*`;
}

/**
 * wb_knowledge — search the bundled modding knowledge base.
 *
 * Left hand-written (evaluated and deliberately excluded from
 * defineWorkbenchTool, T5/#27): despite the `wb_` prefix this tool makes **zero
 * Workbench calls** and holds no `WorkbenchClient`. It wants neither the mode
 * guard nor the connection footer — appending "Workbench: …" to a static
 * file-system lookup would assert a connection the tool never probed. Its only
 * failure mode is a filesystem read, which the MCP SDK surfaces on its own.
 */
export function registerWbKnowledge(server: McpServer): void {
  server.registerTool(
    "wb_knowledge",
    {
      description:
        "Search the Arma Reforger modding knowledge base — distilled pattern files covering scripting, " +
        "audio, weapons, vehicles, AI, UI, game modes, animation, and all other modding domains. " +
        "Use this before writing EnforceScript code or setting up any Enfusion modding system. " +
        "Long documents return only the sections matching the query; pass section to read one heading. " +
        "Call with query='index' to see all available topics.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Topic to look up (e.g. 'replication', 'weapon suppressor', 'scenario framework', 'audio signals'). Use 'index' to list all topics."
          ),
        max_files: z
          .number()
          .min(1)
          .max(4)
          .default(2)
          .describe("Maximum number of pattern files to return (default 2)"),
        section: z
          .string()
          .optional()
          .describe("Return only the sections of the best-matching file whose heading contains this text"),
      },
    },
    async ({ query, max_files, section }) => {
      const result = searchKb(KB_DIR, query, section ? 1 : max_files);

      if (result.usedIndex || result.files.length === 0) {
        const summary = getIndexSummary(KB_DIR);
        const prefix =
          result.files.length === 0 && !result.usedIndex
            ? `No KB entries matched "${query}". Showing all available topics:\n\n`
            : "";
        return {
          content: [{ type: "text", text: prefix + summary }],
        };
      }

      if (section) {
        const f = result.files[0];
        const picked = pickSections(splitSections(f.content), section);
        const text = picked.length
          ? picked.map((s) => s.text.trim()).join("\n\n").slice(0, KB_TOTAL_CHARS)
          : `No heading in "${f.title}" contains "${section}". Headings:\n` +
            splitSections(f.content).filter((s) => s.heading).map((s) => `- ${s.heading}`).join("\n");
        return { content: [{ type: "text", text: `## ${f.title}\n\n${text}` }] };
      }

      const alloc = allocateKbBudget(result.files.map((f) => f.content.length), KB_TOTAL_CHARS);
      const parts = result.files.map((f, i) => `## ${f.title}\n\n${fitKbDocument(f.content, query, alloc[i])}`);

      return {
        content: [{ type: "text", text: parts.join("\n\n---\n\n") }],
      };
    }
  );
}
