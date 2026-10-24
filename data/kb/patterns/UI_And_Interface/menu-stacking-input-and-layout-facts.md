# Menu Stacking, Input Routing & Layout Facts — Why Mod UI "Goes Dead"

Field results from building a full Game Master UI shell and an arsenal for the Bifrost addon
(game 1.8, Sept–Oct 2026). Proven in an owned off-screen listen-server instance with
`WidgetManager.GetWidgetUnderCursor` checks; physical mouse clicks on a dedicated server
were not separately proven. Items marked **(unverified)** were never exercised.

---

## The z-order lockup (panels look fine but ignore every click)

- A mod shell mounted as its own workspace root is a **z-0 sibling** of the vanilla
  `EditorMenu` root, and **the later sibling wins hit-testing**.
- `MenuManager.OpenMenu` (default `hideParentMenu`) hides the editor menu and **re-adds its
  root after every other sibling when the menu closes**. The editor layout's full-screen
  `Entities` cursor-catching layer then eats every click on the mod's panels, while the
  camera (driven by input actions, not widgets) keeps working. Triggers seen: Escape that
  closes a mod surface, the Pause menu, the player list, a full-screen menu opened over the
  editor.
- Fix used: in a `modded class EditorMenuUI`, re-stack the shell from `OnMenuUpdate` with
  `workspace.AddChild`.
- The vanilla `EditorMenuUI` Escape listener calls `OpenPauseMenu`. Closing the Pause menu a
  frame later still reorders the workspace — override `OpenPauseMenu` and decline when Escape
  just closed a mod surface.
- **Dialogs are different:** `MenuManager.OpenDialog` dialogs (Properties, content browser,
  confirmations) do not hide the editor and do not trigger the re-stack, and
  **`GetTopMenu()` does not report dialogs**. Check `IsAnyDialogOpen()` separately or the mod
  keeps taking clicks and Escape behind native dialogs.

## Proving click routing

- Calling a handler directly proves nothing about which widget the engine routes a click to.
  Park a mod button under the cursor and read `WidgetManager.GetWidgetUnderCursor()`, the
  workspace sibling order, the top menu and the open dialog after each step.
- Client and server logs record no UI input state, and menu creation logging is incomplete
  (a full-screen menu was built 7 times with no "Creating menu" line). Log one warning line
  when a click over your panel is taken by another widget (name and z-order) so the next
  field report is conclusive. Markers that do appear: `Mode_Edit.layout` creation = GM open,
  `pauseMenu.layout` creation = Pause menu.

## Several input paths receive one gesture

- Widget event handlers, editor action listeners, native context-menu callbacks and native
  Properties lifecycle callbacks each receive the same gesture independently; fixing one path
  is not enough.
- When closing mod UI, suppress world actions for the rest of that UI tick so the **release
  half of the closing click** cannot place, select or transform in the world. Stop drag and
  resize handlers on focus loss, hide, disable or modal takeover.
- Native editor box selection (`DrawFrameDown`, `DrawFramePressed`, `DrawFrameUp`) does not
  call `IsInputDisabled`, and releasing queues `ConfirmFrame`; guard each phase plus the
  delayed confirmation, and release state with `ResetFrame`.
- Closing a native menu clears workspace focus even when hidden. The action menu leaves the
  hovered entity's UI-refresh callback subscribed (remove it with `GetOnUIRefresh().Remove`).
  A blocked right-button release skips the native reset of the "selecting" state and poisons
  the next gesture.
- The Space "Create Player Here" hotkey (`SCR_PlaceEntityContextAction`) and
  `OpenBrowserExtended` store an instant-placement position whenever the browser-open call
  returns true, even if a mod then refuses the menu; it is cleared only by a successful spawn,
  so the next `SetSelectedPrefab` spawns at the old spot.

## Focus, timing and widget events

- The engine refuses focus on a widget under a disabled root (silently). `SetFocusedWidget`
  raises `OnFocus` synchronously.
- `SCR_EditBoxComponent` fires `m_OnTextChange` with unchanged text on focus loss and
  teardown — compare with the previous text.
- `SCR_ButtonBaseComponent` emits `m_OnClicked` from both `OnClick` and menu (gamepad)
  selection; a custom row that forwards only `OnClick` misses the gamepad path.
- World time stops while the scenario is paused. Use `System.GetTickCount()` for real-time
  windows (double-click detection, "please wait" timers).
- The widget callback is `OnDisable`, not `OnDisabled`.
- The engine chat history fills at 256 messages and its count stops changing — detect new
  messages by the newest entry, not by count.
- A custom Properties panel must subscribe to the attribute manager's **start and end**
  events (`SCR_AttributesManagerEditorComponent`); end fires before manager cleanup, so do
  not confirm/cancel recursively from it. A full-screen backdrop `ButtonWidget` that returns
  `true` on mouse down/up but does nothing on click consumes input without ending the
  transaction.

## Layout file and rendering facts

- **Colours and alpha blending are linear.** White at low alpha over a dark panel reads
  mid-grey; convert authored sRGB neutrals with `Color.FromSRGBA`. Packed ints are linear.
- `ProgressBarWidget` paints its whole background in the bar colour unless
  `SetDrawBackground(false)` — empty meters read full.
- A fixed rect in a `FrameWidgetSlot` needs the full set: `Anchor`, `PositionX`/`OffsetLeft`,
  `PositionY`/`OffsetTop`, `SizeX`/`OffsetRight`, `SizeY`/`OffsetBottom`. A bare `Size` is an
  unknown keyword.
- Hidden in a layout file is `"Is Visible" 0`, not `Visible 0`.
- The `robotomono` font has no "·" (U+00B7) or "×" (U+00D7) glyph, and each missing glyph
  also swallowed the next character.
- `workspace.ProjWorldToScreen` returns DPI-unscaled units while `GetWidth()`/`GetHeight()`
  are native pixels: compare with `DPIUnscale(GetWidth())` (vanilla
  `SCR_EntitiesEditorUIComponent` does) or off-screen culling breaks above UI scale 1.
- Localisation expands markup after a plain `TextWidget` receives the text, so stripping
  colour tags before translation leaves raw tags. Use `RichTextWidget` for text that can
  carry markup.
- Vanilla waypoint marker icons (`EditableEntity_Waypoint_*.edds`) have a black tile baked
  in; draw custom markers on a canvas instead of recolouring.
- Confirmed usable from script for a modern UI: `BlurWidget`, `AnimateWidget` (position,
  size, colour, padding, blur), `SCR_ScriptedWidgetTooltip`, `CanvasWidget` polygon fills,
  `ItemPreviewWidget`, `SCR_InputButtonComponent` glyphs.
- Input contexts: a non-overlay custom context at priority 50 is zeroed by the native dialog
  context at 51; use `Overlay` or a higher priority (see *Input Manager*).

## Preview worlds (render-to-texture menus)

- Never spawn a full gameplay vehicle prefab into a private preview world (damage, physics,
  fuel, weapons, replication); it crashed on re-entry. Use the render-only
  `SCR_PrefabPreviewEntity.SpawnPreviewFromPrefab` path the vanilla catalogue uses, and
  snapshot data (damage points) instead of holding live hit-zone objects.
- Gameplay characters in a private preview world bind-pose or error (no AIWorld, slot props
  produce invalid-hierarchy errors). Working route: engine preview clones through
  `ItemPreviewManagerEntity`, with `PreviewAnimationComponent` (`SetGraphResource`,
  `BindCommand`, `CallCommand4I`, `UpdateFrameStep`) stepped explicitly. Do not call
  `BaseWorld.UpdateEntities` from a menu update.
- Tear down in one idempotent path: detach the render target, delete preview entities, then
  release the world **(unverified ordering, design guard)**.
- An intermittent native access violation 4–9 frames after opening a preview-world menu
  (29 of 85 runs, same address, no script error) looked like an engine race while the
  preview world streams prefabs **(unverified cause)**.
