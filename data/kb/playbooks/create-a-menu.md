---
id: create-a-menu
title: Create a custom menu (Chimera + Enforce)
goal: A menu that opens in-game, with its input contexts, action polling and hint debouncing already correct.
humanStep: false
tools: [menu_create, project, wb_reload, wb_compile_status, wb_debug, wb_play]
triggers:
  - create a menu
  - add a menu
  - custom menu
  - new menu item
  - add a button to the menu
  - chimera menu
  - pause menu
  - menu stops working after a click
seeAlso: [create-a-layout, live-workbench-session]
---

# Create a custom menu (Chimera + Enforce)

**Goal:** a menu that opens in-game and responds to input — with the five silent
failure modes below already handled.

**Prefer `menu_create` over `script_create` + `layout_create`.** It writes all
three artefacts consistently and encodes the non-obvious requirements that
otherwise fail *silently*.

## The artefacts (all three must agree)

1. the Enforce class (`.c`) with the modded `ChimeraMenuPreset` enum entry
2. a root `.layout` (default `UI/layouts/Menus/`)
3. the `MenuPreset` block in `Configs/System/chimeraMenus.conf`

`presetName` defaults to `className`, and **must match across all three**.

## Steps

1. **See the base classes and defaults.**

   ```
   menu_create {"action":"list"}
   ```

2. **Create it.** Required: `className`. Everything else has a default.

   ```
   menu_create {"className":"TAG_ShopMenu","presetName":"TAG_ShopMenu","title":"Shop","baseClass":"ChimeraMenuBase","projectPath":"<addon root>"}
   ```

   - `baseClass`: `ChimeraMenuBase` (default) or `MenuRootBase` (adds menu-root
     events, dynamic footer, chat handling).
   - `actionContext` defaults to `MenuContext`.

3. **Replace the layout GUID placeholder.** The layout's real resource GUID is
   minted by Workbench into the generated `.meta`, so the scaffold ships
   `REPLACE_WITH_LAYOUT_GUID`. **You must replace it** — a wrong ref here is one
   of the ways a menu silently never opens.

4. **Compile, then test.**

   ```
   wb_reload {"target":"scripts"}
   wb_compile_status
   wb_play
   wb_debug {"action":"diagnostics","log":"console.log"}
   ```

## Traps — these fail *silently*, not loudly

- **Input contexts must be re-activated every frame**, or only the first mouse
  click works and the menu then feels dead.
- **`MenuUp`/`MenuDown` are not in `MenuContext`.** Registering them there does
  nothing.
- **Action listeners do not fire in this menu family — actions must be polled.**
  Do not wait for a listener callback that will never arrive.
- **One physical press arrives twice** (hint invoker *and* the poll), so a
  time-based debounce is required or a single click fires two actions.
- **Hint actions must be TAP, not HOLD.** A hold action crashes the hint's hold
  animation. Valid taps include `MenuBack`, `MenuSelect`, `MenuRefresh`,
  `MenuFavourite`.
- **`SCR_SuperMenuBase` is deliberately not offered.** Without an
  `SCR_SuperMenuComponent` in the layout root it errors on every open while doing
  nothing.
- **A clean compile proves nothing here.** Registration is Chimera config read at
  runtime; only `wb_play` + a console check proves the menu exists.
- **The widget callback is `OnDisable`, not `OnDisabled`.**
- **A menu opening onto a missing/incorrect layout looks like a broken menu.** It
  is a layout problem — check `Anchor Layout` in the `.layout`.

## Verify

- [ ] all three artefacts exist in the addon
- [ ] `REPLACE_WITH_LAYOUT_GUID` appears nowhere in the generated files
- [ ] `presetName` matches across class, layout and `chimeraMenus.conf`
- [ ] `wb_compile_status` is clean
- [ ] the menu opens in-game **and** responds to more than one click in a row
- [ ] `wb_debug diagnostics` is clean for your class

## Related

- `wb_knowledge "ui dialogs tooltips"` — the dialog/tooltip framework
- Playbook `create-a-layout` — when authoring the layout yourself
