#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { registerTools } from "./server.js";
import { loadConfig } from "./config.js";
import { logger } from "./utils/logger.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const config = loadConfig();

const server = new McpServer({
  name: "bifrost-enfusion-mcp",
  version,
}, {
  instructions: "For Codex/Astra Workbench tasks, start with wb_capabilities (live=true when connected). " +
    "Configured default folders are not live project identity: inspect loaded IDs and pass an explicit projectPath for authoring. " +
    "Use project read/search/edit for all supported text source formats; read hashes support conflict-checked edits. " +
    "Use wb_bridge to install/update handlers in the verified loaded addon without launching. Read/deploy local workflow documentation with wb_docs. " +
    "Use wb_editor_module containers/inspect and returned node paths/entityId for native navigation, then expectedTarget/expectedValue for property edits and verify readback. " +
    "Read unsaved buffers with wb_script_editor readRange; writes require expectedFile/expectedLinesCount/expectedText. " +
    "Use wb_debug logs/cursors and debugger panes; observe attached/paused state, callstack and watches through computer use before/after stepping. " +
    "Use wb_batch for ordered existing operations, inspecting structured per-step outcomes; it is not atomic. " +
    "Read schemas: wb_script_editor lines are zero-based; project file lines are one-based. " +
    "Use api_search, wiki_search/wiki_read, then game_read for engine evidence. " +
    "Ordinary calls never launch Workbench. Existing user authorization can satisfy allowForeground without asking repeatedly. " +
    "Use native wb_validate_scripts/wb_reload for compilation; never execute script reload from a custom handler menu. " +
    "Graph source editing does not imply engine compilation or live multiplayer validation.",
});

registerTools(server, config);

const transport = new StdioServerTransport();
await server.connect(transport);
logger.info("enfusion-mcp server started");
