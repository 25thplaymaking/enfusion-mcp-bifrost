---
id: live-workbench-session
title: Drive a live Workbench session (wb_* tools)
goal: A working, verified session against the running Workbench, with each tool's real precondition known.
humanStep: true
tools: [wb_connect, wb_capabilities, wb_state, wb_diagnose, wb_bridge, wb_launch, wb_reload, wb_validate_scripts, wb_compile_status, wb_debug, wb_play, wb_stop, wb_save]
triggers:
  - connect to workbench
  - workbench is not responding
  - wb tools not working
  - live editor session
  - start a workbench session
  - play mode
  - workbench disconnected
  - handler scripts not loaded
  - reload refused
  - compilation failed
  - reload unconfirmed
seeAlso: []
---

# Drive a live Workbench session (`wb_*` tools)

**Goal:** a live session you can trust, where you know which tool needs what.

**Needs a human click** — Workbench must be running and focused on the PC.

## The one rule that causes most failures

**Workbench only serves its NET API while it is the focused window.** Unfocused
or minimised, the API goes inactive — and the MCP **misreports that as `play
mode`**. Chasing `wb_stop` on that evidence is a dead end; the mode was never
wrong.

So: before diagnosing any mode complaint, have the user click into Workbench and
re-probe. If `wb_capabilities` answers, it was never a mode problem.

## Before you start

| Precondition | Check | If it fails |
|---|---|---|
| Workbench is running | `wb_connect {}` | `wb_launch` (interactive only — see traps) |
| Workbench is FOCUSED | `wb_capabilities {"live":true}` | Ask the user to click the window |
| Handlers are installed | `wb_bridge {"action":"status","projectPath":"<loaded addon root from wb_projects>"}` | `wb_bridge {"action":"install","projectPath":"<loaded addon root from wb_projects>"}` |
| You know which project is loaded | `wb_projects {"action":"list"}` | Never trust a configured default |

Configured default folders are **not** evidence of what is loaded. Always resolve
the loaded project ID before authoring.

## Steps

1. **Probe, then discover.**

   ```
   wb_connect {}
   wb_capabilities {"live":true}
   ```

2. **Confirm identity before any write.** Resolve the real loaded addon.

   ```
   wb_projects {"action":"list"}
   ```

3. **Install/refresh handlers if the tools answer "not loaded".**

   ```
   wb_bridge {"action":"status","projectPath":"<loaded addon root from wb_projects>"}
   wb_bridge {"action":"install","projectPath":"<loaded addon root from wb_projects>"}
   wb_reload {"target":"scripts"}
   ```

4. **Work in edit mode.** Writes only work there — in play mode every
   create/delete/save fails.

   ```
   wb_state {}
   ```

5. **Validate and compile through the native endpoints — one call at a time.**

   ```
   wb_validate_scripts
   wb_reload {"target":"scripts"}
   wb_compile_status
   ```

   `wb_validate_scripts` only answers "does the tree compile?". It does **not**
   change the scripts the running editor uses; only a reload that reports
   **Reload Complete** does. Issue `wb_stop`, `wb_reload` and `wb_play` as
   separate, sequential calls and read each result before the next.

6. **Read errors from the parsed log, never by grepping files.**

   ```
   wb_debug {"action":"diagnostics","log":"console.log"}
   ```

7. **Save, and know what that does and does not prove.**

   ```
   wb_save {}
   ```

## Traps

- **NEVER close the `resourceManager` editor module.** The MCP's handler scripts
  live in that module's script context. Closing it makes Workbench exit, taking
  the NET API with it — and there is then **no agent-side recovery**, because
  relaunching Workbench remotely spawns in a non-interactive session with no Steam
  context. Only the user can bring it back.
- **`wb_stop` returning `ok` is not evidence.** It answers before the engine has
  transitioned. Confirm with `wb_state`.
- **Never fire `wb_reload` alongside `wb_play` / `wb_stop`.** In recorded
  sessions 7 of 17 reloads failed this way: the native reload refused while play
  mode was starting or stopping, answered "Compilation failed", and wrote no
  compile block. The agent then hunted a script error that did not exist. The
  server now queues these calls and reports **Reload Refused — no compile ran**;
  that is never a code problem. Confirm edit mode with `wb_state` and retry once.
- **"Reload Unconfirmed" means nothing reloaded.** A "Compile Passed" printed under
  it can come from older log lines; it does not prove the editor runs new code.
- **Errors in vanilla `SCR_*` files you never touched are a cascade.** When one of
  your files fails to parse, the compile aborts and Workbench also reports nonsense
  in unrelated vanilla files (`Can't find variable 'sortSlots'`,
  `Can't find class Tuple2`, ...). Fix the first error in **your** files; see
  `wb_knowledge {"query":"compile errors"}`.
- **Workbench recompiles when its window regains focus**, not when a file
  changes on disk. An edit made while the user is in another window is not live
  until a reload or a focus change.
- **A compile pass is not a runtime pass.** Static compilation, native validation,
  physical runtime, dedicated-server replication, remote client, JIP and
  save/restart persistence are **seven separate claims**. Say which one you have.
- **Read logs with `wb_debug`, not `grep`.** A raw grep cannot distinguish a stale
  error from a current one — which is how a fixed bug gets reported as still broken.
- **A stale editor parse is not a disk problem.** Compare the file's mtime against
  the `GUI : Layout load` log line before "fixing" anything.
- **The API drops out after a large batch** and is again reported as `play mode`.
  Treat it as transient: wait ~30 s and retry the same batch. Nothing landed, so a
  retry cannot duplicate anything.
- **Never `pkill -f <pattern>`** where the pattern also matches your own command
  line — it kills the shell you are running from. Match on a PID from `pgrep`.
- **Bound every session timeout** to a few minutes. A connection that dies
  mid-batch otherwise blocks for the full timeout instead of failing fast.

## Verify

- [ ] `wb_connect` reports connected
- [ ] `wb_capabilities {"live":true}` returns real project/editor state
- [ ] `wb_projects list` shows the addon you intend to edit
- [ ] `wb_state` shows **edit** mode before any write
- [ ] `wb_compile_status` is clean after your change

## Related

- `wb_docs {"action":"read","document":"NATIVE_AGENT_WORKFLOW.md"}` — the
  authoritative agent guide for the editor
- Playbook `write-an-enforcescript-component` — the most common live-session task

## More traps (field notes, 2026-09/10)

- **After a bulk load the API goes silent for 2–3 minutes** (`Port open but no reply`, or
  misreported as play mode). It is the load, not a crash: wait once, check once, retry the same
  batch. Hundreds of per-entity calls can crash the 1.8 editor, while thousands of entities
  written into a layer file load fine — prefer one file write plus one `wb_open_resource`.
- **`wb_entity_list` caps near 250 rows and ignores `offset`** — page by "list, act, list
  again". One entity costs ~0.6–1.5 s through the MCP; thousands need a native handler loop.
- **An unsaved world can hold two entities with the same name.** Deleting by name removes one
  twin; verify with entity counts, and treat an outage-shaped reply as failure, not "zero".
- `wb_entity_create` can echo the requested layer while the entity lands in `default`;
  verify per-layer counts. `wb_open_resource` on the open world reloads its layers from disk.
- **Save and close Animation/Navmesh editors before reloading** — they block native reload.
  The single-file Script Editor `Save()` returns false in 1.8; use `saveAll` with
  `expectedFile`.
- A Workbench that stays unfocused throttles; a startup log that stops at
  "Pending workshop invites request done" is paused, not hung.
- `wb_batch` steps are `{"tool": ..., "arguments": {...}}` only, up to 25, not atomic; routing a
  call through it returns a parsed `data` object per step.
- `mod {"action":"validate"}` cannot index custom classes or staged test plugins; the native
  compile is the evidence, not its warnings.
- Probe regressions need a **local server** play world ("Local server play world required").
