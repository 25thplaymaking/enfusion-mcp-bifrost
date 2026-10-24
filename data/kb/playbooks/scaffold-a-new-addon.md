---
id: scaffold-a-new-addon
title: Scaffold a new addon
goal: A new addon folder with a valid .gproj, its Scripts tree, and a pattern applied — compiling and loaded in Workbench.
humanStep: true
tools: [mod, project, wb_projects, wb_validate_scripts, wb_reload, wb_bridge]
triggers:
  - new addon
  - create a mod
  - scaffold a mod
  - start a new project
  - new reforger mod
  - set up an addon
  - blank addon
seeAlso: [live-workbench-session, write-an-enforcescript-component]
---

# Scaffold a new addon

**Goal:** a new addon folder with a valid `.gproj` and script tree, loaded and
compiling in Workbench.

**Needs a human click** to open it in Workbench the first time.

## Decide: bare scaffold or a pattern?

- `pattern` omitted → a bare, valid addon skeleton. Start here when you are
  building something the existing patterns do not cover.
- `pattern` set → composes a working starting point (e.g. `custom-faction`,
  `game-mode`). Use it when one fits, because it gets the wiring right for you.

Patterns available: see `data/patterns/*.json` — `admin-tool`, `custom-action`,
`custom-component`, `custom-faction`, `custom-vehicle`, `game-mode`, `hud-widget`,
`modded-behavior`, `spawn-system`, `weapon-reskin`.

## Steps

1. **Scaffold it.**

   ```
   mod {"action":"create","name":"MyMod","description":"...","prefix":"MM"}
   ```

   - `prefix` is the class-name prefix and is **capped at 4 characters** by the
     tool schema. Pick it now; renaming later means touching every class.
   - Pass `projectPath` explicitly rather than relying on the configured default.

2. **Confirm the `.gproj` and its identity.** Read back the exact path, ID and
   GUID — a generic project API can hand back `ArmaReforger.gproj` instead of
   yours.

   ```
   project {"action":"browse","path":"."}
   ```

3. **Validate without building.** This is the cheap check and it needs no
   Workbench session.

   ```
   mod {"action":"validate","projectPath":"<addon root>"}
   ```

4. **Open it in Workbench** (human), then confirm the loaded identity from the
   running instance rather than from config.

   ```
   wb_projects {"action":"list"}
   ```

5. **Compile.**

   ```
   wb_reload {"target":"scripts"}
   wb_compile_status
   ```

## Traps

- **`mod build` needs a local Steam-installed *Diag* Workbench**, and has no
  unattended path. Grounded facts: it spawns `ArmaReforgerWorkbenchSteamDiag.exe`
  (you must opt into the "Profiling Build" beta in Steam or it fails), with a hard
  **300 s timeout** after which it is killed, and there is **no interactive-session,
  Steam-bootstrap or desktop handling anywhere in the code path** — no retry, no
  log capture, no fallback. In practice it works on the machine where Workbench
  runs interactively; treat it as a *local* operation. For iteration, edit source
  and let the already-open Workbench recompile. (On this host it has additionally
  been observed failing from a remote session with a base-game resolution error —
  treat that as a report from the field, not as the documented mechanism.)
- **The prefix is capped at 4 characters** and rejected above that.
- **A configured default project path is not evidence.** Always resolve the loaded
  project explicitly before authoring.
- **Validate before you build.** `validate` catches structure/gproj/script issues
  with no build step; discovering them during a build costs minutes.
- **`.gproj` GUIDs are identity.** The engine identifies assets by GUID stored in
  `.meta`, not by filename or path.

## Verify

- [ ] `mod create` returned the created path
- [ ] the `.gproj` exists with a distinct ID and GUID (echoed back)
- [ ] `mod validate` passes its structure/gproj/scripts checks
- [ ] `wb_projects list` shows the addon loaded
- [ ] `wb_compile_status` is clean

## Related

- `wb_knowledge "modding basics"` — asset GUID rules, addon structure
- Playbook `live-workbench-session` — the session preconditions
