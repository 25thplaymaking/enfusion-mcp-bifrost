---
id: create-a-config
title: Create a config (.conf)
goal: A .conf that the Config Editor and the engine both accept, with its classes actually selectable.
humanStep: false
tools: [config_create, mod, wiki_read, wb_validate_scripts, wb_reload]
triggers:
  - create a config
  - conf file
  - define a faction
  - mission header
  - entity catalog
  - placeables config
  - gamemode config
  - config editor
seeAlso: [scaffold-a-new-addon, add-a-prefab]
---

# Create a config (`.conf`)

**Goal:** a `.conf` the Config Editor accepts, whose classes are actually
selectable as roots.

## Before you start

Pick the `configType` — it decides the generated shape:

| `configType` | Produces |
|---|---|
| `mission-header` | a scenario `.conf` (single-player/co-op *and* Conflict mode) |
| `faction` | a faction definition |
| `entity-catalog` | categorized prefab lists |
| `editor-placeables` | Game Master placeable content |

## Steps

1. **Generate it.**

   ```
   config_create {"configType":"faction","name":"MyFaction","factionColor":"255,0,0,255","projectPath":"<addon root>"}
   ```

   - For `mission-header`, the world must be a **full resource reference**, e.g.
     `{9DF143A76F5C6460}worlds/MP/CTI_Campaign_Eden.ent` — a bare path will not
     resolve for Conflict mode.
   - Conflict-specific knobs: `missionMode` (default `Conflict`), `maxPlayerCount`
     (default 40), `xpMultiplier` (omitted when 1.0).

2. **Read it back and check the class header.**

   ```
   project {"action":"read","path":"Configs/<your file>.conf"}
   ```

3. **Validate and compile.**

   ```
   mod {"action":"validate","projectPath":"<addon root>"}
   wb_reload {"target":"scripts"}
   wb_compile_status
   ```

## Traps

- **A config class that lacks the required attribute never appears in Config
  Editor** and cannot be selected as a `.conf` root. This is the single most
  common "my config is ignored" cause.
- **World references must be full resource refs with the GUID**, not paths.
- **Missing dependency** surfaces as
  `ENGINE (E): Addon 'X' dependency 'GUID' can't be added` — add the dependency mod
  to the project list rather than editing the config.
- **Enum-valued properties cannot be set via `setProperty`** — `SetVariableValue`
  silently fails on enum strings. Write the value into the file directly.
- **Config paths must stay inside the addon's `gproj` folder**, or they ship in
  the published mod. Keep source rasters (ASC/PNG heightmaps, satmaps) outside it.
- **Configs are text and authorable**; terrain `.terr`/`.ttile` are binary and
  are not.

## Verify

- [ ] the `.conf` exists inside the addon's `Configs/`
- [ ] its class appears in Config Editor
- [ ] `mod validate` passes its `configs` and `references` checks
- [ ] `wb_compile_status` is clean

## Related

- `wb_knowledge "config system"` — class registration, structure, attributes
- `wb_knowledge "modding basics"` — dependency and GUID rules
