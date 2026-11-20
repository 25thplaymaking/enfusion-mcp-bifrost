# 8. An agent CLI over the same tool registry (`enfusion-cli`)

Date: 2026-11-20
Status: Accepted

## Context

The 63 tools are reachable only through MCP. That costs agents in four ways:

- **Shell-only agents cannot use them.** Hermes' local models, the DeepSeek
  worker, Codex and scripts on grain have a shell but no MCP client config.
- **A running MCP serves a stale build.** After `npm run build`, the MCP in an
  open session still runs the old `dist/` until the client restarts it
  (CLAUDE.md: "replay the recorded failing calls over stdio").
- **Results cannot be composed.** An MCP result lands in context. A 45 K
  `wb_knowledge` answer cannot be piped to a file, grepped, or looped over.
- **No batch scripting.** Twenty `game_read` calls are twenty tool round trips.

HKUDS/CLI-Anything (Apache-2.0) is the reference standard for agent-native
CLIs. Its harness rules (HARNESS.md): every command supports `--json`;
introspection commands (`list`, `info`, `status`); fail loudly with errors an
agent can self-correct from; REPL is the default with no subcommand; a
generated SKILL.md makes the CLI discoverable; the real software stays the
backend. For a program that already has an MCP server it prescribes the
"MCP backend pattern": a Python Click package that spawns the MCP server per
command.

## Decision

Apply CLI-Anything's harness rules natively in TypeScript, in-process, rather
than generating its Python harness.

```text
REQUIREMENTS
- Every registered tool callable from a shell, same names, same behaviour.
- Machine-readable output (--json) and meaningful exit codes on every command.
- Introspection: list tools (offline/live), per-tool help from the real schema.
- Loud, self-correcting errors for bad flags and bad values.
- A REPL that keeps one Workbench client across calls; scriptable over stdin.
- A generated SKILL.md, under the existing drift guard.
- The MCP server keeps working unchanged.
MINIMUM COMPONENTS NEEDED
- src/tool-registry.ts: capture registerTools() into a Map (no tool edits).
- src/cli.ts: argv -> zod-validated input -> the tool's own handler.
- gen-agent-index.mjs also writes skills/enfusion-cli/SKILL.md.
REJECTED
- CLI-Anything's generated Python harness (MCP backend pattern): a second
  language and runtime, a Python MCP SDK dependency, 63 Click commands written
  by hand that drift from the zod schemas, and a server spawn per call. The
  in-process CLI calls the same handler the MCP calls, so it cannot drift.
- Removing the MCP server: other clients use it, and Claude Code already
  defers its schemas. Removing it is the owner's call, not this change's.
- Session files / undo stacks (CLI-Anything's state model): Workbench owns
  its own state and undo (wb_undo_redo); a second copy would lie.
PRIMARY RISKS
- Flag coercion mis-typing a value: every input still goes through the tool's
  own zod schema before the handler runs.
- Live tools across separate processes lose the client's cached mode: the mode
  guards already self-refresh when the cache is unknown (status.ts).
```

## Consequences

- `node dist/cli.js <tool> ...` runs the build on disk, so a rebuilt tool is
  testable from a shell at once without restarting any MCP client.
- Cold start is about 0.35 s (registry load), cheap enough to spawn per call.
- Global options `--json`, `--args`, `--args-file` and `--help` are reserved.
  No tool has a parameter of those names, and `gen-agent-index.mjs` refuses
  to generate the index if one is added (`RESERVED_FLAGS` in src/cli-args.ts).
- Keys passed with `--args` / `--args-file` must be exact schema names; an
  unknown key is a usage error, not silently dropped as the MCP SDK would.
