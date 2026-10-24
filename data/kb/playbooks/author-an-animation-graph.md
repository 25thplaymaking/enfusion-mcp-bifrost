---
id: author-an-animation-graph
title: Author an animation graph (AGF/AGR)
goal: An animation graph that drives bones or plays clips, using the right track and the right variable-binding discipline.
humanStep: false
tools: [animation_graph, editor_asset, wb_resources, project, wb_reload, api_search]
triggers:
  - animation
  - animate a character
  - animate a vehicle
  - animation graph
  - agf
  - agr
  - bone animation
  - procedural animation
  - state machine animation
  - animation variable
  - drive a bone from script
  - txa
  -anm
seeAlso: [import-a-model-from-blender, write-an-enforcescript-component]
---

# Author an animation graph (AGF/AGR)

**Goal:** a graph that actually drives bones or plays clips — on the right track,
with variables bound correctly.

## Decide the track FIRST — this is the decision that matters

| The request says… | Track | Files needed |
|---|---|---|
| "node editor", "rotate a bone", "procedural", "drive with a variable", "IK", "blend by state" | **AGF graph nodes** | `.agr` + `.agf` **only** |
| "baked", "keyframe", "from Blender", "play a clip", "txa", "anm" | **Baked clip pipeline** | `.agr` + `.agf` + `.ast` + `.asi` + `.anm` |

**Default to the AGF node approach.** Do **not** create `.txa` files for
bone-driven motion — that is the single most common wrong turn here. Both tracks
can be combined.

`.pap`/`.siga` (Procedural Animation) are **legacy**: "New work should use the
AGR/AGF system."

## What each file owns

| Ext | Role |
|---|---|
| `.agr` | top-level config: variables, IK chains, bone masks, commands, graph refs |
| `.agf` | the node graph sheets — the actual hierarchy |
| `.ast` | Animation Set Template — the structural schema (groups/lines/columns) |
| `.asi` | Animation Set Instance — maps abstract `.ast` names to real `.anm` clips |
| `.anm` | **compiled binary — never edit directly** |
| `.txa` | human-readable source exported from Blender, compiled to `.anm` |

`.ast`/`.asi`/`.anm` are needed **only** for baked clip playback, not for
node-only graphs.

> Real class names are `AnimSrcGraph`, `AnimSrcGCT`, `AnimSrcGCTVarFloat`,
> `AnimSrcGCTVarBool`, `AnimSrcGCTVarInt`, `AnimSrcGCTCmd`, `AnimSrcGCTIkChain`,
> `AnimSrcGCTBoneMask` — **not** the `AnimGraph*` names in older docs.

## Steps

1. **Inspect existing evidence before writing.** Real graphs beat documentation.

   ```
   editor_asset {"action":"inspect","path":"<existing .agr or .agf>"}
   animation_graph {"action":"inspect", ...}
   ```

2. **Declare variables in the `.agr` `ControlTemplate AnimSrcGCT` block** —
   `AnimSrcGCTVarFloat/Bool/Int` with `DefaultValue`, `MinValue`, `MaxValue`.

3. **Build the node graph in the `.agf`.**

4. **Drive it from script — and respect the binding discipline:**
   **bind once in `OnPostInit`, set the value every frame in `EOnFrame`. Never
   call `BindFloatVariable` in `EOnFrame`** — it is expensive and wrong.

   ```
   AnimationControllerComponent anim =
       AnimationControllerComponent.Cast(owner.FindComponent(AnimationControllerComponent));
   ```

5. **Validate.**

   ```
   wb_resources {"action":"rebuild","path":"<folder or file you changed>"}
   wb_reload {"target":"scripts"}
   ```

## Traps

- **DO NOT save the AGF through the Workbench Animation Editor UI — it WIPES ALL
  NODES.** The wipe happens on *editor save*, not on open, so opening to inspect
  is safe and saving is catastrophic. Author AGFs as text and register them
  yourself; open them read-only if you need to look.
- **Bind in `OnPostInit` (once); set in `EOnFrame` (every frame).** Binding per
  frame is the expensive mistake.
- **`BindFloatVariable` in `EOnFrame` is explicitly called out as wrong** in the
  KB — treat it as a bug, not a style choice.
- **Do not create `.txa` for bone-driven motion.** It looks like the "proper"
  route and it is the wrong one.
- **`.anm` is compiled binary** — an "edit" that writes to it is lost.
- **The `AnimGraph*` class names are stale.** Using them produces resources that
  do not resolve.
- **Missing LOD levels collapse** in the model, which then makes the animation
  look wrong rather than the graph.
- **The `AnimGraph*` class names appear in `animation_graph`'s own tool
  description**, but the real classes are `AnimSrcGCT*`. The tool's wording is
  stale; the KB is specific and correct.
- **Template vs instance:** the `.ast` defines slots; `.asi` files fill them. One
  graph with many instances is how you get per-weapon variants from one Reload
  line.

## Verify

- [ ] the track choice matches what was actually asked for
- [ ] variables declared in `.agr`, consumed in `.agf`
- [ ] node-only graphs carry no `.ast`/`.asi`/`.anm` they do not need
- [ ] from script: bound once in `OnPostInit`, set in `EOnFrame`
- [ ] observed moving in a live session, with `wb_debug` clean

## Related

- `wb_knowledge "animation"` → then the animation `INDEX.md` routing table,
  which maps each task to the one or two files worth reading
- Playbook `import-a-model-from-blender` — LODs and bones must be right first
