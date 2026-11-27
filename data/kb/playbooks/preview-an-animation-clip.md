---
id: preview-an-animation-clip
title: Preview an animation clip in the Animation Editor
goal: A .txa built into .anm and shown at an exact frame on Bohemia's preview character in the Animation Editor, captured as a PNG, without taking the user's focus.
humanStep: false
tools: [wb_txa_compile, wb_anim_preview, wb_resources, wb_editor_module, project]
triggers:
  - preview a clip
  - preview an animation
  - show the animation in the animation editor
  - animation editor capture
  - step to a frame
  - compile txa
  - build txa
  - txa to anm
  - check a pose in workbench
  - anim preview
seeAlso: [author-an-animation-graph, import-a-model-from-blender, test-an-item-in-game]
---

# Preview an animation clip in the Animation Editor

**Goal:** see a clip as Workbench plays it, at an exact frame, on the preview
character (and a held item), and keep the picture as evidence.

## Preconditions

- Workbench is running with the addon that holds the clip loaded
  (`wb_projects list`). Files outside a loaded addon cannot be registered.
- The Animation Editor opens **workspaces** (`.aw`), not bare `.anm` files:
  `SetOpenedResource` on an `.anm` returns false. You need a workspace whose
  template lists the clip and whose instance (`.asi`) maps that row to the
  `.anm`. A scratch workspace in a scratch addon keeps the real mod clean.
- A workspace that names files from an addon that is not loaded fails with
  "Error Opening Workspace" (a modal dialog that blocks the NET API until it is
  closed). Vanilla `player_rally_emotes.aw` lives in the Rally DLC addon, not in
  ArmaReforger.

## Steps

1. **Build the clip.** Export the TXA into the loaded addon (EBT or the NET API
   `AnimExportTrackExport`), then:

   ```
   wb_txa_compile {"path":"<absolute .txa>"}
   ```

   First time it registers the file (writes `.meta`, builds `.anm`); later it
   touches the `.txa` so Workbench's file watcher rebuilds it. One clip at a
   time.

2. **Write the workspace** (text, registered in dependency order so each file
   can name the previous one's GUID from its `.meta`): `.ast` (group, columns,
   animation names **sorted alphabetically**), `.asi` (one line per
   `Group.Column.Animation` -> `{GUID}path.anm`), `.agf` + `.agr` (a state
   machine of `AnimSrcNodeSource` nodes is enough for a preview), `.aw` with
   `PreviewModels` (e.g. `AnimTestChar_US_01.xob`) and, for a held item,
   `ChildPreviewModels` with `Bone "RightHandProp"` and `Enabled Visible`.
   `Enabled 1` reads as **Auto**, which hides the item unless an Auto Enable
   tag matches.

3. **Open and show a frame.**

   ```
   wb_anim_preview {"workspace":"anims/workspaces/<name>.aw","allowForeground":true}
   wb_anim_preview {"clip":"<row name>","frame":12,"view":"Right","zoom":1}
   ```

   `clip` double-clicks the row's cell in the Animation Sets tree (the clip
   plays alone, the timeline shows the clip's own frames); `frame` pauses and
   sets the frame field through UI Automation and reads it back.

4. **Read the PNG yourself** before showing anyone. Compare it with the real
   reference frames at matched angles.

## Traps

- **Never save the graph (`.agf`) from the Animation Editor** — it wipes the
  nodes. The preview tool never saves.
- The toolbar Play button runs the *graph*; its timeline counts session frames,
  not clip frames. Use `clip` for clip frames.
- Posted mouse drags do not orbit or pan the preview camera, and the wheel
  zooms toward the view centre (the engine reads the real mouse). Use `view`
  presets, `cube` clicks on the navigation cube and `zoom`. For a bigger
  preview, hide the docks under it (`wb_editor_module` executeAction
  `Window,Graph`, `Window,Channel Curves`, `Window,Log Console`).
- A floating item in the preview means the clip does not carry `RightHandProp`
  at the hand (vanilla weapon clips place the weapon through IK in game). Clips
  that pose the hand prop show the item in the hand.
- TXA-built clips have no animation events; graphs that wait on events never
  advance.
- With two Workbench instances, only one owns the NET API port; the tools act on
  the instance that owns `ENFUSION_WORKBENCH_PORT` (default 5775).

## Verify

- [ ] `wb_txa_compile` reports the `.anm` size and the TXA frame count
- [ ] `wb_anim_preview` reports `frame` equal to the one asked for and the clip's
      `frameCount`
- [ ] the PNG shows the clip pose, not the bind (A) pose
