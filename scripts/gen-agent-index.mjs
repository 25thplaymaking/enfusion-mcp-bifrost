/*
 * WHY THIS EXISTS
 * ---------------
 * An agent picking a tool from prose documentation picks badly. The README is
 * written for humans reading it end to end; the facts an agent actually needs --
 * which of the 63 tools are OFFLINE (no Workbench, no editor, no Steam), which
 * need a FOCUSED editor, and what the first call should be -- were scattered
 * across a table it has to parse and reason about.
 *
 * `dist/tools.json` puts those facts in one machine-readable file, and
 * `AGENT_TOOLS.md` puts the routing in prose. Both are derived from the server's
 * own `tools/list`, so neither can drift from what is actually registered.
 *
 * OFFLINE vs LIVE is the important distinction and it is NOT the `wb_` prefix:
 * `wb_knowledge` and `wb_playbook` are `wb_`-prefixed and make zero Workbench
 * calls. An agent that assumes otherwise skips the two tools most likely to save
 * it, or worse, reports "Workbench is required" for a task that needed nothing.
 *
 * USAGE
 *   node scripts/gen-agent-index.mjs          # writes dist/tools.json + AGENT_TOOLS.md
 *   node scripts/gen-agent-index.mjs --check  # exit 1 if either is stale
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = join(REPO, "dist", "tools.json");
const MD_OUT = join(REPO, "AGENT_TOOLS.md");

/** Tools that make no Workbench call despite the wb_ prefix. */
const OFFLINE_WB = new Set(["wb_knowledge", "wb_playbook"]);

function listTools() {
  return new Promise((resolveTools, reject) => {
    const proc = spawn("node", [join(REPO, "dist", "index.js")], {
      cwd: REPO,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    const pending = new Map();
    let id = 0;

    proc.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id && pending.has(m.id)) {
            pending.get(m.id)(m);
            pending.delete(m.id);
          }
        } catch {
          /* non-JSON on stdout would be an MCP transport bug; ignore */
        }
      }
    });

    const send = (method, params) => {
      const i = ++id;
      return new Promise((res) => {
        pending.set(i, res);
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n");
      });
    };

    setTimeout(async () => {
      await send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "gen-agent-index", version: "1" },
      });
      const res = await send("tools/list", {});
      proc.kill();
      const tools = res?.result?.tools;
      if (!Array.isArray(tools) || tools.length === 0) {
        reject(new Error("tools/list returned nothing — is dist built?"));
        return;
      }
      resolveTools(tools);
    }, 2500);
  });
}

const firstSentence = (s, n = 120) => {
  const first = (s || "").split(/(?<=\.)\s/)[0].trim().replace(/\.$/, "");
  return first.length > n ? `${first.slice(0, n)}...` : first;
};

async function main() {
  const check = process.argv.includes("--check");
  const tools = await listTools();

  const index = tools
    .map((t) => {
      const offline = !t.name.startsWith("wb_") || OFFLINE_WB.has(t.name);
      return {
        name: t.name,
        offline,
        description: (t.description || "").split("\n")[0],
        inputKeys: Object.keys(t.inputSchema?.properties ?? {}),
        required: t.inputSchema?.required ?? [],
        // The full JSON Schema per argument. Without this, a caller has to read
        // src/tools/*.ts to learn that `scenario_create` takes `type`, or that
        // `script_create` REQUIRES `scriptType` — and guessing an argument name
        // costs a wasted round trip. Schema is emitted verbatim from the server.
        inputSchema: t.inputSchema ?? {},
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const offlineCount = index.filter((t) => t.offline).length;
  const liveCount = index.length - offlineCount;

  const json = `${JSON.stringify(
    {
      generatedFrom: "MCP tools/list",
      total: index.length,
      offline: offlineCount,
      live: liveCount,
      note:
        "`offline: true` means the tool makes NO Workbench call and needs no running " +
        "editor. Note that the wb_ prefix does NOT imply live: wb_knowledge and " +
        "wb_playbook are offline. Each tool carries its full `inputSchema` " +
        "(verbatim from tools/list) so argument names and required fields never " +
        "have to be guessed.",
      tools: index,
    },
    null,
    2
  )}\n`;

  const rows = (list) =>
    list
      .map(
        (t) =>
          `| \`${t.name}\` | ${(t.description || "").replace(/\|/g, () => "\\|").slice(0, 100)} | ${
            t.inputKeys.length
              ? t.inputKeys
                  .slice(0, 6)
                  .map((k) => `\`${k}\`${t.required.includes(k) ? "*" : ""}`)
                  .join(", ") + (t.inputKeys.length > 6 ? ", …" : "")
              : "—"
          } |`
      )
      .join("\n");

  const md = `# Agent tool index

<!-- GENERATED by scripts/gen-agent-index.mjs — do not hand-edit. -->
<!-- Regenerate: node scripts/gen-agent-index.mjs -->

**${index.length} tools: ${offlineCount} offline, ${liveCount} live.**

Machine-readable equivalent: \`dist/tools.json\`.

## How to route a task

1. **Any authoring task → \`wb_playbook\` first.** It returns preconditions, the
   ordered tool calls, the traps that fail *silently*, and the verification.
   \`{"query": "catalogue"}\` lists all of them. Do this before writing anything;
   the expensive Enfusion mistakes are the ones that compile fine and fail later.
2. **Engine facts and API detail → \`wb_knowledge\`.** Subject-oriented, 48 docs.
3. **Generating a file → the offline authoring tools.** No Workbench needed.
4. **Only then the live \`wb_*\` bridge tools**, which need Workbench running *and
   focused*. An unfocused editor reports itself as "play mode"; that is a lie,
   and chasing \`wb_stop\` on it wastes the session.

## The offline/live distinction

\`offline: true\` = makes no Workbench call, needs no editor, no Steam, no bridge.

**The \`wb_\` prefix does not imply live.** \`wb_knowledge\` and \`wb_playbook\` are
\`wb_\`-prefixed and fully offline — and they are the two tools most likely to
save you time. Do not skip them because a step "needs the editor".

## Offline tools (${offlineCount})

| Tool | What it does | Inputs (\* = required) |
|------|-------------|---------------------|
${rows(index.filter((t) => t.offline))}

## Live tools (${liveCount}) — Workbench must be running AND focused

| Tool | What it does | Inputs (\* = required) |
|------|-------------|---------------------|
${rows(index.filter((t) => !t.offline))}

## Known live-session traps

- **Focus is the biggest one.** Workbench only serves its NET API while it is the
  focused window. Unfocused, the API goes inactive and the MCP misreports it as
  \`play mode\`. Before diagnosing any mode complaint, have the user click into
  Workbench and re-probe.
- **Never close the \`resourceManager\` editor module.** The MCP handler scripts
  live in its script context; closing it makes Workbench exit and there is no
  agent-side recovery.
- **Writes only work in edit mode.** In play mode every create/delete/save fails.
- **A clean compile is not a runtime pass.** Source compile, native validation,
  physical runtime, dedicated server, remote client, JIP, and save/restart
  persistence are separate claims — say which one you have.
- **Read logs with \`wb_debug\`, not by grepping log files.** A raw grep cannot
  distinguish a stale error from a current one.

Each of these is expanded in the relevant playbook (\`wb_playbook
{"query":"live-workbench-session"}\`).
`;

  const stale = [];
  if (!existsSync(JSON_OUT) || readFileSync(JSON_OUT, "utf-8") !== json) stale.push(JSON_OUT);
  if (!existsSync(MD_OUT) || readFileSync(MD_OUT, "utf-8") !== md) stale.push(MD_OUT);

  if (check) {
    if (stale.length === 0) {
      console.log(`agent index is up to date (${index.length} tools).`);
      return;
    }
    console.error(
      `agent index is STALE: ${stale.map((s) => s.replace(REPO + "\\", "")).join(", ")}\n` +
        `Regenerate: node scripts/gen-agent-index.mjs`
    );
    process.exit(1);
  }

  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, json, "utf-8");
  writeFileSync(MD_OUT, md, "utf-8");
  console.log(`Wrote ${JSON_OUT} and ${MD_OUT}: ${index.length} tools (${offlineCount} offline, ${liveCount} live).`);
}

main().catch((e) => {
  console.error(`gen-agent-index failed: ${e.message}`);
  process.exit(1);
});
