---
id: add-a-vehicle
title: Add or variant a vehicle
goal: A driveable vehicle prefab (or a re-factioned variant of an existing one) with mesh, physics, animation graph, fuel and damage wired, and a root ID so it spawns for clients.
humanStep: false
tools: [prefab, game_duplicate, config_create, animation_graph, component_search, api_search, editor_asset, wb_prefabs, wb_resources, project, wb_reload, wb_play]
triggers:
  - add a vehicle
  - new car
  - truck
  - vehicle variant
  - change a vehicle
  - jeep
  - tank
  - vehicle physics
  - spg seat
  - spawn a vehicle
seeAlso: [add-a-prefab, author-an-animation-graph, replicate-state-to-clients]
---

# Add or variant a vehicle

**Goal:** a `.et` under `Prefabs/Vehicles/…` that drives, spawns for every client,
and reports its damage state — either a new vehicle off a recipe parent, or an
inherited variant of an existing one.

**Needs a human click:** two, and only for a *new* vehicle.

1. Register the generated `.agr` / `.ast` in Workbench (right-click → *Add to
   project*) — `animation_graph action=author` writes the files but does not
   register them (its own returned "Next steps" says so).
2. Authoring engine/gearbox numbers, suspension IK, seat placement and physics
   mass are Object-Properties work in the Workbench inspector; the MCP tools
   scaffold the prefab and the graph, they do not tune a drivetrain.

A **variant** (the cheap path) needs no human click beyond adding the prefab to
a placeables/catalog config.

## Before you start

| Precondition | How to check | If it fails |
|---|---|---|
| Mod project root known | `project {"action":"browse","path":""}` | Pass `projectPath` explicitly, or set the configured default |
| Base parent prefab exists in game data | `prefab {"action":"inspect","path":"Prefabs/Vehicles/Core/Wheeled_Base.et"}` (a leading `{GUID}` prefix is accepted and stripped) | Pick another parent from the recipe variant table below |
| Workbench connected (only for register/locate/play) | `wb_prefabs {"action":"getGuid","templatePath":"Prefabs/Vehicles/Core/Wheeled_Base.et"}` | `register:false` on `game_duplicate`, and skip `wb_resources` / `wb_play` |
| Hull `.xob` path known | `api_search {"query":"xob vehicle","type":"any"}` or inspect a vanilla vehicle's `MeshObject.Object` | Vehicle will be invisible in-game — see Traps |

## Steps

### Path A — new vehicle

1. **Create the prefab from the recipe.** `prefabType` is
   `ground_vehicle` or `air_vehicle`; `variant` selects the base parent and
   destination subdirectory. Valid `variant` values for `ground_vehicle`:
   `car`, `truck`, `apc`, `tracked`. `air_vehicle` has **no** variants.

   ```json
   {"action":"create","name":"M151A2","prefabType":"ground_vehicle","variant":"truck","description":"M151A2 cargo truck","projectPath":"<addon root>"}
   ```

   With `parentPrefab` supplied, `includeAncestry` (default `true`) resolves the
   whole ancestor chain and pre-populates inherited components as overridable
   entries with their original GUIDs. Read the returned file before editing it —
   the tool prints the generated `.et` plus a checklist.

2. **Ground recipe parents (from `data/recipes/ground_vehicle.json`):**

   | Variant | Default parent | Subdirectory | Engine power (recipe note) |
   |---|---|---|---|
   | `car` | `Prefabs/Vehicles/Core/Wheeled_Car_Base.et` | `Prefabs/Vehicles/Cars` | 80–150 kW |
   | `truck` | `Prefabs/Vehicles/Core/Wheeled_Truck_Base.et` | `Prefabs/Vehicles/Trucks` | 150–300 kW |
   | `apc` | `Prefabs/Vehicles/Core/Wheeled_APC_Base.et` | `Prefabs/Vehicles/APCs` | not stated |
   | `tracked` | `Prefabs/Vehicles/Core/TrackedVehicle_Base.et` | `Prefabs/Vehicles/Tracked` | 300–750 kW |
   | *(none)* | `Prefabs/Vehicles/Core/Wheeled_Base.et` | `Prefabs/Vehicles` | — |
   | `air_vehicle` | `Prefabs/Vehicles/Core/Helicopter_Base.et` | `Prefabs/Vehicles/Air` | — |

3. **Duplicate a vanilla vehicle instead** when the recipe parent is too thin —
   this is the reliable way to get a complete `VehicleWheeledSimulation` /
   damage / fuel component set:

   ```json
   {"sourcePath":"{657590C1EC9E27D3}Prefabs/Vehicles/…/LAV25.et","destPath":"Prefabs/Vehicles/Trucks/MyTruck.et","flatten":false,"register":true}
   ```

   `flatten:false` (default) keeps the parent reference and preserves ancestor
   GUIDs as overridable entries. `register:false` writes the file without
   registering it (use when Workbench is not running).

4. **Set the two override components the recipe names.** `ground_vehicle`
   expects `MeshObject.Object` (hull `.xob`) and
   `VehicleAnimationComponent.m_sAnimationGraph` (`.agr` path). `air_vehicle`
   expects `MeshObject.Object` and `RotorComponent.m_sRotorModel` (rotor `.xob`,
   helicopter only). Pass them at create time:

   ```json
   {"action":"create","name":"MyTruck","prefabType":"ground_vehicle","variant":"truck","components":[{"type":"MeshObject","properties":{"Object":"{…}Assets/Vehicles/MyTruck/MyTruck_Hull.xob"}}],"projectPath":"<addon root>"}
   ```

5. **Author the vehicle animation graph**, then point
   `VehicleAnimationComponent.m_sAnimationGraph` at the generated `.agr`:

   ```json
   {"action":"author","vehicleName":"MyTruck","vehicleType":"wheeled","wheelCount":4,"seatTypes":["driver","passenger"],"hasTurret":false,"hasSuspensionIK":true,"outputPath":"Assets/Vehicles/MyTruck/workspaces","projectPath":"<addon root>"}
   ```

   `vehicleType` is `wheeled` | `tracked` | `helicopter` | `boat`.
   `wheelCount` is 2–8 and **must be even**. `hasShockAbsorbers` and
   `hasSteeringLinkage` add their IK chains; `dialList` takes variable names
   (e.g. `["Engine_RPM","SPEED"]`). `action=setup` with `step=prefab_setup`
   returns the component wiring for the prefab; `action=inspect` with
   `inspectAction=validate` runs the pitfall checks and needs the `.agf`.

6. **Register the graph files and rebuild the resource DB**, then reload
   scripts:

   ```json
   {"action":"register","path":"Assets/Vehicles/MyTruck/workspaces/MyTruck.agr"}
   ```

   ```json
   {"target":"scripts"}
   ```

7. **Make it spawnable.** Put the prefab in an `editor-placeables` config (Game
   Master) or an `entity-catalog` config:

   ```json
   {"configType":"editor-placeables","name":"MyVehicles","categoryName":"Vehicles","prefabRefs":["{MODGUID}Prefabs/Vehicles/Trucks/MyTruck.et"]}
   ```

   `config_create configType` is one of `mission-header`, `faction`,
   `entity-catalog`, `editor-placeables`.

8. **Test it.** Requires edit mode; compiles scripts and launches the world.

   ```json
   {"debugMode":true}
   ```

### Path B — variant an existing vehicle (cheapest, and what the KB mandates)

9. **Inherit from the existing prefab and change the faction.** Required even
   if you only retexture: AI and game-mode systems read the faction, not the
   skin.

   ```json
   {"action":"create","name":"MyUAZ469_FIA","prefabType":"generic","parentPrefab":"{99F1610551D54D17}Prefabs/Vehicles/Wheeled/UAZ469/UAZ469_base.et","components":[{"type":"SCR_VehicleFactionAffiliationComponent","properties":{"faction affiliation":"FIA"}}],"description":"FIA variant","projectPath":"<addon root>"}
   ```

   Vanilla vehicles carry `SCR_VehicleFactionAffiliationComponent` with the property
   `"faction affiliation"`, and its value is a faction **key** (`US`, `USSR`, `FIA`, `CIV`), not a
   side name like `OPFOR` (checked in `UAZ469_base.et`, 2026-10-11). The base game has no tracked
   vehicles. Run `prefab {"action":"inspect"}` on the parent first: an override must reuse the
   inherited component's ID (`{5882CBD9AC741CEC}` in `UAZ469_base.et`) or the variant ends up with two.

   **UNVERIFIED:** `prefabType:"generic"` with `parentPrefab` is used here
   because the KB documents the vehicle variant path as "create inherited
   variant → change `FactionAffiliationComponent.Faction`" without stating
   which `prefabType` to pass; `ground_vehicle` with the matching `variant` is
   the plausible alternative and will also resolve the ancestor chain. The
   accepted GUID string and exact class spelling of the `Faction` property value
   are **not documented in the KB** beyond the property path
   `FactionAffiliationComponent.Faction` — inspect the vanilla parent to copy
   them.

10. **Give the variant a root `ID`** (see the first trap) before it can be
    placed or spawned for clients.

11. **Confirm what you actually changed**, ancestry included:

    ```json
    {"action":"inspect","path":"Prefabs/Vehicles/Tracked/MyTank_OPFOR.et","include_raw":false}
    ```

## Component reference (Object Properties, from the vehicle KB)

| Component | Key properties |
|---|---|
| `VehicleWheeledSimulation` | Engine (`Max Power` kW, `Max Torque` Nm), Clutch, Gearbox, Differentials, Axles (`Max Steering Angle` deg) |
| `SCR_VehicleDamageManagerComponent` | `HP Max`, `HP Damaged` (smoke threshold), `Collision Multiplier`, `Collision Velocity Threshold`, `Wreck Model`, destruction/burning particle resources |
| `FuelManagerComponent` | `SCR_FuelNode` array (one per tank): `Fuel Type`, `Max Fuel`, `Initial Fuel Tank State` |
| `SCR_FuelConsumptionComponent` | `Fuel Consumption` (litres/hour at max power RPM) |
| `SCR_MotorExhaustEffectGeneralComponent` | exhaust particle effect resource |
| `SlotManagerComponent` | `EntityPrefab`, `AttachType: RegisteringComponentSlotInfo` (turret/child attachment) |
| `ActionsManagerComponent` | contextual actions |
| `MeshObject` | mesh + materials |

Look up anything not listed with
`component_search {"query":"vehicle","category":"vehicle"}` or
`api_search {"query":"VehicleWheeledSimulation","type":"class","format":"tree"}`.

## Collision layers and shapes (silent failure #2)

- Wheels/body need the **`NavmeshVehicle`** layer or AI will not path to or
  drive the vehicle.
- **`VehicleSimple`** layer is for rough vehicle-vs-static collision (building
  hit detection) without full physics.
- **Never use `UTM_` (trimesh) colliders on a vehicle body** — `UBX_` (box) or
  `UCX_` (convex) only.
- Wheel colliders use the `Wheel` preset (`FireGeometry + CharCollide`) so
  characters are pushed by wheels.

## Animation variables that must be fed

`VehicleAnimationComponent` writes these from physics/input every frame — do
**not** set them from script: `wheel_0…wheel_7`, `suspension_0…suspension_7`,
`steering`, `steering_axle2`, `steering_delay`, `VehicleSteering`,
`VehicleThrottle`, `VehicleClutch`, `VehicleBrake`, `VehicleHandBrake`,
`VehicleAccelerationFB/LR`, `SPEED`, `Gearbox_RPM`, `Engine_RPM`, `SPEED`
damping pair (`Speed_dumping`, `Speed_dumping2`), `YawAngle`, `Yaw`,
`Pitch`, `WaterLevel`, `IsSwimming`, `VehicleDoorState`.

Omit `wheel_4…wheel_7` / `suspension_4…7` on a 4-wheel vehicle. Variable
**names are not universal** — S105 uses `ENGINE_RPM_0`, `GEARBOX_RPM_0`,
`ENGINE_RPM_delay`, `ENGINE_RPM_delay2` where LAV25 uses the names above; match
whatever your `VehicleAnimationComponent` is wired to feed. The 15 standard
commands (`CMD_Vehicle_GetIn`, `CMD_Vehicle_GetOut`, `CMD_Vehicle_SwitchSeat`,
`CMD_Death`, `CMD_OpenDoor`, `CMD_Vehicle_CloseDoor`,
`CMD_Vehicle_Engine_StartStop`, `CMD_HandBrake`, `CMD_Lights`, …) are safe to
include even if unused.

## Traps

**Silent failures — these produce no error, only a missing or broken vehicle:**

1. **A placeable prefab with no root `ID` kicks the placing client** with
   `REPLICATION_SYSTEM_FAILURE` / `does not contain entity with ID <16-hex> but
   it exists on server`. The dedicated server **keeps running**, so it presents
   as a client-only bug while the server log stays clean. Root cause: the
   entity ID Workbench assigned was never written into the `.et`, so server and
   client assign different IDs on load. **Fix:** write a 16-hex root `ID` into
   the prefab. Base `GenericEntity` templates and UI-only prefabs do not need
   one; anything a player or GM can place does.
2. **`MeshObject.Object` left empty → the vehicle is invisible in-game.** The
   prefab creates fine, spawns fine, and the client sees nothing. `prefab`'s own
   tool description calls this out for visible prefabs.
3. **Missing `NavmeshVehicle` layer on wheels/body** → vehicle drives but AI
   never uses it. No warning.
4. **Leaving `FactionAffiliationComponent.Faction` at the parent's value on a
   variant** → AI and game modes keep treating it as the original faction. No
   warning, even with no retexture at all.
5. **An override without a matching component GUID is silently ignored** — it
   looks like the editor dropped your change.
6. **A duplicate inherited `MeshObject`** breaks creation with a null. Reuse or
   assign a stable component ID instead of adding a second one.
7. **`UTM_` trimesh colliders on the body** — physics misbehaves with no
   diagnostic.
8. **Generated `.agr` uses `{PLACEHOLDER_GUID}` / `{PLACEHOLDER_GUID_2}`** in its
   `AnimSetTemplate` and `ControlTemplate` lines. Left unreplaced, the graph
   does not bind to the animation set — verify in the Workbench inspector after
   registering.

**Loud failures, but easy to misdiagnose:**

- `SCR_DamageManagerComponent.GetDamageManager(owner)` fails for some vehicle
  subtypes (`SCR_WheeledDamageManagerComponent`, `SCR_ArmorDamageManagerComponent`,
  …). Use `owner.FindComponent(SCR_DamageManagerComponent)`. This fails silently
  (null manager) rather than erroring.
- `SetDamageOverTime` on anything except `GetDefaultHitZone()` **crashes the
  engine** (access violation at 0x0) — `GetAllHitZones()` returns non-null
  zones whose native pointer is invalid, so a script-level `if (hz)` does not
  protect you.
- `SetDamageOverTime` **persists after the script entity that set it is
  deleted**. Always zero it (`SetDamageOverTime(EDamageType.FIRE, 0)`) on death
  and in `OnDelete`. For vehicle fire, prefer
  `SCR_FlammableHitZone.SetFireState(SCR_EBurningState.BURNING, -1)` +
  `LockFireRate()` over DoT.
- `QueryEntitiesBySphere` returns **multiple child/bone entities per vehicle** —
  deduplicate against the root or damage is applied many times per tick. And
  `while (root.GetParent()) root = root.GetParent();` null-crashes; store the
  parent in a temp variable.
- No scriptable **torque/RPM setter** on a driven wheel, and no way to redirect a
  wheel slot to a different bone. `WheelSetRollingDrag` stops a wheel at
  standstill but is ineffective under throttle. `WheelGetRadius(idx)` always
  returns the *design* radius, never the runtime state — that is what makes the
  2WD↔4WD ghost-axle trick work (`WheelSetRadiusState(idx, 0.001)`, restore with
  `WheelSetRadiusState(idx, WheelGetRadius(idx))`).
- `WheelGetPosition(idx, 0)` returns **maximum-droop** local coords (~0.7–0.8 m
  below the visual wheel child's rest position). Use a 1.5 m proximity
  threshold, not 0.5 m.
- Vehicle child entities have **no names** (`GetName()` returns `''`) and
  `Child[0]` at runtime is the seated player, not a wheel.

## Verify

- [ ] `prefab action=inspect` resolves the full inheritance chain
- [ ] `MeshObject.Object` points at a real `.xob` — the vehicle is visible
- [ ] `NavmeshVehicle` layer present on wheels and body
- [ ] body colliders are `UBX_`/`UCX_`, wheel colliders on the `Wheel` preset
- [ ] `VehicleAnimationComponent.m_sAnimationGraph` points at the generated
      `.agr`, and its `AnimSetTemplate` / `ControlTemplate` GUIDs are real
- [ ] `.agr` variables match what the animation component is wired to feed
      (`ENGINE_RPM_0` vs `Engine_RPM`, etc.)
- [ ] fuel tank + consumption configured on `FuelManagerComponent` /
      `SCR_FuelConsumptionComponent`
- [ ] `HP Max` and `HP Damaged` set on `SCR_VehicleDamageManagerComponent` (the BI wiki misspells this as `SCR_VehicleDamageMangerComponent` — the engine class is correctly spelled **Manager**, verified against the engine class index;
      the class name is spelled "Manger" in the game code)
- [ ] a **variant** has its own `FactionAffiliationComponent.Faction`
- [ ] the prefab has a 16-hex root `ID` if anything can place it
- [ ] `wb_play` — it drives, seats a player, and takes damage
- [ ] it spawns **as a client**, not just on the server (this is where the
      missing-root-`ID` kick shows up)

## Related

- `wb_knowledge "vehicle modding"` — component roles and object properties
- `wb_knowledge "vehicle animation"` — `.agr` variable and command reference
- `wb_playbook "add-a-prefab"` — GUID/override/duplicate semantics, root `ID`
- `wb_playbook "author-an-animation-graph"` — AGF vs baked-clip track choice
- `wb_playbook "replicate-state-to-clients"` — server-authoritative state
- `wb_playbook "react-to-damage"` — hit zones, fire, destruction callbacks
