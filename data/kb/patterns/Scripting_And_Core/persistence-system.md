# Persistence System — Saving & Loading Entities, Components and State

Arma Reforger's save/load system (since 1.6.0). Sources: BI wiki *Persistence System* and
*Server Config → persistence* (captured 2026-10-11), plus field lessons from the Bifrost addon
(gear racks / lockers, Sept–Oct 2026). Field lessons are marked **(field)**.

---

## How it fits together

- Persistence is a **world system**: a world systems config (e.g. `GameMasterSystems.conf`) holds a
  `SCR_PersistenceSystem` entry that links to a persistence config (e.g. `GameMaster.conf`). All
  persistence configs live in `Configs/Systems/Persistence` and lean on inheritance.
- **Registration.** Instances are tracked through a persistence component on the prefab or map
  entity (configuration only, not instantiated at runtime) or manually with `StartTracking`.
  Rules are matched by descending priority, then by the most specific prefab/type. Each instance
  gets a 128-bit UUID. Map entities get deterministic IDs as long as the map does not change much;
  **name a map entity in the World Editor** if it must be found again even after being moved.
- **Save.** Pending registrations are processed, then tracked instances are serialised. Depending
  on parent handling, only hierarchy roots are serialised and they handle their children. A
  "default" result means nothing needs saving. **Never store what the prefab or the loaded map
  already provides.**
- **Collections, bundles, storages.** Data goes into collections (e.g. Items), bundled by default
  into larger files, then committed in one transaction. `SessionStorage` holds a playthrough's save
  points; `GamemodeStorage` survives across sessions (XP, unlocks) and can be shared between mission
  variants.
- **Load** is asynchronous. Use the system's `AddDeferredDeserializeTask()` and `WhenAvailable()` to
  wait for related instances instead of assuming order.
- **SaveGameManager** is only loosely coupled: persistence can be used without it, and it works on
  dedicated servers with modded data.

## Custom serialisers

| Base class | Use for |
|---|---|
| `ScriptedEntitySerializer` | an `IEntity` |
| `ScriptedComponentSerializer` | a `ScriptComponent` |
| `ScriptedStateSerializer` | any other managed class |

Vanilla examples to read with `game_read`: `TimeAndWeatherManagerEntitySerializer`,
`SCR_NightModeGameModeComponentSerializer`, `SCR_EditableEntityCoreSerializer`.

## Inventory storage — the trap that loses saved gear (field)

- Items inside a storage are written and restored by the vanilla
  `BaseInventoryStorageComponentSerializer`, **not** by your own entity/component serialiser. A custom
  serialiser for a rack or locker should only carry its own metadata.
- During a persistence **load**, the native serialiser re-places items through the storage's normal
  checks, so overrides of `CanStoreItem` / `CanReplaceItem` / `CanRemoveItem` also run then. If they
  depend on transient state (requests, sockets, UI selection) that is empty at load time, the restore
  is rejected and the saved items silently do not come back.
- Fix: return `true` from those checks while `Replication.Loadtime()` is true, and apply the
  player-facing filter only otherwise.
- `PersistenceSerializerBase` cannot be constructed outside a mission's persistence setup, so a
  save/restart round trip cannot be claimed from a unit-style test; it needs a real mission session.

## Server configuration (`server.json` → `persistence`)

| Key | Default | Meaning |
|---|---|---|
| `autoSaveInterval` | 10 | Minutes between automatic saves (0 = off), range 0–60 |
| `saveRetention` | 10 | Save points kept for the mission |
| `loadSessionSave` | true | Load the latest save point on first start |
| `keepSessionSave` | false | Keep save points after the mission finishes |
| `hiveId` | 0 | Separates UUIDs when servers share one database (0–16383) |
| `databases` / `storages` | — | Override or add databases (`preset` = config resource) and remap storages |

Disable persistence entirely with `"missionHeader": { "m_eSaveTypes": 0 }`. Startup parameters
`-loadSessionSave` and the `-backend*` flags (e.g. `-backendLocalStorage`) are on the wiki's
*Startup Parameters* page.

## Verify

- A save/load claim needs a real save, a restart and a reload in a mission whose world systems
  include persistence. Compile and listen-server play are separate, weaker claims.
- After a load, check the log for `RESOURCES (E)` and `RPL (E)` as well as `SCRIPT (E)`; a missing
  prefab GUID shows up there, not as a script error.

---

## Field notes (Bifrost addon, game 1.8, Sept–Oct 2026)

Observed in an owned off-screen listen-server instance unless marked; **(unverified)** marks inferences or source reads never exercised.

- **Persistence configuration entries need resource IDs.** Vanilla `EntityPersistenceConfig`
  entries carry an ID (`EntityPersistenceConfig "{65DAC3D198D58267}" ...`) that is written into
  every record as its configuration reference (`m_rStoreName`). Entries without one saved
  records with an empty reference and the entities never respawned. A persistence config that
  reuses vanilla's GUID is a true override of vanilla's.
- **`PersistenceSystem.SetConfig` turns a configuration into an unnamed scripted one**
  (`"m_bScripted": true`, no reference), so its records cannot be respawned. Leave the authored
  configuration alone; use a scripted config only to switch saving off, and `ReloadConfig` to
  return.
- **A component serializer whose `GetDeserializeEvent()` returns `BEFORE_POSTINIT` is never
  called for an entity the save spawns back.** No vanilla serializer uses it; use the default
  (`AFTER_ENTITY_FINALIZE`).
- Do not (re)register a restored entity while a load is in progress
  (`SCR_PersistenceSystem.IsLoadInProgress`) — it can re-register before its record is applied
  **(unverified, closed pre-emptively)**.
- **How saves behave on a server:** records are keyed by the persistence UUID, not the
  `RplId`; they live under the server profile's `.save/.../playthroughNNN/savepointNNN/`, not in
  `$profile:` JSON. Save points are MANUAL (GM Save), AUTO (every `autoSaveInterval`) and
  SHUTDOWN (graceful exit only, and only if `m_eSaveTypes` includes it) — a crash or
  `#shutdown` loses everything since the last save point. A record combines
  `GenericEntitySerializer` (prefab + transform), component serializers,
  `BaseInventoryStorageComponentSerializer` and `SCR_EditableEntityComponentSerializer`.
- Items whose prefab no longer loads (mod removed) are skipped by the vanilla inventory
  serializer and the rest of the storage loads **(unverified)**.
- Debugging: `StartTracking` being refused means the persistence configuration did not load
  (check the config is in the build); no deserialize log line from your serializer means the
  record was never applied.
