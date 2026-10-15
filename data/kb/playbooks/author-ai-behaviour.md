---
id: author-ai-behaviour
title: Author AI behaviour (behavior tree + navmesh)
goal: An NPC that navigates and acts, on a navmesh that exists, with a behavior tree you can debug.
humanStep: true
tools: [wb_open_resource, wb_resources, wb_play, wb_state, wb_debug, project, wb_reload]
triggers:
  - ai
  - behavior tree
  - ai behaviour
  - npc
  - ai pathing
  - navmesh
  - ai wont move
  - ai wont navigate
  - soldier ai
  - ai debug
  - aicontrolcomponent
seeAlso: [live-workbench-session, author-terrain-for-a-map]
---

# Author AI behaviour (behavior tree + navmesh)

**Goal:** an NPC that navigates and acts, on a navmesh that exists, with a
behavior tree you can watch run.

**Needs a human click** in the Behavior Tree Editor, and a navmesh generation
server connection.

## Navmesh comes first — nothing moves without it

The world must have an `AIWorld` entity with a `NavmeshWorldComponent` pointing at
a `.nmn` file.

| Navmesh | Purpose |
|---|---|
| `Soldiers` | human AI navigation (**required**) |
| `BTRLike` | vehicle AI — the native wheeled driver (`AICarMovementComponent`) paths on it |

Vanilla AI drives wheeled vehicles in 1.8 (read from the 1.8 scripts while designing a
convoy feature; earlier notes saying `BTRLike` was disabled are out of date). Generate a
`BTRLike` navmesh if your map needs AI drivers. Script levers and failure behaviour:
`wb_knowledge {"query":"ai vehicle driving cruise speed stuck"}`.

### Generating

1. Set Navmesh to `Soldiers`.
2. **Connect** → select Soldiers → OK.
3. **Generate** → keep Recast params at defaults → OK → keep Generator area
   defaults → OK.
4. Wait.
5. **Save** → writes the `.nmn`.
6. Assign it to `NavmeshWorldComponent ▸ Navmesh Settings ▸ Navmesh Files Config ▸ Navmesh File`.

**If Autosave is not ticked and you do not click Save, the generated navmesh is
lost** — the generation appears to succeed and nothing persists.

### Partial regeneration — the only sane approach for a mod

Everon's `CTI_Campaign_Eden.nmn` is **over 1 GB**; a full regeneration takes
**1+ hours**. Never regenerate a full map for a small change.

- **Current Tile:** move the camera over the tile → `Rebuild Tile`.
- **Tile Range (Position):** Generate window → Position tab → set From/To world
  positions → Generate. Save via "Save Generated", or LMB-drag select → right-click
  → Mark tiles → Save Marked.

For a mod, **override** instead of copying:
1. Right-click `Navmesh_GM_Eden_Soldier.conf` → **Override** → copy into the mod.
2. Add your partial `.nmn` to the **Navmesh File Overrides** array.
3. Save, then **reload the terrain**.

## Behavior tree semantics

- Nodes return **Success**, **Failure**, or **Running**.
- **Failure is not an error** — it means `false`.
- `Running` propagates to the Root, so the whole tree reads "Running".
- Unlike FSMs, a BT can run several branches at once via the **Parallel** node.

### In-game setup for testing

1. Place `ChimeraCharacterAI` — it carries `AIControlComponent`,
   `AICharacterAimingComponent`, `AICharacterMovementComponent`,
   `PerceptionComponent`.
2. In `AIControlComponent`, set **`OverrideAIBehaviorData`** to your `.bt` file
   and tick **Enable AI**.
3. Run the game with the BT Editor open, then click the soldier in the right-hand
   debug list.

## Traps

- **A BT variable output cannot connect directly to a task input.** Store it in a
  typed variable first. This is the most common wiring failure and it reads as a
  silently ignored value.
- **`Running` propagating to Root means the tree looks stuck** — that is normal
  mid-execution, not a hang. Check the per-node debug colours before concluding it
  is broken.
- **Failure is `false`, not an error.** Treating it as an exception leads to
  removing working branches.
- **Editing a `.bt` has no API.** `wb_open_resource` opens it; there is no
  scripted tree builder. Budget a human.
- **Navmesh is regenerated away if you never save.** See above.
- **Streaming:** for large terrains enable *Use Navmesh Streaming* on the Soldiers
  `NavmeshWorldComponent` and link the LowRes navmesh — but **do not** enable
  streaming on the LowRes component itself.

## Verify

- [ ] `NavmeshWorldComponent` points at a real `.nmn`
- [ ] the `.nmn` was **saved**, not just generated
- [ ] `OverrideAIBehaviorData` set and **Enable AI** ticked
- [ ] the NPC actually moves in a live `wb_play` session
- [ ] BT debug colours show Success/Failure per node while running
- [ ] no BT variable is wired straight into a task input

## Related

- `wb_knowledge "navmesh terrain"` — navmesh types, streaming, terrain entity
- `wb_knowledge "behavior tree"` — full node and shortcut reference
