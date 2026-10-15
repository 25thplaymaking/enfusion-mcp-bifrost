import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { closeSync, existsSync, lstatSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { foregroundAuthorized } from "../workbench/tool-helpers.js";

const logNames = ["script.log", "console.log", "error.log"] as const;
export const DEBUG_CONTROLS = {
  continue: { menu: "Debug,Continue", shortcut: "F5", prerequisite: "Debugger attached and paused; F5 can start the world when not debugging." },
  stepOver: { menu: "Debug,Step Over", shortcut: "F10", prerequisite: "Debugger attached and paused." },
  stepInto: { menu: "Debug,Step Into", shortcut: "F11", prerequisite: "Debugger attached and paused." },
  stepOut: { menu: "Debug,Step Out", shortcut: "Shift+F11", prerequisite: "Debugger attached and paused inside a function." },
  toggleBreakpoint: { menu: "Debug,Toggle Breakpoint", shortcut: "F9", prerequisite: "Inspect the current file/line and existing breakpoint state before toggling." },
  debugGame: { menu: "Debug,Debug Game", prerequisite: "The intended game is running; verify attachment in the editor title." },
  debugWorkbench: { menu: "Debug,Debug Workbench", prerequisite: "Debug Workbench scripts; use computer use to step a paused Workbench." },
  debugCustom: { menu: "Debug,Debug Custom", prerequisite: "Observe and configure the attachment dialog for the intended client/server." },
} as const;
const cursorSchema = z.object({ folder: z.string().regex(/^logs_[\d_-]+$/), log: z.enum(logNames), offset: z.number().int().nonnegative(), birthtime: z.number() }).strict();

export function readRuntimeLog(profile: string, log: typeof logNames[number], cursor?: string, maxLines = 150) {
  const logsRoot = join(profile, "logs");
  const directories = existsSync(logsRoot) ? readdirSync(logsRoot, { withFileTypes: true }).filter(e => e.isDirectory() && !e.isSymbolicLink() && /^logs_[\d_-]+$/.test(e.name)).map(e => e.name).sort().reverse() : [];
  const folder = directories[0];
  if (!folder) return { available: false, log, reason: "No Workbench log session exists.", lines: [], diagnostics: [] };
  const path = join(logsRoot, folder, log);
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) return { available: false, log, folder, reason: "Log is absent in the latest Workbench session.", lines: [], diagnostics: [] };
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error("Log target is not a regular file.");
  const previous = cursor ? cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))) : undefined;
  if (previous && previous.log !== log) throw new Error("Cursor belongs to a different log.");
  const reset = !!previous && (previous.folder !== folder || previous.birthtime !== stat.birthtimeMs || previous.offset > stat.size);
  const budget = 256 * 1024;
  let offset = previous && !reset ? previous.offset : Math.max(0, stat.size - budget);
  const startOffset = offset;
  const length = Math.min(budget, stat.size - offset);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  let bytesRead: number;
  try { bytesRead = readSync(fd, buffer, 0, length, offset); } finally { closeSync(fd); }
  // Count boundaries in bytes: decoding an incomplete UTF-8 code point must
  // never move a cursor beyond the actual source bytes.
  let consumed = bytesRead, lineCount = 0;
  for (let i = 0; i < bytesRead; i++) if (buffer[i] === 10 && ++lineCount === maxLines) { consumed = i + 1; break; }
  const delivered = buffer.subarray(0, consumed).toString("utf8");
  offset += consumed;
  const lines = delivered.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const diagnostics = lines.flatMap((line, index) => {
    const severity = /\b(?:SCRIPT|ENGINE|WORLD|RESOURCES?)\s*\(E\)|Virtual Machine Exception|Can't compile|\bERROR\b|Resources are leaking/i.test(line) ? "error"
      : /\b(?:SCRIPT|ENGINE|WORLD|RESOURCES?)\s*\(W\)|\bWARNING\b/i.test(line) ? "warning" : null;
    if (!severity) return [];
    const location = line.match(/@"([^"\r\n]+\.c),(\d+)"/) ?? line.match(/([^\s"\r\n]+\.c)\((\d+)\)/);
    return [{ severity, message: line, ...(location ? { file: location[1], line: Number(location[2]) } : {}), context: lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 9)) }];
  });
  return { available: true, log, folder, path, reset, startOffset, endOffset: offset,
    nextCursor: Buffer.from(JSON.stringify({ folder, log, offset, birthtime: stat.birthtimeMs })).toString("base64url"),
    partial: startOffset > 0 && !previous || offset < stat.size, hasMore: offset < stat.size, lines, diagnostics };
}

export function registerWbDebug(server: McpServer, config: Config, client: WorkbenchClient) {
  server.registerTool("wb_debug", {
    description: "Debug with bounded runtime logs, resumable cursors, source context, native debugger panels and documented control dispatch. No arbitrary console evaluation. Native API does not expose paused state, watches or callstack values: use computer-use observation of those panes before/after stepping; dispatch is never reported as a confirmed debug result. No automatic retry.",
    inputSchema: {
      action: z.enum(["snapshot", "diagnostics", "controls", "togglePanel", "command"]),
      log: z.enum(logNames).default("script.log"), cursor: z.string().max(2048).optional(), maxLines: z.number().int().min(1).max(500).default(150),
      panel: z.enum(["Callstack", "Watch", "Breakpoints", "Output", "Errors", "Remote Console", "Find File", "Find Symbol", "Text Search"]).optional().describe("Checkable Window menu entry: observe visibility before toggling; this can hide an open pane."),
      command: z.enum(["continue", "stepOver", "stepInto", "stepOut", "toggleBreakpoint", "debugGame", "debugWorkbench", "debugCustom"]).optional(),
      debugTarget: z.enum(["workbench", "external"]).default("workbench").describe("Workbench stepping requires computer use because its script thread and NET API may be paused. External means an observed game/server attachment."),
      expectedFile: z.string().optional().describe("Exact currentFile, required for stepping/breakpoints."),
      expectedLine: z.number().int().nonnegative().optional().describe("Observed zero-based currentLine, required before a breakpoint toggle."),
      runtimeObserved: z.boolean().default(false).describe("For stepping: caller has observed the intended debugger attached and paused via computer use. Does not itself prove runtime state."),
      allowForeground: z.boolean().default(false),
    },
  }, async ({ action, log, cursor, maxLines, panel, command, expectedFile, expectedLine, debugTarget, runtimeObserved, allowForeground }) => {
    const reply = (data: Record<string, unknown>, error = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data, ...(error ? { isError: true } : {}) });
    try {
      if (action === "controls") return reply({ controls: DEBUG_CONTROLS,
        computerUse: "Observe the Script Editor Debug, Callstack, Watch and Breakpoints panes. Refresh window identities after navigation. Match file and zero-based currentLine before a breakpoint toggle. Step only while paused. Read stack/watch after each step. Use the observed Stop control to end debugging; never reload scripts inside a custom handler.",
        documentation: "https://community.bistudio.com/wiki/Arma_Reforger:Script_Editor#Debugging" });
      if (action === "diagnostics") return reply(readRuntimeLog(config.workbenchProfile, log, cursor, maxLines));
      if (action === "snapshot") {
        let source: unknown;
        try { source = await client.call("EMCP_WB_ScriptEditor", { action: "getCurrentFile" }, { timeout: 1500 }); }
        catch (error) { source = { available: false, message: String(error) }; }
        return reply({ source, runtimeLog: readRuntimeLog(config.workbenchProfile, log, cursor, maxLines),
          debugger: { attached: "unobserved", paused: "unobserved", stack: "Read Callstack pane via computer use", watches: "Read Watch pane via computer use" } });
      }
      if (!allowForeground && !foregroundAuthorized()) throw new Error("Editor navigation/control requires allowForeground=true under existing user authorization.");
      if (action === "togglePanel") {
        if (!panel) throw new Error("togglePanel requires panel.");
        await client.call("EMCP_WB_EditorModule", { module: "scriptEditor", action: "open" });
        const result = await client.call("EMCP_WB_EditorModule", { module: "scriptEditor", action: "executeAction", menuPath: `Window,${panel}`, keepFocus: false });
        return reply({ outcome: "dispatched", panel, result, visibility: "unobserved", verification: "This toggles visibility and may hide an open pane. Observe the editor pane; visibility and contents are not returned by ExecuteAction." });
      }
      if (!command) throw new Error("command action requires command.");
      const steps = ["continue", "stepOver", "stepInto", "stepOut"];
      if (steps.includes(command) && !runtimeObserved) throw new Error("Observe the intended attached, paused debugger before stepping; pass runtimeObserved=true after observation.");
      if ([...steps, "toggleBreakpoint"].includes(command) && !expectedFile) throw new Error("Inspect the current source first and pass expectedFile.");
      if (command === "toggleBreakpoint" && expectedLine === undefined) throw new Error("Pass the observed zero-based expectedLine before toggling a breakpoint.");
      if (steps.includes(command) && debugTarget !== "external") return reply({ outcome: "computer_use_required", command, control: DEBUG_CONTROLS[command], expectedFile,
        reason: "A paused Workbench cannot service its own script NET API. Use the observed debugger button or shortcut, then read Callstack/Watch. No command was sent." });
      const result = await client.call("EMCP_WB_EditorModule", { module: "scriptEditor", action: "executeAction", menuPath: DEBUG_CONTROLS[command].menu, expectedFile, expectedLine, keepFocus: false });
      return reply({ outcome: "dispatched", command, result, debuggerStateConfirmed: false, next: "Observe the debugger again; do not repeat a timeout or breakpoint toggle blindly." });
    } catch (error) { return reply({ outcome: "error", message: String(error) }, true); }
  });
}
