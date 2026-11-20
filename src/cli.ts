#!/usr/bin/env node
/**
 * enfusion-cli: every enfusion-mcp tool as a shell command, for agents.
 *
 * Follows the CLI-Anything harness rules (HKUDS/CLI-Anything HARNESS.md): every
 * command takes --json, list/help introspection, loud self-correcting errors,
 * REPL when run bare in a terminal, and a generated SKILL.md
 * (skills/enfusion-cli). It calls the same handlers as the MCP server, in
 * process, through src/tool-registry.ts. ADR-0008.
 *
 * Exit codes: 0 ok, 1 the tool reported an error, 2 usage error.
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { collectTools, isOfflineTool, type RegisteredTool } from "./tool-registry.js";
import {
  describeParams, positionalParams, parseToolArgs, validateInput, tokenize, nearest, UsageError, type ParamInfo,
} from "./cli-args.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
const SKILL_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills", "enfusion-cli", "SKILL.md");

/** What one command produced: text for people, data for --json, and an exit code. */
interface Outcome {
  code: 0 | 1 | 2;
  text: string;
  data: unknown;
}

const summary = (d: string, n = 110) => {
  const first = d.split(/(?<=\.)\s|\n/)[0].trim().replace(/\.$/, "");
  return first.length > n ? first.slice(0, n - 3) + "..." : first;
};

let registry: Map<string, RegisteredTool> | undefined;
function tools(): Map<string, RegisteredTool> {
  registry ??= collectTools(loadConfig());
  return registry;
}

function findTool(name: string): RegisteredTool | undefined {
  const all = tools();
  return all.get(name) ?? all.get(name.replace(/-/g, "_"));
}

function unknownTool(name: string): Outcome {
  const near = nearest(name, [...tools().keys()], 6);
  const msg = `Unknown command or tool "${name}".` + (near.length ? ` Did you mean: ${near.join(", ")}?` : "") + " Run `enfusion-cli list` for all tools.";
  return { code: 2, text: msg, data: { ok: false, error: "usage", message: msg } };
}

function topHelp(): Outcome {
  const text = `enfusion-cli ${version}: the enfusion-mcp tools as shell commands.

Usage
  enfusion-cli list [--offline | --live]     list tools (offline = no Workbench needed)
  enfusion-cli help <tool>                   parameters, types, defaults for one tool
  enfusion-cli <tool> [value] [--param v]... run a tool
  enfusion-cli repl                          one process for many calls (also reads a script on stdin)
  enfusion-cli info                          resolved game/Workbench/project paths and whether they exist

Configuration comes only from ENFUSION_* environment variables (same as the MCP server).
If a tool says the game or Workbench is not found, run "enfusion-cli info".

Global options (anywhere)
  --json              machine-readable output: {"ok","tool","text","structured"}
  --args '<json>'     the tool input as one JSON object (flags override it)
  --args-file <path>  the same, from a file; "-" reads stdin
  --help, -h          help for the command or tool
  --version

Flags match the schema ignoring case, "-" and "_" (--project-path = --projectPath).
Arrays: repeat the flag or pass a JSON array. Objects: pass JSON.
Exit codes: 0 ok, 1 the tool reported an error, 2 usage error.

Start any authoring task with:  enfusion-cli wb_playbook "<what you are doing>"
Engine facts:                   enfusion-cli wb_knowledge "<subject>"
Skill file: ${SKILL_PATH}`;
  return { code: 0, text, data: { ok: true, version, commands: ["list", "help", "repl", "<tool>"], skill: SKILL_PATH } };
}

/** The resolved configuration and whether each path exists: the first thing to check when a tool cannot find the game. */
function info(): Outcome {
  const c = loadConfig();
  const paths: Record<string, [string, string | undefined]> = {
    gamePath: ["ENFUSION_GAME_PATH", c.gamePath],
    workbenchPath: ["ENFUSION_WORKBENCH_PATH", c.workbenchPath],
    projectPath: ["ENFUSION_PROJECT_PATH", c.projectPath],
    workbenchProfile: ["ENFUSION_WORKBENCH_PROFILE", c.workbenchProfile],
    extractedPath: ["ENFUSION_EXTRACTED_PATH", c.extractedPath],
  };
  const rows = Object.entries(paths).map(([key, [env, value]]) => ({
    key, env, value: value ?? null, fromEnv: Boolean(process.env[env]), exists: value ? existsSync(value) : false,
  }));
  const text = `enfusion-cli ${version}\n\n` +
    rows.map((r) => `${r.key.padEnd(17)}${r.value ?? "(not set)"}\n${"".padEnd(17)}` +
      (r.value === null ? `optional, set ${r.env} to use it`
        : `${r.exists ? "exists" : "MISSING"}, ${r.fromEnv ? `from ${r.env}` : `built-in default (set ${r.env} to change)`}`)).join("\n") +
    `\ndefaultMod       ${c.defaultMod || "(not set)"}\nworkbench        ${c.workbenchHost}:${c.workbenchPort}\nskill            ${SKILL_PATH}`;
  return {
    code: 0, text,
    data: { ok: true, version, paths: rows, defaultMod: c.defaultMod ?? null, workbench: `${c.workbenchHost}:${c.workbenchPort}`, skill: SKILL_PATH },
  };
}

function list(filter: "offline" | "live" | null): Outcome {
  const rows = [...tools().values()]
    .map((t) => ({ name: t.name, offline: isOfflineTool(t.name), summary: summary(t.description) }))
    .filter((t) => filter === null || (filter === "offline") === t.offline)
    .sort((a, b) => a.name.localeCompare(b.name));
  const pad = Math.max(...rows.map((r) => r.name.length)) + 2;
  const section = (title: string, rs: typeof rows) =>
    rs.length ? `${title} (${rs.length})\n` + rs.map((r) => `  ${r.name.padEnd(pad)}${r.summary}`).join("\n") : "";
  const text = [
    section("Offline: no Workbench needed", rows.filter((r) => r.offline)),
    section("Live: Workbench must be running AND focused", rows.filter((r) => !r.offline)),
  ].filter(Boolean).join("\n\n") + "\n\nDetails: enfusion-cli help <tool>";
  return { code: 0, text, data: { ok: true, total: rows.length, tools: rows } };
}

function paramLine(p: ParamInfo): string {
  const type = p.kind === "enum" ? p.values!.join("|")
    : p.kind === "array" ? `${p.item === "enum" ? p.values!.join("|") : p.item}[]`
    : p.kind;
  const tags = [p.required ? "required" : null, p.default !== undefined ? `default ${JSON.stringify(p.default)}` : null].filter(Boolean).join(", ");
  return `  --${p.name} <${type}>${tags ? `  (${tags})` : ""}\n      ${p.description || "(no description)"}`;
}

function toolHelp(t: RegisteredTool): Outcome {
  const params = describeParams(t.inputSchema);
  const pos = positionalParams(params);
  const offline = isOfflineTool(t.name);
  const usage = `enfusion-cli ${t.name}${pos.map((n) => ` <${n}>`).join("")}${params.length > pos.length ? " [--param value]..." : ""}`;
  const text = `${t.name}: ${offline ? "offline (no Workbench needed)" : "LIVE (Workbench running and focused)"}

${t.description}

Usage
  ${usage}
${pos.length ? `  Bare values fill: ${pos.join(", ")}\n` : ""}
Parameters${params.length ? "\n" + params.map(paramLine).join("\n") : "\n  (none)"}`;
  return { code: 0, text, data: { ok: true, name: t.name, offline, description: t.description, positional: pos, params } };
}

function readArgsFile(path: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = path === "-" ? readFileSync(0, "utf-8") : readFileSync(path, "utf-8");
  } catch (e) {
    throw new UsageError(`--args-file: cannot read ${path}: ${(e as Error).message}`);
  }
  return parseArgsJson(raw, "--args-file");
}

function parseArgsJson(raw: string, flag: string): Record<string, unknown> {
  let v: unknown;
  try { v = JSON.parse(raw); } catch (e) { throw new UsageError(`${flag}: not valid JSON (${(e as Error).message})`); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new UsageError(`${flag}: must be a JSON object of tool inputs`);
  return v as Record<string, unknown>;
}

async function runTool(t: RegisteredTool, tokens: string[], base: Record<string, unknown>, signal: AbortSignal): Promise<Outcome> {
  const params = describeParams(t.inputSchema);
  const input = validateInput(t.inputSchema, parseToolArgs(tokens, params, base));
  let result;
  try {
    result = await t.handler(input, { signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: 1, text: `Error: ${msg}`, data: { ok: false, tool: t.name, error: "exception", message: msg } };
  }
  const text = (result.content ?? [])
    .map((c) => (c.type === "text" ? c.text ?? "" : `[${c.type} content omitted]`))
    .join("\n\n");
  const ok = !result.isError;
  return { code: ok ? 0 : 1, text, data: { ok, tool: t.name, text, structured: result.structuredContent ?? null } };
}

/** Pull the global options out of argv; everything else stays in order. */
function splitGlobals(argv: string[]) {
  const rest: string[] = [];
  const g = { json: false, help: false, version: false, args: undefined as string | undefined, argsFile: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { rest.push(...argv.slice(i)); break; }
    if (a === "--json") g.json = true;
    else if (a === "--help" || a === "-h") g.help = true;
    else if (a === "--version") g.version = true;
    else if (a === "--args" || a === "--args-file") {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      if (a === "--args") g.args = v; else g.argsFile = v;
    } else if (a.startsWith("--args=")) g.args = a.slice(7);
    else if (a.startsWith("--args-file=")) g.argsFile = a.slice(12);
    else rest.push(a);
  }
  return { g, rest };
}

/** Run one command line (argv words). Never throws; never exits. */
export async function execute(
  argv: string[],
  signal: AbortSignal,
  opts: { stdinIsScript?: boolean } = {},
): Promise<{ outcome: Outcome; json: boolean }> {
  let json = argv.includes("--json");
  try {
    const { g, rest } = splitGlobals(argv);
    json = g.json;
    const [cmd, ...tail] = rest;
    if (g.version) return { json, outcome: { code: 0, text: version, data: { ok: true, version } } };
    if (!cmd || cmd === "help" && tail.length === 0) return { json, outcome: topHelp() };
    if (cmd === "help" || g.help) {
      const name = cmd === "help" ? tail[0] : cmd;
      if (name === "list" || name === "repl" || name === "info") return { json, outcome: topHelp() };
      const t = findTool(name);
      return { json, outcome: t ? toolHelp(t) : unknownTool(name) };
    }
    if (cmd === "info") {
      if (tail.length) throw new UsageError(`info takes no arguments`);
      return { json, outcome: info() };
    }
    if (cmd === "list") {
      const filter = tail.includes("--offline") ? "offline" : tail.includes("--live") ? "live" : null;
      const bad = tail.filter((x) => x !== "--offline" && x !== "--live");
      if (bad.length) throw new UsageError(`list takes --offline or --live, not ${bad.join(" ")}`);
      return { json, outcome: list(filter) };
    }
    const t = findTool(cmd);
    if (!t) return { json, outcome: unknownTool(cmd) };
    if (g.argsFile === "-" && opts.stdinIsScript) {
      throw new UsageError("--args-file - cannot read stdin inside a REPL script (stdin is the script). Use --args '<json>' or a file path.");
    }
    const base = { ...(g.argsFile ? readArgsFile(g.argsFile) : {}), ...(g.args ? parseArgsJson(g.args, "--args") : {}) };
    return { json, outcome: await runTool(t, tail, base, signal) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!(e instanceof UsageError)) {
      return { json, outcome: { code: 1, text: `Error: ${msg}`, data: { ok: false, error: "exception", message: msg } } };
    }
    // The tool is the first word left after global options (an --args value is not a tool name).
    let cmd: string | undefined;
    try { cmd = splitGlobals(argv).rest[0]; } catch { cmd = undefined; }
    const t = cmd ? findTool(cmd) : undefined;
    const hint = t ? ` Run \`enfusion-cli help ${t.name}\`.` : "";
    const sep = /[.?!]$/.test(msg) ? "" : ".";
    return { json, outcome: { code: 2, text: `Usage error: ${msg}${hint ? sep + hint : ""}`, data: { ok: false, error: "usage", message: msg } } };
  }
}

function render(outcome: Outcome, json: boolean, jsonLines = false): { out: string; err: string } {
  if (json) return { out: JSON.stringify(outcome.data, null, jsonLines ? 0 : 2) + "\n", err: "" };
  if (outcome.code === 2) return { out: "", err: outcome.text + "\n" };
  return { out: outcome.text + (outcome.text.endsWith("\n") ? "" : "\n"), err: "" };
}

async function repl(jsonDefault: boolean, signal: AbortSignal): Promise<number> {
  const interactive = process.stdin.isTTY === true;
  const rl = createInterface({ input: process.stdin, output: interactive ? process.stdout : undefined, terminal: interactive, historySize: 500 });
  if (interactive) {
    process.stdout.write(`enfusion-cli ${version} REPL: ${tools().size} tools. "list", "help <tool>", "exit".\nSkill: ${SKILL_PATH}\n`);
    rl.setPrompt("enfusion> ");
    rl.prompt();
  }
  let worst = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === "exit" || trimmed === "quit") break;
    if (trimmed && !trimmed.startsWith("#")) {
      let words: string[];
      try { words = tokenize(trimmed); } catch (e) { words = []; process.stderr.write(`Usage error: ${(e as Error).message}\n`); worst = Math.max(worst, 2); }
      if (words.length) {
        if (jsonDefault && !words.includes("--json")) words.push("--json");
        const { outcome, json } = await execute(words, signal, { stdinIsScript: !interactive });
        const { out, err } = render(outcome, json, !interactive);
        process.stdout.write(out);
        process.stderr.write(err);
        worst = Math.max(worst, outcome.code);
      }
    }
    if (interactive) rl.prompt();
  }
  rl.close();
  return worst;
}

/** Exit only once both streams have drained: Windows terminal writes are asynchronous. */
function exitAfterFlush(code: number, out = "", err = ""): void {
  let pending = 2;
  const done = () => { if (--pending === 0) process.exit(code); };
  process.stderr.write(err, done);
  process.stdout.write(out, done);
}

async function main(): Promise<void> {
  // Ctrl+C keeps Node's default (exit 130). Handlers take a signal, but nothing
  // here cancels a call mid-flight, so it is a plain never-aborted one.
  const signal = new AbortController().signal;
  const argv = process.argv.slice(2);
  const words = argv.filter((a) => a !== "--json");
  if (words[0] === "repl" || (words.length === 0 && process.stdin.isTTY)) {
    exitAfterFlush(await repl(argv.includes("--json"), signal));
    return;
  }
  const { outcome, json } = await execute(argv, signal);
  const { out, err } = render(outcome, json);
  // Exiting explicitly also drops any Workbench socket left open by a live tool.
  exitAfterFlush(outcome.code, out, err);
}

await main();
