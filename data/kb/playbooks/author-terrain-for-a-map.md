---
id: author-terrain-for-a-map
title: Author terrain for a map
goal: A terrain whose heightfield is verifiably in metres at the right scale, with its surfaces painted — or an honest list of the steps that need a human.
humanStep: true
tools: [wb_state, wb_terrain, wb_entity_create, wb_layers, wb_save, wb_open_resource, wb_debug, wb_editor_module]
triggers:
  - terrain
  - heightmap
  - height field
  - heightfield
  - new terrain
  - satmap
  - satellite map
  - landscape
  - paint surfaces
  - terrain creation tool
  - make a map
  - new world terrain
seeAlso: [live-workbench-session]
---

# Author terrain for a map

**Goal:** terrain whose absolute heights are *proven* in metres at the right
scale — plus an honest list of the steps that need a human.

**Needs a human click or two.** World creation and the *Create new terrain* dialog
are C++/GUI and have no API. Everything else is scriptable. Say which is which
before starting.

## The three arithmetic facts that decide everything

| Field | Meaning |
|---|---|
| **Grid size** | a count of **faces** — "512 faces is 513 vertices" |
| **Grid cell size** | metres **between vertices**; lower = more detail |
| **Terrain size** | `grid × cell` |

- **Grid size never decides how big the terrain is.** When someone asks for a
  22 km map and the grid looks too small, the lever is the **cell size** plus the
  arithmetic — not a bigger grid.
- **Grid size must be a multiple of 128** (32 cells per block × blocks per tile).
- **The cell-size spinner takes limited precision.** Take the nearest value it
  accepts, recompute the real extent from the summary's `size:` line, and say
  whether the drift matters. It usually does not when the shortfall falls in
  empty margin.
- **Accept a "Generate Normal/Vegetation Map" prompt on the first edit.** It is
  not an error; take the defaults.

## Which steps are human?

| Step | Who |
|---|---|
| `File ▸ New World` | **human** — the MCP refuses it as destructive, and no API creates a world |
| the ~16 Base-scene entities | script — `wb_entity_create` per BI's `1_BaseWorldSetup.conf` |
| right-click terrain → *Create new terrain…* | **human** — C++ dialog |
| heightfield | script — `WorldEditorAPI.ModifyHeightMap*` |
| satellite map | **human** dialog (slow: ~3.7× the heightmap's bytes, so minutes) |
| placed entities | script — `wb_entity_create`, batched |
| save, then **reload the world** | save = script; reload = **human** |

Normal maps and terrain layer/texture maps are **not written to file until the
world is reloaded**.

## Steps

1. **Confirm what is loaded and that you are in EDIT mode.** Writes only work in
   edit mode; in play mode every create/delete/save fails.

   ```
   wb_state {}
   ```

2. **Create the Base-scene entity set** (skip what exists; a world holds **0 or 1**
   terrain entity — never create a second).

3. **Save, then have the user open *Create new terrain*.** Give them the field to
   change and the summary lines that must change. Hand them `grid` and `cell`, not
   a vague instruction.

4. **Import the heightfield** — via the dialog, or through the API
   (`BeginTerrainAction` / `ModifyHeightMap*` / `EndTerrainAction`). The API route
   avoids the file dialog entirely.

5. **Stage each import source in its own single-file folder.** The picker defaults
   to PNG, and a folder holding both the `.asc` and the `.png` is a trap:
   importing the PNG builds the terrain out of *image brightness*. The human-side
   guard is the file size shown in the dialog.

6. **PROVE the heightfield before building on it.** This is the step that saves
   the map. Fit the live terrain against the source heightmap: least-squares
   `terrain_y = a·asc + b` over a grid built from the terrain's **reported
   bounds**, and accept only **rms under ~1 m and `a` within a few percent of
   1.0**.

   ```
   wb_terrain {"action":"getBounds"}
   wb_terrain {"action":"getHeight","x":<x>,"z":<z>}
   ```

   **A scaled import keeps the right shape while every absolute height is wrong —
   only `a` betrays it.** The dialog's "available height" line is *capacity*, not
   content. A metre-preserving import fits `a ≈ 1.0`; a normalising one still
   matches in shape, so the symptom is a source max of 367 m reading ~1843 m.
   Measure **before** the satellite map, so a bad heightmap costs one re-import
   rather than a rebuilt map.

   `getBounds` reporting the data range (`-16.3..366.7`) rather than the capacity
   (`-204.8..1843.2`) is the cheapest height-import verification there is.

7. **Satellite map** through the dialog, then save + **reload**.

8. **Paint surfaces.** Right-click a surface → *priority surface mask import*, one
   import per surface, mutually exclusive by priority. **Limit: 5 surfaces per
   terrain block** — the 3×3 diagnostics grid shows green (free), yellow
   (selected), red (limit reached). First layer is the default and cannot be
   removed.

## Traps

- **A tile's texture is 256×256 texels**, so its texel size is `tile_metres/256` —
  always *finer* than the mesh cell of a coarse terrain. Never chase a sharper
  satellite texture; halving tile size quadruples the tile and file count for
  detail the mesh cannot show.
- **A dialog import takes whatever the picker shows.** One import source per
  folder. When a result looks wrong, read the truth from the log —
  `TERRAIN : Importing a height map from "<absolute path>"` names the file actually
  consumed — rather than asking what was clicked.
- **Terrain sources must stay outside the addon's `gproj` folder** or the ASC/PNG
  get packed into the published mod. Import from `Documents\Maps\...`.
- **Everything under `Terrain/` is engine-binary** (`Terrain.terr`, `.ttile`,
  `.edds`). Regenerate by re-running the import; never hand-edit.
- **No terrain export contains surface masks** — the exporter emits heightmap,
  satmap and a roads raster. The masks are yours to generate.
- **The bridge can find an entity but cannot select it** (no AddToEntitySelection).
  Name the entity for the user to click; never claim you preselected it.
- **Budget bulk placement honestly: ~0.6–1.5 s per entity**, and that cost is the
  MCP round trip, not the engine. Thousands of entities is a multi-hour
  resumable run — gate it on the calibration fit above.

## Known documentation gaps (checked 2026-10-02)

These are **not** documented in the KB or the bundled wiki. Do not fill them by
guessing, and do not present a plausible answer as documented fact:

- **The New Terrain dialog's actual field names and defaults.** Neither the KB
  nor the wiki names them. The arithmetic above is grounded; the literal UI
  labels are not.
- **Painting terrain surface layers via API does not exist.** The wiki's own
  WorldEditorAPI page has that section commented out as `{{Wiki|TODO}}`. Surface
  masks are a GUI import step (see step 8), not a scriptable one.
- **No export contains surface masks.** The exporter emits heightmap, satmap and
  a roads raster only; the masks must be generated.

## Verify

- [ ] `wb_state` shows edit mode and the expected entity count
- [ ] terrain size reads the intended metres (`grid × cell`) after the dialog
- [ ] the calibration fit gives **rms < ~1 m and `a` ≈ 1.0**
- [ ] `wb_terrain getBounds` reports the data range, not just capacity
- [ ] satellite map imported with no missing data
- [ ] terrain resource complete on disk: for an addon world, `<Name>.terr` + `.meta`,
      `.Data/` with one `.ttile` **and** one `_normal.edds` per tile, `.EditorData/*.bterr`,
      and a `reimport.lock` (a 32×32-tile grid = 1024 + 1024; a short count means
      the import is still running)
- [ ] you can state which of these survive only after the **reload**

## Related

- `wb_knowledge "navmesh terrain"` — grid/cell semantics, navmesh streaming
- `wb_knowledge "world environment"` — weather, time, fog, lighting
- Playbook `live-workbench-session` — the edit-mode and focus preconditions
