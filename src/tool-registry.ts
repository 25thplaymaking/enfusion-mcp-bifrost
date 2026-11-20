/**
 * The tool registry as plain data, for callers that are not an MCP transport.
 *
 * `registerTools()` is written against `McpServer`. Rather than duplicate 63
 * registrations, this hands it a recorder that keeps each tool's name,
 * description, zod input shape and handler. The CLI (src/cli.ts) then calls the
 * very handler the MCP server calls, so the two surfaces cannot drift. ADR-0008.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import { registerTools } from "./server.js";
import type { Config } from "./config.js";

export interface ToolResultContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  content?: ToolResultContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (input: Record<string, unknown>, extra: { signal: AbortSignal }) => Promise<ToolResult>;
}

/** Tools that make no Workbench call despite the wb_ prefix. */
const OFFLINE_WB = new Set(["wb_knowledge", "wb_playbook"]);

/** True when a tool needs no running Workbench. The `wb_` prefix alone does not decide it. */
export function isOfflineTool(name: string): boolean {
  return !name.startsWith("wb_") || OFFLINE_WB.has(name);
}

export function collectTools(config: Config): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const recorder = {
    registerTool(
      name: string,
      def: { description?: string; inputSchema?: ZodRawShape },
      handler: RegisteredTool["handler"]
    ) {
      tools.set(name, {
        name,
        description: def.description ?? "",
        inputSchema: def.inputSchema ?? {},
        handler,
      });
    },
    // Prompts and resources are MCP-only concepts; the CLI has no use for them.
    registerPrompt() {},
    registerResource() {},
  };
  registerTools(recorder as unknown as McpServer, config);
  return tools;
}
