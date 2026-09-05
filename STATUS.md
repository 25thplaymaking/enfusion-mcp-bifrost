# Codex Workbench access upgrade — 2026-09-05

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
