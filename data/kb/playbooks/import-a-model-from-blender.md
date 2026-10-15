---
id: import-a-model-from-blender
title: Import a model from Blender
goal: An FBX that imports as a correct .xob — right axis, right scale, right LODs, and matching materials.
humanStep: true
tools: [wb_resources, wb_open_resource, wb_editor_module, project, wb_reload, wb_validate]
triggers:
  - import a model
  - blender model
  - import fbx
  - fbx import
  - xob
  - model import
  - bring in a mesh
  - blender pipeline
  - import from blender
  - lod
seeAlso: [create-a-model-in-workbench, add-a-prefab]
---

# Import a model from Blender

**Goal:** an FBX that imports as a correct `.xob` — right axis, right scale,
right LODs, materials actually matched.

**Needs a human click** for the Resource Browser import step.

## The pipeline

FBX is the **source** format; `.xob` is the **compiled binary** the engine loads.

1. Author in Blender (the pipeline is verified interchange-safe with 3ds Max and
   Maya too).
2. Export FBX with the settings below.
3. **Workbench:** Resource Browser → right-click the FBX → **Register and Import**
   → *as Model* → produces `.xob`.
4. Set Import Settings → **Import Resource** / **Reimport**. Materials and `.meta`
   files are auto-created beside the FBX using the **material names from the FBX**.
5. Verify: if skinning was imported, the skeleton appears in the **Bones** section
   of Details.

## The axis rule (the counter-intuitive one)

> Assets must point along **Z+ in Enfusion**, which means the asset must be
> oriented pointing along **Y+ in Blender/Max/Maya**.

- weapons: barrel along Z+
- vehicles: nose along Z+
- buildings: main entrance along Z+
- **walls: from the origin `(0,0,0)` along X+, "facing" Z+** — an 8 m wall is
  `0,0,0 → 8,0,0`, **not** centred (`-4,0,0 → 4,0,0` is wrong)

## Blender export settings

- Object Types: **Mesh, Empty, Armature**
- **Custom Properties: ON** — required for Layer Presets
- **Export Scene Hierarchy: ON** — required for sockets/dummies
- **Leaf Bones: OFF**
- Format: Binary, **FBX 2014/2015 (7.4)**
- Apply **Rotation & Scale, not Location** before export
- Set origin to **geometry centre** (`Set Origin → Origin to Geometry`)

## LODs

- Suffix `_LODx`, case-insensitive: `Car_LOD0`, `Wheel_LOD0`. Multiple meshes per
  LOD are allowed. No recognised suffix = LOD0.
- **Missing levels collapse**: LOD2 without LOD1 behaves as LOD1; LOD4 behaves as
  LOD2. Do not skip a level in the sequence.

## Traps

- **Dot is stripped from names on import.** Blender duplicates become
  `Material.001` → `Material`, which "causes mismatches" and **breaks EBT material
  matching**. Use unique names in the source.
- **Special chars** `/\<>:"|?*#` become `_`.
- **Primitives generally cannot be scaled on 1–2 axes** — they "lose their shape
  and will not be imported". Only vertical-axis scaling works for
  capsule/cylinder; trimesh and box scale on all axes.
- **`SPHVOL` must be a box shape in the FBX** — "engine cannot read actual sphere
  mesh transforms; always create as box".
- **Geometry Params must be reset** or a changed game material / Layer Preset is
  silently ignored on reimport.
- **Legacy Support must not be used** on new assets.
- **Portals must sit in the middle of the opening**, not flush with the wall
  surface; degenerate cases result otherwise. Inward-facing normal, 4 vertices,
  no triangulation, material class `MatLightPortal`, named `PRT_n`.
- **If no `COM_` dummy is present, the engine places the centre of mass at
  `0,0,0`.** The first `COM_` wins and the rest are ignored.
- **Occluders**: aligned with one axis, min ~4–5 m, **max 3–4 per building**, no
  triangulation. Boxes under 30 cm become planes.
- **BSP**: `BSP_xxx`, simple room meshes with openings, material `dummyvolume`,
  and **Generate BSP must be enabled in import settings** before reimporting.
- **BSP debugging options** (force portals, export opaque leaves, BSP
  occupancy/connectivity/geometry) are "for debugging only; uncheck before
  publishing".
- **Layer Presets and sockets need the export flags above** — without Custom
  Properties or Scene Hierarchy they silently do not come across.
- **Updating EBT requires fully removing the old addon and restarting Blender.**

## Verify

- [ ] the `.xob` exists beside the FBX, with `.meta` and material files
- [ ] the model faces the intended axis (Z+ in Enfusion)
- [ ] LODs imported in sequence with no gaps
- [ ] materials matched by name (no `.001` remnants)
- [ ] origin/centre-of-mass dummies where required
- [ ] `wb_reload` + `wb_compile_status` clean after wiring it into a prefab

## Related

- `wb_knowledge "resource manager blender"` — the full hub reference
- `wb_knowledge "prop creation"` — prop assembly and modular parts
- Playbook `create-a-model-in-workbench` — authoring without Blender
