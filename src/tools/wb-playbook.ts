import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { searchPlaybooks, playbookCatalogue } from "./playbook-loader.js";

/**
 * Per-playbook ceiling on returned content. Playbooks are written to stay well
 * under this (they are procedures, not references), so truncation here signals a
 * playbook that has grown into a reference doc and should be split — the KB
 * pattern files are the right home for that material.
 */
const MAX_PLAYBOOK_CHARS = 24_000;

const KB_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "kb"
);

/**
 * wb_playbook — task-oriented procedures for Enfusion authoring.
 *
 * Why a second knowledge tool, next to wb_knowledge:
 *
 *   wb_knowledge  answers "what does this engine concept do?"   (subject-oriented)
 *   wb_playbook   answers "how do I actually do this task?"      (task-oriented)
 *
 * The distinction matters because an agent working from topic dumps repeatedly
 * starts a task without its preconditions, invents a plausible-but-wrong tool
 * sequence, and only discovers the problem when something silently fails to
 * replicate. A playbook front-loads the preconditions and ends with an explicit
 * verification, which is the part that was always missing.
 *
 * Left hand-written for the same reason as wb_knowledge: it makes zero Workbench
 * calls and holds no client, so appending a connection footer would assert a
 * connection it never probed.
 */
export function registerWbPlaybook(server: McpServer): void {
  server.registerTool(
    "wb_playbook",
    {
      description:
        "Get a step-by-step playbook for an Enfusion/Workbench authoring task. " +
        "Call this BEFORE starting rather than after failing: each playbook lists the " +
        "preconditions that make the task work, the exact MCP tool calls in order, the " +
        "traps that cause silent failures, and how to verify the result. " +
        "Covers: new addon, layout/UI, menus, script authoring, prefabs, configs, " +
        "model import from Blender, model/prop creation, animation graphs, particle " +
        "effects, terrain and world authoring, and live Workbench operations. " +
        "Call with query='catalogue' to list every playbook.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "The task in your own words (e.g. 'import a truck model from blender', " +
              "'create a hud layout', 'set up terrain for a new map', 'add a particle " +
              "effect'). Use 'catalogue' to list all playbooks."
          ),
        max_files: z
          .number()
          .min(1)
          .max(3)
          .default(2)
          .describe("Maximum number of playbooks to return (default 2)"),
      },
    },
    async ({ query, max_files }) => {
      const result = searchPlaybooks(KB_DIR, query, max_files);

      if (result.showCatalogue || result.playbooks.length === 0) {
        const catalogue = playbookCatalogue(KB_DIR);
        const prefix =
          result.playbooks.length === 0 && query.trim().toLowerCase() !== "catalogue"
            ? `No playbook matched "${query}". Available playbooks:\n\n`
            : "";
        return { content: [{ type: "text", text: prefix + catalogue }] };
      }

      const parts = result.playbooks.map((pb) => {
        // The YAML front-matter is machine metadata for the index generator
        // (id/triggers/tools/seeAlso drive retrieval). It must not be rendered
        // into the body an agent reads — it is noise at the top of the answer
        // and it duplicates the tool's own routing.
        const body = stripFrontMatter(pb.content);
        const text =
          body.length <= MAX_PLAYBOOK_CHARS
            ? body
            : `${body.slice(0, MAX_PLAYBOOK_CHARS)}\n\n... (truncated at ${MAX_PLAYBOOK_CHARS.toLocaleString()} of ${body.length.toLocaleString()} chars — this playbook has outgrown its format; use wb_knowledge for the underlying detail)`;
        return `## ${pb.title}\n\n${text}`;
      });

      return { content: [{ type: "text", text: parts.join("\n\n---\n\n") }] };
    }
  );
}

/**
 * Remove a leading YAML front-matter block, if present.
 *
 * Kept here rather than in the loader because the loader must return the file
 * verbatim — the index generator reads the front-matter from disk, not through
 * this tool. Only the RENDERED body drops it.
 */
function stripFrontMatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  // The closing delimiter's own line ending, then skip a blank line.
  const after = content.indexOf("\n", end + 1);
  if (after === -1) return content;
  return content.slice(after + 1).replace(/^\r?\n/, "");
}
