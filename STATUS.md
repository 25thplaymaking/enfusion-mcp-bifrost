# Codex native Workbench bridge — 2026-09-05

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
- Final TypeScript check/build passed; 795 automated tests passed, 12 skipped because external M151A2 fixtures are absent. Protocol smoke advertised 62 tools, read all three documentation resources, passed all ten live module probes and source generation/edit/search, then removed its temporary files.
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
