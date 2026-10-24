# Codex native Workbench bridge — 2026-09-05

## 2026-09-15 — token & focus pass

- Added `ENFUSION_ALLOW_FOREGROUND=1`: a standing, server-scoped foreground authorization so foreground-activating tools (`open`/`openResource`/`executeAction`/`openFile`/`saveAll`/`wb_projects open`/`wb_debug` control) no longer need a per-call `allowForeground: true`. Off by default; the per-call flag still works when unset.
- `wb_capabilities.batchTools` now lists eligible tool names only — the per-tool descriptions and parameter schemas were redundant with the registered MCP tool surface and re-emitted on every discovery call.

## Current iteration decision record

REQUIREMENTS
- Give Codex/Astra direct navigation and inspection across the full Workbench editor suite, using the existing native plugin bridge.
- Inspect live container/property types, values, inheritance, limits and nested objects; make conflict-checked edits with native readback.
- Identify the actual loaded addon and editor target; reject stale targets instead of guessing from configured defaults or ambiguous names.
- Install/update the bridge and local documentation on demand without starting another Workbench instance.
- Support debugging with current source/buffer context, bounded runtime diagnostics, documented debugger controls and computer-use guidance where native APIs do not expose debugger internals.
- Demonstrate discovery, authoring, a compiler failure, correction and successful native validation; preserve existing reload lifecycle fixes.
- Keep ordinary calls in the background, all helpers hidden and bounded, and all build/test processes serial.
- Deploy the verified build into the existing live Codex MCP registration and the loaded BifrostDev native bridge; verify both disk and runtime state separately.

MINIMUM COMPONENTS NEEDED
- The existing Node MCP process and Enforce Workbench plugin bundle; no new service or dependency.
- A shared native reflection helper behind the existing editor-module handler, plus focused bridge/documentation and debugging tools.
- Structured outcomes, target fingerprints, shared operation ordering, regression tests and an end-to-end smoke runner.

REJECTED/NEEDS CLARIFICATION BEFORE ACTION
- Workshop publication is outside the user's selected editor-first scope. Documentation deployment means local project documentation.
- Undocumented debugger protocols and unverified graph APIs cannot be presented as native capabilities. Use observed UI controls for engine-owned debugger panes.
- Do not loosen Windows permissions or use dialog-triggering engine filesystem enumeration. Use the MCP host's authorized filesystem operations.

PRIMARY RISKS
- Workbench 1.8.0.13 is running BifrostDev. This task's test instance (PID 4872) has been closed. A later Steam-launched instance (PID 8036, parent steam.exe 19764) is the sole remaining editor and owns the live NET API. Never infer loaded identity from configured defaults or the previously observed process.
- Animation and Navmesh editors block native script reload; a restored Audio graph also caused a native resource-leak assertion. Save/close auxiliary editors before reloading; do not automatically discard the user's graphs.
- Container and world objects may change after reload/navigation; no stale pointers may be retained by the plugin.
- Native validators have distinct request/response contracts. Unknown or contradictory responses must remain unconfirmed/failed.
- Debugger stepping and arbitrary menu actions may change runtime state; results must state what was observed and what remains unconfirmed.
- Computer Use was stopped by the user before the interactive breakpoint-hit/step/watch demonstration. Keep that boundary explicit; native compile evidence does not establish debugger execution.
- Existing Codex MCP processes retain loaded JavaScript until their connections refresh. Rebuilding the registered dist path is disk deployment, not proof every active connection reloaded.

REQUEST INTERPRETATION
- Implement and deploy the approved next upgrade, including a native equivalent of inspect/navigate/edit computer use and a complete research-to-compile workflow.

UNDERSTANDING OF THE OVERALL TASK IN A BRIEF SUMMARY
- Extend the current integration in place so an agent can discover its real Workbench context, navigate editors, inspect and change live data, deploy its working documentation, diagnose failures and verify compilation autonomously.

## Current iteration progress

- Version 0.15.0-bifrost.1: native reflection across ten editor modules, conflict-checked typed property edits, opaque entity IDs, buffer read/edit/save support, bridge installation, local documentation deployment and bounded debugger diagnostics/control guidance.
- Live evidence: all ten modules opened, reported state/containers and closed. Reversible scale edits, stale-target/value rejection, nested inspection, native rotation readback and live source buffer edits passed.
- Deliberate isolated syntax error was reported at the expected source line. The corrected source compiled successfully with zero errors and 14 existing engine warnings. A subsequent native reload recovered the bridge.
- Fixed numeric wire booleans, native JSON arrays, inaccurate inherited Script Editor Save behavior, typed property metadata, validator routing and duplicate-launch recovery. Save All and debugger panel toggles accurately report dispatch boundaries.
- Final TypeScript check/build passed; 844 automated tests passed, 12 skipped because external M151A2 fixtures are absent. Protocol smoke advertised 62 tools, read all three documentation resources, passed all ten live module probes and source generation/edit/search, then removed its temporary files.
- Final native deployment: all 22 scripts and three guides match source hashes. Native WORKBENCH validation passed with zero errors and 14 base-game warnings; out-of-band reload completed and the bridge reports 0.15.0 in the sole remaining editor.
- Live acceptance completed all edit/compiler checks but failed during generic Save of its unnamed prefab scene. The test source/entity were removed and remaining fixtures were subsequently reconciled and removed after the scene closed. The revised runner avoids that Save call; its final close-only cleanup is not yet reverified. No further editor experiments were run after the user prioritized release work.
- Final fixes reject unnamed-world saves, route nested World Editor writes through the required root/property path, and reject multiple local Windows Workbench sessions before native dispatch (two-second process cache, hidden bounded helper). Nested write routing is compiled but has not had a further live mutation test.
- The existing direct Node MCP registration remains unchanged with startup timeout 60 seconds. The registered dist/index.js is deployed at 0.15.0-bifrost.1. Already-loaded Codex connections still need reconnection to load new JavaScript/schemas; this task's exposed connection remains on its earlier schema. No app restart or hidden connection replacement was attempted while Computer Use was stopped.
- Final process/file inventory: exactly one Workbench (8036); no owned test/build/helper process remains; no owned fixture files remain; cmd.exe count is 25 (original 25, resumed baseline 31). User release work is unblocked. Local evidence: .git/native-final-checks.log, .git/native-deploy-final.log, .git/native-protocol-final.log, .git/native-acceptance-final.log.

## Previous verified iteration

REQUIREMENTS
- Extend the existing MCP for Astra/Codex across the full Workbench editor suite.
- Discover actual loaded projects and available editor modules; expose honest engine boundaries.
- Read, search, and edit serialized editor sources without leaving MCP or replacing whole files unnecessarily.
- Compose existing live tools sequentially with structured outcomes and stop on failure.
- Preserve earlier reload fixes, background behavior, and the no-visible-console/process-leak rule.
- Verify the build, regression suite, MCP protocol, and read-only live editor coverage.

MINIMUM COMPONENTS NEEDED
- Existing Node MCP process and Workbench handlers; no added dependencies or services.
- Capability discovery and ordered batches derived from the existing tool definitions.
- Extended project tool, corrected native request/response adapters, structured tool results.
- Codex instructions, operation documentation, and regression coverage.

REJECTED/NEEDS CLARIFICATION BEFORE ACTION
- Workshop publishing/downloads: user chose the full Workbench editor suite first.
- Arbitrary script execution, guessed engine APIs, and removing lifecycle protections are not a substitute for working editor access.
- No new editor instances or changes to the currently loaded user's addon are needed for these MCP-side upgrades.

PRIMARY RISKS
- Configured default is Bifrost-Dev, but the current engine reports ArmaReforger and BetterEffectsRealism.
- Existing uncommitted reload/focus improvements are retained on bishop/codex-workbench-access.
- Graph editors expose a common module interface; specialized binary compilation remains engine-owned.
- Ordered batches are not atomic transactions; completed mutations cannot be automatically rolled back.

REQUEST INTERPRETATION
- Broad practical access for Astra through Codex, with accurate discovery and results, continuing the existing implementation.

UNDERSTANDING OF THE OVERALL TASK IN A BRIEF SUMMARY
- Upgrade the current Workbench integration across editor discovery, source authoring, and live operation composition, then verify it against the running Workbench without disturbing the user's current project.

## Evidence and progress

- Source/config verified: direct Node registration points to this repository's dist/index.js; one existing registration, startup timeout 60 seconds.
- Read-only engine sweep: all nine currently supported editor module probes succeeded.
- Confirmed defects: native `Loaded Projects` response ignored; `LocateProject` expects `path`, not `name`; `GetPrefabGUID` expects `prefabPath`; `LocatePrefabsFromPath` expects three named fields and returns `prefabsPaths`; uppercase `ERROR` ignored; mode blocks reported as success.
- Native contracts verified through MCP API search and shipped Scripts/WorkbenchGameCommon/EnfusionBlenderTools/AssetLibraryUtils.c.
- Implemented capability discovery, sequential batches, structured responses, source paging/search/exact edits, native adapter corrections, and Codex instructions/docs. Version: 0.14.0-bifrost.1.
- First consolidated check passed: TypeScript, 777 tests (12 skipped), MCP protocol, all nine live module states, ordered live read calls, isolated graph generation and source editing/search.
- Additional live checks caught the native locator's trailing-slash requirement and a Script Authorization Required prompt from shipped `FileIO.FindFiles`. Project-root normalization is corrected; prefab enumeration now uses bounded local MCP filesystem reads and never calls that engine method. The dialog subsequently closed and NET API connectivity returned; this task did not approve the permission or restart Workbench.
- Final consolidated verification PASSED: TypeScript check/build; 58 test files passed, one fixture suite skipped; 777 tests passed and 12 skipped because external M151A2 animation fixtures are absent.
- Final MCP protocol smoke: 59 tools advertised, server instructions present, all nine editor module probes passed, live project IDs correct, ordered live read batch passed, four editor asset generators and source read/edit/search passed.
- Additional live evidence: BetterEffectsRealism located successfully by absolute project root; 59 local prefab source files found; native GUID lookup returned BE20250902AC0004. Directory discovery did not invoke FileIO.FindFiles or trigger another authorization dialog.
- Final process check: Workbench responsive, no authorization dialog, no smoke/test/build process remaining, temporary smoke files removed; cmd.exe count stayed at the observed baseline of 36. No MCP registration was changed and no Workbench restart/launch was performed by this task.
- Existing engine-handler reload/focus changes were retained; this increment adds no new engine handler code. Validation here establishes MCP/protocol behavior and live read access, not new gameplay/multiplayer behavior.

## Handoff

- Source and dist are ready at version 0.14.0-bifrost.1 on bishop/codex-workbench-access.
- Start a fresh Codex task or reconnect the MCP server to load the new schemas and instructions. Existing Node server sessions retain the previous loaded code; Workbench itself needs no restart for this increment.
- Full usage, limits, and engine coverage are in docs/CODEX_WORKBENCH.md and docs/WORKBENCH_EDITOR_OPERATIONS.md.
- Explicit engine coverage boundaries remain: no invented live graph-node API, behavior graph generator, general terrain sculpting, or navmesh generator. Source editing is available for verified text formats. Workshop publishing/downloads are outside this user-selected scope.
- Detailed local verification output: .git/codex-validation-final.log (not part of recipient source control).

## 2026-10-02 — Playbooks layer, index generation, agent index

**63 tools** (was 62): added `wb_playbook`. **844 tests** (was 795).

### Bugs found and fixed (all verified against the live server)

1. **`data/kb/index.json` had rotted.** It was hand-maintained; eight animation
   documents (170 KB) sat in `patterns/` unindexed, and `kb-loader` resolves every
   hit *through* the index, so the entire animation domain was unreachable via
   `wb_knowledge`. Live proof: the query "animation state machine node graph"
   returned the wrong document. Now generated by `scripts/build-kb-index.ts`.
2. **Retrieval matched nothing on ordinary phrasings.** No stemming or synonyms,
   so `"particles"`, `"footsteps"` and `"how do I replicate to clients"` all
   returned zero matches and dumped the entire index back. Fixed with a stemmer
   and a query-side synonym table (query-side only — expanding the index blurs
   distinct topics together).
3. **KB descriptions leaked a contributor's absolute path**
   (`C:\Users\...`) as a document summary. Now filtered.
4. **A corrupt or wrong-shaped playbook index threw** instead of degrading to the
   catalogue. Now shape-validated on load.

### New

- **`wb_playbook`** — a task-oriented layer over the subject-oriented KB. 13
  playbooks, each with preconditions, ordered tool calls, silent-failure traps and
  a verification checklist; `humanStep` separates tasks that need a human click.
- **All three indexes are generated**: `npm run kb:index`, `playbooks:index`,
  `agent:index`. Each has a `--check` drift guard wired into the test suite.
- **`AGENT_TOOLS.md` + `dist/tools.json`** — generated from the server's own
  `tools/list`, carrying the offline/live split per tool. This exists because
  the `wb_` prefix does **not** imply "needs Workbench": `wb_knowledge` and
  `wb_playbook` are `wb_`-prefixed and fully offline. An agent that assumed
  otherwise would skip the two tools most likely to save it.
- **`scripts/docpatch.py`** — byte-preserving doc editing, refusing ambiguous
  anchors. This repo's sources carry mixed line endings and a normalising rewrite
  turns a two-line change into a several-hundred-line diff.
- **`tests/tools/doc-integrity.test.ts`** — fails if the README documents a tool
  that does not exist, or omits one that does. The README had been advertising
  `mod_create`, `mod_build`, `mod_validate`, `prefab_create` and `prefab_inspect`
  — **none of which exist**.

### Documentation corrected

`CONTEXT.md` claimed 50 tools across 41 files with 31 through the bridge; the real
figures are 63 tools across 54 files with 37 live and 26 offline. `README.md`'s
tool table was replaced with one generated from `tools/list`.

### Known gaps, recorded rather than filled

Verified absent from both the KB and the bundled wiki: the New Terrain dialog's
field names and defaults; painting terrain surface layers via API (the wiki's own
page has it commented out as `{{Wiki|TODO}}`); Blender's scene-unit convention.
Two contradictions are recorded unresolved rather than silently decided — notably
`animation_graph`'s tool description says not to edit `.agf` directly, while the
KB says hand-written AGFs survive opening and only an *editor save* wipes nodes.

### Not verified

Nothing in this entry was checked in a live Workbench session: the playbooks are
validated for correctness against the KB and the tool schemas, and the tool is
verified over the MCP protocol, but no authoring task has been driven end to end
through `wb_playbook` against a running editor.

## 2026-10-02 — Playbook coverage completed, agent index hardened

**19 playbooks** (was 13), **862+ tests**.

### Gaps found and closed

Six KB domains had documentation and **no task entry point**: game modes (8 docs),
weapons, vehicles, audio, damage and AI. An agent holding "add a weapon" got a
16 KB topic dump and nothing about ordering. Added `create-a-game-mode`,
`add-a-weapon`, `add-a-vehicle`, `add-a-sound`, `react-to-damage` and
`author-ai-behaviour`.

`tests/tools/playbooks.test.ts` now asserts coverage **by declared playbook id**,
not by keyword. The keyword version passed on a false positive — "weapon sound" in
the audio playbook's triggers made it report weapons as covered while no weapon
playbook existed. Identity does not lie.

### Bug found in the official BI wiki, propagated into our docs

`add-a-vehicle.md` cited `SCR_VehicleDamageMangerComponent`. The **BI wiki
misspells it**; the engine defines `SCR_VehicleDamageManagerComponent`. A playbook
is copied verbatim by an agent, so a wiki typo becomes a compile error. Corrected,
and `tests/tools/playbook-classnames.test.ts` now validates every class-shaped
name in every playbook against `data/api/arma-classes.json` (8693 classes).

### Agent index now carries full input schemas

`dist/tools.json` previously held only argument *names*. It now emits each tool's
complete `inputSchema` verbatim from `tools/list`, so a caller never has to read
`src/tools/*.ts` to learn that `script_create` REQUIRES `scriptType` or that
`scenario_create` takes `type`.

Bug found doing it: the markdown table header I added contained an **unescaped
backtick** (`Inputs (`*` = required)`), which silently terminated the template
literal — the entire document evaluated to `NaN` and `writeFileSync` threw. Found
by bisecting the template line by line. `tests/tools/doc-integrity.test.ts` now
asserts `AGENT_TOOLS.md` is a real document, not a truncated template.

### Tests added

- `tests/tools/playbook-crossrefs.test.ts` — every `wb_knowledge` query a playbook
  recommends actually resolves; every `seeAlso` id exists; every playbook is
  findable by its own id and by prose; no playbook names an unregistered tool
  (except when explicitly warning against one, which it may now do).
- `tests/tools/playbook-classnames.test.ts` — engine-defined class names only.

### Still not verified

No playbook has been executed end to end against a **live focused Workbench**.
They are validated against the KB, the tool schemas, the engine class index and
the MCP protocol. Authoring a real weapon or vehicle has not been driven through
them yet.

## 2026-10-11 — Agent-friction sweep: wiki, API index, KB and tool fixes

Evidence base: 185 Claude Code sessions (Bifrost-Dev, BifrostArmamentFramework,
BLKO-AICQB, P:\Gear), ~32,000 tool calls, every enfusion-mcp error and every
compiler message in them; the installed game data (16 paks, 222,566 files,
6,568 vanilla scripts); the live BI wiki API.

### Tool fixes (each from a recorded failure)

- **`wb_reload` misreported refusals as compile failures.** 7 of 17 recorded
  reloads answered "Compilation failed / No Recent Compile Block Found"; every one
  was fired in parallel with `wb_play`/`wb_stop`, no compile ran, and agents
  hunted a non-existent script error. Now: `wb_reload`, `wb_play`, `wb_stop` run
  through one FIFO lifecycle lock, and a "Compilation failed" with no compile block
  (after a 4 s grace read) is reported as **Reload Refused — no compile ran**.
- **`wb_stop` in edit mode** returned an error telling the agent to call `wb_play`
  first (7 of 8 calls failed). Edit mode is now a successful no-op.
- **`game_read`** returned whole files (up to 500 KB); 19 of 72 failures were
  client token-cap overflows, `chimeraInputCommon.conf` re-requested 6 times.
  Now pages at 40 K chars with an outline (classes/methods or top-level blocks
  with line numbers), `startLine`/`maxLines`, `search` with context, binary sniffing,
  "did you mean" paths for wrong guesses, and a clear note that base-game `.meta`
  files are not shipped.
- **`wiki_read`** rejected `page` and wiki-style titles
  (`Arma_Reforger:Scripting:_Keywords`); now accepts both plus URLs, pages long
  pages (30 K default, bounded section list) and reads single sections.
- **`wiki_search`** scored raw substrings (stopwords matched every page) and
  previewed the page intro. Now BM25 over heading-delimited sections with
  stopwords, stemming, an exact-phrase bonus for pasted error messages, and the
  best-matching section as the preview.
- **`wb_knowledge`** capped 30 K per file, so 3 files still overflowed. Now one
  45 K budget shared across files; long docs return their best-matching sections;
  new `section` argument. KB file ranking fuses the keyword index with full-text
  ranking (the generated keyword lists outvoted the right document, e.g. "how do
  I make an RPC" ranked Conflict Building above Multiplayer & Replication).
- **`asset_search`** rejected `limit` > 100 outright; now clamps.

### Data fixes

- **API index method names**: the Doxygen parser read every link in a declaration,
  gluing linked parameter types onto names (`ActivateContextstringint`,
  `Atan2floatfloat`). 30,035 of 123,571 methods repaired
  (`scripts/repair-method-names.ts`), parser fixed (`.first()`), test added.
- **API index inheritance**: 2,564 game classes had no parent and 105 listed their
  own subclasses as parents (`SCR_Task` → `SCR_AttackTaskEntity`), so inherited
  members were missing or wrong. 5,623 classes now take their nearest indexed
  ancestor from the game's own `class X : Y` declarations
  (`scripts/repair-script-inheritance.ts`, needs the game installed).
- **BI wiki corpus re-captured** (265 official pages; 1 new — *Creating a User
  Action* — and 8 revised since 2026-08-22). The old capture was `innerText`:
  zero code fences, code indentation lost, tables flattened to one cell per line.
  New capture is Markdown with fenced code and tables (106 pages with code, 118
  with tables) via `scripts/capture-wiki.browser.js` + `wiki-capture-receiver.mjs`.
  `apply-wiki-capture.mjs` resolved the repo root one level too high.
- **Index builders silently did nothing on Windows** (`import.meta.url` compared
  against `file://` + a backslash path). Fixed in `build-kb-index.ts` and
  `build-playbook-index.ts`.

### Documentation corrected against the game data

- **Scenario Framework KB**: told agents to place `Tasks/TaskManager.et`, which no
  longer exists (tasks use the self-registering `SCR_TaskSystem`); listed component
  instance IDs as prefab GUIDs; wrong folders (`Prefabs/ScenarioFramework/`,
  "note the space"); a renamed trigger prefab. Replaced with GUIDs read from the
  game data.
- **Conflict docs and `scenario_create_conflict`** presented a workshop mod's
  `GameMode_Seize.et`, `CampaignFactionManager_Seize.et` and an `SCR_Iron_*` class
  as vanilla; the generator's output could only load with that mod. Generator now
  emits `GameMode_Campaign.et` / `CampaignFactionManager.et` and no mod classes;
  docs carry a vanilla-vs-mod note.
- Other stale references fixed: character recipe parents, building base,
  example models and prefabs in tool descriptions (`AK47.et`, `SoldierUS.et`,
  `BarrelGreen_01.xob`), vehicle-variant example (wrong component, property and
  faction key), `Group_US_RifleSquad` folder and GUID.
- 9 playbook tool-call examples did not match the tool schemas (`wb_debug`
  `source` → `log`, missing `projectPath`/`path`, `entityId` → `entityName`).
- New KB docs: **Compile Errors, Runtime Errors & Log Noise** (vanilla-file
  cascade errors, override parameter names, no `Math.Atan`, `GetOwner` only on
  `ScriptComponent`, mod class clashes, benign GM log noise) and **Persistence
  System** (no persistence doc existed).

### Bifrost field lessons merged into the KB

A read-only sweep of the Bifrost project notes found 208 engine-general lessons (182
established, 26 hypotheses); 152 were missing from the KB and 30 partial. Merged:

- New docs: **AI Orders, Movement, Sight & Skill**, **Helicopter & Air Scripting**,
  **Menu Stacking, Input Routing & Layout Facts**, **Testing Without Workbench**.
- Field-note sections appended to 19 existing docs (language, lifecycle, serialization,
  resource usage, config, replication, Game Master, persistence, damage, audio, world,
  physics, best practices, gadgets, weapons, resource manager, gear, vehicles, compile
  errors) and to the live-session and layout playbooks. Hypotheses carry "(unverified)".
- Contradictions resolved with evidence: `Rpc()` **is** available on `ScriptComponent`
  (declared on `GenericComponent`, max 8 args, 16 vanilla ScriptComponents call it — the KB
  said it "fails silently"); vanilla AI **does** drive wheeled vehicles (the KB said
  `BTRLike` was disabled); NetApiHandler changes **are** picked up by `wb_reload` (the KB
  said only a restart works); `SCR_VehicleDamageMangerComponent` typo fixed.

### New guards

- `tests/tools/doc-tool-args.test.ts` — every `tool {json}` example in KB/docs
  must satisfy the tool's schema.
- `tests/tools/agent-friction-fixes.test.ts` — paging, refusal classification,
  lifecycle ordering, wiki title forms, section ranking, KB budget, inheritance.
- `npm run refs:check` (`scripts/check-game-refs.ts`) — every base-game
  `{GUID}path` in KB, playbooks and tool templates must exist in the installed
  game (179 references, 0 problems). Run after each game update.

### Verified / not verified

- `tests/tools/lifecycle-handlers.test.ts` drives the real `wb_reload` and `wb_stop`
  handlers with a fake client: refusal path, a real compile error still reported with
  file:line, and the edit-mode no-op.
- Verified: `tsc`, 910 tests (12 skipped — external M151A2 fixtures), build,
  all drift checks, `refs:check` (182 references, 0 problems), and an MCP-protocol probe
  of the built server over stdio
  (`game_read` paging/search/suggestions/.meta note, `wiki_read` aliases/paging/
  section, `wiki_search`, `wb_knowledge` budget/section, `asset_search` clamp):
  every response bounded, no orphan processes, cmd.exe count unchanged.
- **Not verified live**: the `wb_reload` refusal path, the lifecycle lock and the
  `wb_stop` no-op are tested against a fake client only; the game and Workbench were
  in use during this pass, so no live Workbench call was made. Placing SF prefabs
  with the corrected GUIDs via `wb_entity_create` is also untested live.
- Running MCP connections keep the old code until reconnected.
