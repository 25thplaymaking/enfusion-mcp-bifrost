---
id: create-a-game-mode
title: Create a game mode
goal: A game mode that loads in a world and runs — script, prefab/entities, layer files and a mission header — with every silent failure mode named.
humanStep: true
tools: [gamemode_scaffold, scenario_create_conflict, scenario_create, config_create, script_create, prefab, project, wb_state, wb_entity_create, wb_entity_modify, wb_entity_inspect, wb_entity_list, wb_layers, wb_terrain, wb_save, wb_open_resource, wb_reload, wb_validate_scripts, wb_play, wb_stop, wb_debug, wb_diagnose, api_search, component_search, asset_search, wb_knowledge, server_config]
triggers:
  - create a game mode
  - new game mode
  - custom game mode
  - conflict scenario
  - multiplayer scenario
  - make a scenario
  - seize and secure
  - scenario framework mission
  - mission header
  - game mode script
  - modded game mode
  - add a battle prep timer
  - seeding mode
  - respawn rules
seeAlso: [scaffold-a-new-addon, write-an-enforcescript-component, live-workbench-session, create-a-layout, create-a-menu, add-a-prefab, create-a-config, replicate-state-to-clients, author-terrain-for-a-map, create-a-model-in-workbench, add-a-sound]
---

# Create a game mode

**Goal:** a game mode that actually loads into a world and runs — script, game
mode entity, layer files, mission header — with the silent failure modes named
before you hit them.

**Mostly scriptable, with two human clicks that cannot be automated** (see
*Which steps need a human* below).

## Pick the track first

There are two unrelated stacks. Choosing the wrong one is the single most
expensive mistake here, because everything downstream is written against the
wrong base class.

| | **Conflict / multiplayer** | **Scenario Framework / co-op narrative** |
|---|---|---|
| Game mode class | `SCR_GameModeCampaign` (entity prefab `GameMode_Campaign.et`) | `GameModeSF.et` / `GameModeSF_SinglePlayer.et` |
| World content | `$grp` blocks of bases, CAH zones, patrol spawnpoints in `.layer` files | `Area → Layer → Slot` prefab tree |
| Mission header | `SCR_MissionHeaderCampaign` | `SCR_MissionHeader` |
| Generator | `scenario_create_conflict` | `scenario_create` (`type:"objective"`) + Workbench *Game Mode Setup* |
| Extending it | `modded class SCR_GameModeCampaign` | `modded class SCR_GameModeSFManager` / your own |

Source: `data/kb/patterns/GameModes_And_Scenarios/conflict-scenario-setup.md`
("Multiplayer scenarios use `SCR_GameModeCampaign` — not `GameModeSF.et`").

A third track exists for bespoke non-Conflict modes: `prefab` with
`prefabType:"gamemode"` plus `script_create` with `scriptType:"gamemode"`, using
`SCR_BaseGameMode` as the parent. `data/patterns/game-mode.json` is the
blueprint for that shape (a `{PREFIX}_GameMode` plus a `{PREFIX}_ScoringSystem`
`ScriptComponent`, with a `SCR_MissionHeader` config). That pattern file is
reference data, not a tool — nothing calls it for you.

## Before you start

| Precondition | How to check | If it fails |
|---|---|---|
| The addon exists and is loaded | `wb_projects {"action":"list"}` | Scaffold it first — see playbook `scaffold-a-new-addon` |
| Workbench is connected | `wb_diagnose {}` | `wb_launch {"gprojPath":"<mod.gproj>"}` (needs `allowForeground` policy) |
| You are in **edit** mode with a world open | `wb_state {}` | `wb_stop {}` then open a world. Every mutating tool refuses in play mode |
| You know the addon root | pass `projectPath` explicitly on every generating call | The configured default is not evidence of where files landed |
| The class/method names you intend to override exist | `api_search {"query":"SCR_GameModeCampaign","type":"class","format":"tree"}` | Never invent an Enforce method name. `api_search` first, always |
| Prefab GUIDs are confirmed, not guessed | `asset_search {"query":"ConflictBase","type":"prefab"}` | A wrong GUID is a silent no-op — see Traps |

## Steps

### Track A — Conflict multiplayer

1. **List the game mode features you can compose.** The scaffold does not
   invent features; it composes cookbook-verified ones from
   `data/recipes/gamemode/*.json`.

   ```
   gamemode_scaffold {"action":"list"}
   ```

   Currently: `ambient_ai`, `auto_load_save`, `battle_prep`, `rank_persistence`,
   `scaled_respawn`, `seeding`, `spawn_validation`. Features that override the
   same method are merged into one override.

2. **Generate the scenario files.** This writes up to 7 files: the mission
   header `.conf`, a SubScene `.ent` stub, and `default.layer`, `Bases.layer`,
   `CAH.layer` (major bases only), `Defenders.layer`, and
   `AmbientVehicles.layer` (only when `civVehicleCount > 0`).

   ```
   scenario_create_conflict {
     "scenarioName": "MyConflict_Everon",
     "scenarioDisplayName": "My Conflict",
     "worldName": "Everon",
     "playerCount": 40,
     "xpMultiplier": 0.5,
     "gameModeLabel": "Conflict",
     "author": "you",
     "bases": [
       {"name":"MOB_US","position":"1200 0 3400","faction":"US","type":"MOB"},
       {"name":"MOB_USSR","position":"3400 0 1200","faction":"USSR","type":"MOB"},
       {"name":"BaseAlpha","position":"1800 0 2600","faction":"US","type":"base"},
       {"name":"BaseBravo","position":"2900 0 2100","faction":"USSR","type":"base"},
       {"name":"HarborEast","position":"2200 0 3800","faction":"US","type":"harbor","patrolCount":0}
     ]
   }
   ```

   `worldName` accepts `Everon`, `Arland`, `Western Everon`, or a full resource
   ref such as `{GUID}worlds/MyMap.ent`. Base `type` is one of `base`, `major`,
   `MOB`, `controlPoint`, `sourceBase`, `harbor`. **Y = 0 is correct** — the
   generated files are snapped to terrain when the world opens.

3. **Confirm the files on disk, in the addon.**

   ```
   project {"action":"browse","path":"Missions"}
   project {"action":"browse","path":"Worlds"}
   project {"action":"browse","path":"Worlds/MyConflict_Everon_Layers"}
   ```

4. **Scaffold the game mode script** (Track A only). Writes
   `scripts/Game/GameMode/SCR_GameModeCampaign_modded.c`.

   ```
   gamemode_scaffold {"action":"create","features":["battle_prep","seeding"],"description":"My mod game mode"}
   ```

   The response also carries a **Layer/prefab follow-up** checklist. Those are
   not in the `.c` file — each one is a layer/prefab task you must still do
   (e.g. `seeding` needs `IRON_SeedingRestrictionZoneEntity` on each MOB, an
   `SCR_CampaignSpawnPointGroup` with `m_bOnlyShowDuringSeeding 1`, and
   `AmbientPatrols_SEEDING.layer`).

5. **Read the generated script and finish it.** The recipes are deliberate
   scaffolding, not working features: `battle_prep` leaves `SetBattlePrepEnded()`
   unimplemented, and `spawn_validation` calls `GetSelectedBase()` /
   `GetPlayerFaction()`, which the recipe's own notes call "illustrative — wire
   them to your base/faction lookups".

   ```
   project {"action":"read","path":"scripts/Game/GameMode/SCR_GameModeCampaign_modded.c"}
   ```

6. **Compile and reload.**

   ```
   wb_reload {"target":"scripts"}
   wb_validate_scripts {"configuration":"WORKBENCH","includeWarnings":true}
   ```

   `wb_reload` reports the compile result itself. If it says
   **Reload Failed**, read the diagnostics rather than retrying.

7. **Test it.** For single-machine iteration, open the `.ent` and press play.
   For a real multiplayer check, write a server config and launch a headless
   server.

   ```
   server_config {"name":"My Mod Test","modName":"<addon id from .gproj>","scenarioId":"{GUID}Missions/MyConflict_Everon.conf","maxPlayers":8}
   mod {"action":"build","platform":"HEADLESS"}
   ```

### Track B — Scenario Framework (co-op / narrative)

8. **Bootstrap the world with the Game Mode Setup plugin.** This is the
   recommended route — it places GameMode, TaskManager and the rest in one pass
   and avoids missing required entities. **Human click** (see below).

9. **Add objectives in the live scene.** One call places
   `Area → LayerTask → Slot + Layer_AI → SlotAI` and wires the properties.

   ```
   scenario_create {
     "type": "objective",
     "taskType": "kill",
     "taskName": "Eliminate_Patrol",
     "description": "Clear the patrol from the village",
     "position": "1234 0 5678",
     "targetPrefab": "{98EB9CDD85B8C92C}Prefabs/Characters/Factions/OPFOR/USSR_Army/Character_USSR_Unarmed.et",
     "aiGroupPrefab": "{DDF3799FA1387848}Prefabs/Groups/BLUFOR/Group_US_RifleSquad.et",
     "faction": "US",
     "triggerRadius": 100
   }
   ```

   `taskType` is `kill`, `clearArea` or `destroy`; it picks the LayerTask/Slot
   prefab pair. All five of `taskType`, `taskName`, `description`,
   `targetPrefab`, `aiGroupPrefab` are required — omitting any returns an error.

10. **Create the mission header.**

    ```
    config_create {"configType":"mission-header","name":"MySF_Mission","missionMode":"SF","worldPath":"{GUID}worlds/MySF_World.ent","scenarioName":"My SF Mission"}
    ```

    Use `missionMode:"Conflict"` for `SCR_MissionHeaderCampaign`. A Conflict
    header needs `SystemsConfig "{7C9E720397CC6ACD}Configs/Systems/ConflictSystems.conf"`.

11. **Verify the hierarchy — do not assume the tool's report is the truth.**

    ```
    wb_entity_inspect {"name":"Eliminate_Patrol_Area"}
    wb_entity_list {"nameFilter":"Eliminate_Patrol"}
    ```

    Read the `Children` list. `GetSlotTask()` only searches the **direct**
    children of `LayerTask` for `SCR_ScenarioFrameworkSlotTask` — a Slot nested
    one level too deep is invisible at runtime with no error.

12. **Save and play-test.** Reading `console.log` is the only way to see SF
    task-runtime failures.

    ```
    wb_save {}
    wb_play {}
    wb_debug {"action":"diagnostics","log":"console.log"}
    wb_stop {}
    ```

### Ad-hoc placement (either track)

13. **Place individual Conflict bases interactively** in a world you already
    have open:

    ```
    scenario_create {"type":"base","baseName":"BaseAlpha","baseFaction":"US","baseType":"MOB","position":"1200 0 3400","patrolCount":2}
    ```

    `baseType` is `base` or `MOB` only. The tool wires
    `SCR_CampaignMilitaryBaseComponent.m_sBaseName`, faction affiliation, and —
    for MOBs — `m_bCanBeHQ`, `SCR_CoverageRadioComponent.m_bIsSource` and
    `SCR_CampaignSeizingComponent.Enabled 0`, then places patrol spawnpoints and
    a `SCR_SpawnPoint`.

14. **Query terrain before you commit coordinates** (live world only).

    ```
    wb_terrain {"action":"getBounds"}
    wb_terrain {"action":"getHeight","x":1200,"z":3400}
    ```

15. **Read back a property you think you set.** `setProperty` reports success
    even when it wrote nothing.

    ```
    wb_entity_modify {"name":"BaseAlpha_Base","action":"listProperties","propertyPath":"SCR_CampaignMilitaryBaseComponent"}
    wb_entity_modify {"name":"BaseAlpha_Base","action":"getProperty","propertyPath":"SCR_CampaignMilitaryBaseComponent","propertyKey":"m_sBaseName"}
    ```

## Which steps need a human

| Step | Why |
|---|---|
| **Plugins ▸ Game Mode Setup** (Track B bootstrap) | Workbench plugin wizard; the wizard's *Create entities* and *Create header* buttons are the documented route and have no API equivalent |
| **Snap to Terrain** on generated base entities | Step 2's own "next steps" say to open the `.ent` and snap. `wb_terrain` reads heights; it does not snap entities |
| Setting `m_sFactionKey` on SF Area/Layer/Slot | `SetVariableValue` returns false for this property — must be set in the Attribute panel |
| Setting string-array properties (e.g. `m_aNameOfObjectsToSpawnOnActivation`, `m_aCaptureAndHoldAreaNames`) | The MCP API cannot set string arrays; set them in the UI |

## Traps

Silent first — these produce no error, only a mode that does not work.

1. **`modded class`, never `class`.** `class MySCR_GameModeCampaign :
   SCR_GameModeCampaign` compiles cleanly and is used by nothing. Use
   `modded class SCR_GameModeCampaign` in
   `scripts/Game/GameMode/SCR_GameModeCampaign_modded.c`.
2. **A missing `super.*()` call.** Every override must call `super` first, and
   server-side logic must be guarded with `if (!Replication.IsServer()) return;`.
   Forgetting either produces a mode that runs once, or on clients only.
3. **A Slot nested one level too deep.** `GetSlotTask()` searches only the
   *direct* children of `LayerTask`. `SlotKill`/`SlotClearArea`/`SlotDestroy`
   inside `Layer_AI` instead of directly under the LayerTask means the task
   never registers and the player never sees it.
4. **A trigger slot under a trigger-gated Layer.** If a `SlotPlayerTrigger`
   sits inside a Layer whose `m_eActivationType` is `ON_TRIGGER_ACTIVATION`,
   the trigger is never initialised and the Layer can never fire — chicken and
   egg. The trigger slot must be a direct child of the `Area` (or of an
   always-`ON_INIT` Layer).
5. **Enum properties.** `setProperty` returns **false, not an error**, for an
   enum it cannot resolve. Read the tool's "Property warnings" block — the
   entities are still created with defaults.
6. **A dotted `propertyPath` with no `propertyKey`.** `wb_entity_modify
   setProperty` needs `propertyPath` = component class name and `propertyKey` =
   property name. Passing `"SCR_ScenarioFrameworkArea.m_fAreaRadius"` as
   `propertyPath` alone silently fails.
7. **Wrong prefab GUID = a successful call that placed nothing.** Verify with
   `wb_entity_list` / `wb_entity_inspect` after every placement batch.
8. **A base name mismatch between the header and the world.** The
   `m_aCampaignCustomBaseList` entry's `m_sBaseName` must match
   `SCR_CampaignMilitaryBaseComponent.m_sBaseName` **case-sensitively**. A
   mismatch silently hides the base — no warning, the base just is not there.
9. **No MOB in radio range.** Player spawn points and map markers only appear
   within radio coverage of a friendly MOB or a `ConflictRelayRadio`. Contested
   bases with no MOB in range are unreachable and unmarkable.
10. **AI world limit.** Exceeding `SCR_AIWorld.GetAILimit()` makes patrol and
    defender spawning fail silently. Check the limit before adding spawnpoints.
11. **Zero supplies blocks spawning.** Conflict validates base supplies before
    spawn; a base at 0 supplies silently refuses to spawn players.
12. **`GenericTask` has no completion logic.** It provides UI and hierarchy
    only. Without an explicit finish condition or a
    `SCR_ScenarioFrameworkActionChangeTaskState`, the task stays active forever.
13. **Prefab/feature recipes are scaffolding, not features.** The
    `spawn_validation` and `battle_prep` recipes contain placeholder helper
    calls and an unimplemented `SetBattlePrepEnded()`. `auto_load_save` and
    `rank_persistence` both carry explicit "verify this API exists in your game
    version" notes. Compile it, read it, finish it.
14. **Base manager is not ready at `OnGameModeStart`.** Any base/faction lookup
    there returns nothing. Delay it: `GetGame().GetCallqueue().CallLater(DelayedInit, 500, false)`.
15. **`scenario_create_conflict` will not overwrite.** If *any* of the 7 target
    files already exists, it writes **nothing** and returns the generated
    content for manual merge. The existence of a scenario is not evidence it
    was regenerated.
16. **The world `.ent` must be a SubScene** of a valid vanilla world.
    Workbench rejects a standalone `.ent` for a Conflict world.
17. **`wb_validate` does not validate scripts.** Its `action` enum is
    `material` / `texture` only. Script validation is `wb_validate_scripts`
    (or `wb_compile_status` for the log view).
18. **KB drift:** `conflict-scenario-setup.md` lists a tool named
    `scenario_create_base`. No such tool is registered. The live tool is
    `scenario_create` with `type:"base"`.

## Verify

- [ ] `wb_state {}` reported `edit` mode with the world open
- [ ] `project {"action":"browse"}` shows `Missions/`, `Worlds/<name>.ent` and
      `Worlds/<name>_Layers/` inside the addon
- [ ] `default.layer` contains the game mode entity and the faction manager;
      `Bases.layer` contains every non-harbor base in a `$grp` block
- [ ] Every base name in the mission header's `m_aCampaignCustomBaseList`
      matches `m_sBaseName` on the entity, character for character
- [ ] At least one MOB per faction, within radio range of the contested bases
- [ ] `gamemode_scaffold` returned code, and `project {"action":"read"}` shows
      the placeholder helpers replaced
- [ ] `wb_reload {"target":"scripts"}` then `wb_validate_scripts` report success
- [ ] `wb_entity_inspect` on each objective `Area` shows the Slot as a *direct*
      child of the LayerTask
- [ ] No `Property warnings` block was left unaddressed (or each remaining
      warning was set by hand in the Attribute panel)
- [ ] `wb_play` then `wb_debug {"action":"diagnostics","log":"console.log"}` is
      clean; `wb_stop {}` returns to edit mode
- [ ] For multiplayer: the scenario appears in the server browser and a player
      can spawn at a contested base

## Related

- `wb_knowledge "scenario framework"` — the Area/Layer/Slot framework, all
  LayerTask and Slot variants, activation types, and the QRF system
- `wb_knowledge "conflict multiplayer"` — mission header format, base
  components, layer taxonomy, production design patterns
- `wb_knowledge "gamemode"` — Conflict game mode entities and required managers
- `wb_playbook "catalogue"` — the other task playbooks
- Playbook `scaffold-a-new-addon` — do this first if the addon does not exist
- Playbook `write-an-enforcescript-component` — for anything beyond a game mode
  override
- Playbook `create-a-config` — non-mission-header configs
- Playbook `live-workbench-session` — connecting, reloading, compiling, playing
