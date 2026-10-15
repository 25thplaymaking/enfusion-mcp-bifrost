---
id: create-a-layout
title: Create a UI layout (.layout)
goal: A .layout file that loads in the Layout Editor, wired to your Enforce class, and visible in-game.
humanStep: false
tools: [layout_recipe, layout_create, project, wb_open_resource, wb_validate, wb_debug, wb_play]
triggers:
  - create a layout
  - make a ui layout
  - new ui screen
  - hud layout
  - layout file
  - anchor layout
  - build a screen
seeAlso: [create-a-menu]
---

# Create a UI layout (`.layout`)

**Goal:** a `.layout` file that loads in Workbench's Layout Editor, wired to your
Enforce class, and visible in-game.

**Fully scriptable** — no human click required.

## Before you start

| Precondition | How to check | If it fails |
|---|---|---|
| The addon exists and is loaded | `wb_projects {"action":"list"}` | Load it in Workbench first |
| You know which layout you are imitating | `layout_recipe {"action":"list"}` | Read the recipe's own source in Workbench |
| You know your mod's package name | `wb_projects {"action":"locate"}` | Use the real package, never a guess |

**Decide first: `layout_create` or `layout_recipe`?**

- `layout_recipe` — a blueprint extracted from a *real* vanilla Reforger layout.
  Use this when you want something that already looks and behaves correct.
- `layout_create` — a blank scaffold you fill in. Use this only for a layout with
  no vanilla analogue, because a from-scratch layout is where missing
  `Anchor Layout` / `Anchor ID` wiring shows up as a screen that renders nothing.

## Steps

1. **List the blueprints and pick the closest match.**

   ```
   layout_recipe {"action":"list"}
   ```

   Recipes: `status_hud`, `timer_hud`, `icon_overlay`, `progress_hud`,
   `info_panel` (and any others the list returns, with their `params`).

2. **Generate from the recipe.** Required: `recipe` + `name`; `params`
   substitutes values into the blueprint, and anything you omit falls back to the
   recipe's own default.

   ```
   layout_recipe {"action":"create","recipe":"status_hud","name":"SeedingStatusHUD","params":{"text":"<b>Seeding</b>","fontSize":"40"},"projectPath":"<addon root>"}
   ```

   Pass `projectPath` explicitly — the configured default is not evidence of
   where the file went.

3. **Confirm it landed on disk in the addon, not in the game folder.**

   ```
   project {"action":"browse","path":"Scripts/UI"}
   ```

4. **Open it in the Layout Editor and look at it.**

   ```
   wb_open_resource {"path":"<path to .layout>"}
   ```

5. **Validate.** A layout that opens but renders nothing has almost always lost
   its `Anchor Layout` link or its `m_sAnchorId`.

   ```
   wb_validate {"action":"material","path":"<path>"}
   wb_debug {"action":"diagnostics","log":"console.log"}
   ```

6. **Test in game.** Layout parse errors are console-only — the file "loads" and
   shows nothing. Use `wb_play`, then read the console.

## Traps

- **`Anchor Layout` is not optional.** A widget whose `Anchor Layout` is unset
  has no coordinate space and renders at the origin or not at all.
- **Class name prefix.** Use the mod's own prefix. A layout registered under a
  vanilla-sounding class name can collide with a base-game class and silently
  load *theirs*.
- **`OnDisable`, not `OnDisabled`.** This is the callback name in the
  widget/screen base classes; `OnDisabled` compiles as a call to a method that
  does not exist and the handler is simply never called.
- **The file must be inside the addon.** Workbench's Layout Editor only reads
  from a loaded project; a layout written elsewhere is invisible.
- **Console errors, not compile errors.** Layout problems surface in
  `console.log` from `wb_debug`, never in `wb_compile_status`.

## Verify

- [ ] `layout_create`/`layout_recipe` returned success
- [ ] the file exists in the addon's `Scripts/UI` via `project {"action":"browse"}`
- [ ] it opened in the Layout Editor without a parse error
- [ ] `wb_play` shows the screen, and `wb_debug diagnostics` is clean

## Related

- `wb_knowledge "ui dialogs tooltips"` — the dialog/tooltip framework
- `wb_knowledge "ui notifications hints"` — toasts and hints
- Playbook `create-a-menu` — when you also need a Chimera menu entry

## More traps (field notes, 2026-09/10)

- **Colours and alpha blending are linear**: convert sRGB design colours with
  `Color.FromSRGBA`; white at low alpha over a dark panel reads mid-grey.
- **Hidden is `"Is Visible" 0`**, not `Visible 0`.
- **A fixed rect in a `FrameWidgetSlot` needs the full set** (`Anchor`, `PositionX`/`OffsetLeft`,
  `PositionY`/`OffsetTop`, `SizeX`/`OffsetRight`, `SizeY`/`OffsetBottom`); a bare `Size` is an
  unknown keyword.
- `ProgressBarWidget` paints its whole background in the bar colour unless
  `SetDrawBackground(false)`.
- If your panel stops taking clicks after another menu opens and closes, it is the workspace
  z-order: `wb_knowledge {"query":"menu stacking input routing z-order"}`.
