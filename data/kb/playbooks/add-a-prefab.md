---
id: add-a-prefab
title: Add or override a prefab (.et)
goal: A prefab that loads, inherits correctly, and — if placeable — has a stable root ID so it replicates.
humanStep: false
tools: [prefab, game_duplicate, game_read, wb_prefabs, wb_validate, project, wb_reload]
triggers:
  - add a prefab
  - new prefab
  - create a prefab
  - override a prefab
  - duplicate a base game prefab
  - placeable entity
  - entity template
  - et file
  - custom prop
seeAlso: [write-an-enforcescript-component, live-workbench-session]
---

# Add or override a prefab (`.et`)

**Goal:** a prefab that loads, inherits correctly, and — if it is placeable —
carries a stable root `ID` so it replicates instead of kicking clients.

## First: new, override, or duplicate?

| Goal | Method |
|---|---|
| Brand-new entity from scratch | `prefab action=create` |
| **Override** a vanilla asset | copy the file, keep the **same GUID** in `.meta` |
| Standalone copy of a vanilla asset | `game_duplicate` (new GUID, no effect on the original) |
| Child inheriting a parent | `prefab action=create` with `parentPrefab` |

The engine identifies assets **by GUID only** — filename and path are irrelevant
for overrides. That single fact drives this whole table.

## Steps

1. **Create it** with an explicit `prefabType`:

   ```
   prefab {"action":"create","name":"MyProp","prefabType":"prop","projectPath":"<addon root>"}
   ```

   Valid `prefabType`: `firearm`, `attachment`, `ground_vehicle`, `air_vehicle`,
   `character`, `prop`, `building`, `item`, `group`, `spawnpoint`, `gamemode`,
   `generic`.

2. **Or duplicate a base-game prefab to learn the correct shape:**

   ```
   game_duplicate {"source":"{GUID}Prefabs/.../X.et"}
   ```

3. **Inspect what you made, including its ancestry:**

   ```
   prefab {"action":"inspect","path":"<path to .et>","include_raw":false}
   ```

4. **Give a placeable prefab a root `ID`.** See the trap below — this is not
   optional for anything a player can place.

5. **Validate, then compile.**

   ```
   wb_validate {"action":"material","path":"<path>"}
   wb_reload {"target":"scripts"}
   ```

## Traps

- **A placeable prefab with no root `ID` kicks the placing client** with
  `REPLICATION_SYSTEM_FAILURE` / `does not contain entity with ID <16-hex> but it
  exists on server`. The dedicated server does **not** crash, so this looks like a
  client-only bug. Root cause: the entity ID Workbench assigned was never written
  into the `.et`, so server and client assign different IDs on load.
  **Fix:** write a 16-hex root `ID` into the prefab. Base `GenericEntity`
  templates and UI-only prefabs do not need one; placeable prefabs do.
- **Always use fully-qualified GUID paths** — `{3E413771E1834D2F}Prefabs/...`.
  A bare GUID produces a wrong-GUID error.
- **Do not prefix the prefab ref with its config entry's GUID** (e.g.
  `69290E56…{104F…}Prefabs/…`) — that fails with "CreateEntity returned null".
  Pass `{GUID}Prefabs/…` alone.
- **A duplicate inherited `MeshObject` breaks creation** with a null. Assign or
  reuse a stable component ID.
- **Adding an override without matching the GUID** silently does nothing — it
  looks like the override was ignored.

## Verify

- [ ] `prefab inspect` resolves the full inheritance chain
- [ ] the `.meta` GUID is correct for your intent (same = override, new = copy)
- [ ] every prefab listed in your placeables config has a root `ID`
- [ ] it places in a live session **as a client**, not just on the server

## Related

- `wb_knowledge "prefabs basics"` — `.et` structure and inheritance
- `wb_knowledge "modding basics"` — GUID/override/duplicate semantics
