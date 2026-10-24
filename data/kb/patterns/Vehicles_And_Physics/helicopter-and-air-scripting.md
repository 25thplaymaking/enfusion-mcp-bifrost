# Helicopter & Air Scripting — Flying, Boarding, Parachutes, Falling Characters

Field results from scripting helicopter flight, troop insertion and parachute drops for the
Bifrost addon (game 1.8, Sept–Oct 2026). Observed in an owned off-screen **listen-server**
instance on the UH-1H and Mi-8 only; no dedicated-server, remote-client or JIP run exists for
any of it. Items marked **(unverified)** were never exercised.

---

## What vanilla gives you

- **AI cannot pilot helicopters.** `Helicopter_Base.et` sets
  `SCR_AIVehicleUsageComponent m_bCanBePiloted 0`, so AI skip pilot slots.
  `AIHelicopterMovementComponent` and `AIFlyingMovementComponent` are empty generated stubs;
  `SCR_AIFlyHelicopterBehavior` appears only in a comment. AI can ride cargo and turret seats.
- Vanilla has **no fixed-wing prefabs** and **no personnel or cargo parachute** (only flare
  chutes).
- Every vanilla helicopter carries `NwkHeliMovementComponent`, so airframe motion
  replicates to clients. `HelicopterAutopilotHelperComponent` is `[Obsolete]`.

## Script channels that do and do not move an airframe

- **Written pilot inputs do not reach the airframe.** `CharacterInputContext`
  `SetVehicleCollective` / `CyclicForward` / `CyclicAside` / `AntiTorque` exist, but values
  written from any hook (every frame, the controller's or the pilot's `OnPrepareControls`,
  AI on or off) changed nothing: an untouched UH-1H lifted exactly like one given a full
  collective ramp.
- **Rotor force scale works.** `VehicleHelicopterSimulation.RotorSetForceScaleState(rotor, s)`:
  1.0 ≈ hover thrust on a hovering UH-1H, 1.3 climbs at ~+1 m/s, 0.7 sinks at ~-5 m/s.
  Vanilla damage writes the same scale (`SCR_HelicopterDamageManagerComponent.UpdateVehicleState`
  from engine, gearbox and rotor hit-zone efficiency), so anything driving rotors must
  multiply by that efficiency or it "repairs" a shot-out rotor.
- **Control moments** work as angular-velocity increments on the body
  (`Physics.SetAngularVelocity`). Effective inertia differs per airframe and axis
  (measured: UH-1H pitch 95 000, roll 75 000, yaw 12 500 kg·m²; Mi-8 50 000 / 44 000 /
  14 000).
- **Overwriting velocity fights the rotor model.** Setting `Physics.SetVelocity` /
  `SetAngularVelocity` every server frame ignores weight, rotor RPM, damage, collisions and
  wind, and makes motion depend on server frame rate. (Vanilla's cinematic
  `SCR_HelicopterCinematicFlyComponent` does this, as do public helicopter mods.)
- **Rotor power limit.** Pulling full lift on a heavy airframe (Mi-8) collapsed rotor RPM
  and thrust. Watch `RotorGetRPM(rotor)` against `RotorGetRPMTarget(rotor)` and back off
  lift when RPM droops.
- **Finding the rotors:** `HelicopterControllerComponent.GetSimulation()` (check
  `IsValid()`), loop `RotorCount()`, read `RotorGetAxis(i, axis)`; the near-vertical axis
  (`|y| > 0.7`) is the main rotor, the next one the tail rotor (verified on UH-1H and Mi-8
  only). Turn off the player hover assist with `SetAutohoverEnabled(false)` or it fights a
  scripted hover hold.
- Other available calls: `VehicleHelicopterSimulation.GetAltitudeAGL`, `EngineStart`,
  `EngineStop`, `SetThrottle`; `HelicopterControllerComponent.SetCollectiveMode`,
  `SetPersistentWheelBrake`; `BaseVehicleControllerComponent.ForceStartEngine`.

## Airframe behaviour to expect

- With the engine running and nobody on the pedals a UH-1H yaws ~40°/s.
- On the ground, ground assist holds the airframe down against small lift, and a body on
  level ground goes to physics sleep — keep it awake while lifting off. On some slopes a
  UH-1H lifts by itself.
- **Landing detection:** commanding a sink into the ground reads back as ~0.4 m/s of
  motion on alternate frames, so "still for 0.75 s" never passes. Use the bounding box
  (`bottom = origin.y + bounds.min.y`), stop commanding sink once `bottom - surface < 0.25 m`,
  and count still time while resting.
- 50 ms velocity readbacks flip by a few tenths between physics substeps; measure
  accelerations over windows of at least 0.25 s.
- A thrust-flown helicopter has a hard lift ceiling: speed commands must give way to
  height near rising terrain (a full-lift Mi-8 flew into a slope).
- Useful helpers: water on a landing disc via `ChimeraWorldUtils.TryGetWaterSurfaceSimple`;
  synchronised time for replicated paths via `ChimeraWorld.GetServerTimestamp`.
- **Open question (unverified):** how a remote client draws an airframe the server flies
  with rotor scale plus angular-velocity increments (smooth or stepped corrections).

## Boarding and dismounting

- `SCR_CompartmentAccessComponent.MoveInVehicle` is an owner RPC plus a one-frame slot
  lock — a **request**, not a move. One run seated nobody although every request was
  accepted. Repeat about once a second until aboard; abort if the cabin is still empty.
- `CompartmentAccessComponent`: `GetInVehicle(vehicle, slot, forceTeleport, door, closeDoor, paused)`,
  `GetOutVehicle(EGetOutType, door, closeDoor, paused, isExitTeleport)` (`EGetOutType`:
  `ANIMATED`, `TELEPORT`, `TELEPORT_WITH_OPEN_DOOR`),
  `GetOutVehicle_NoDoor(transform[4], sendIntoRagdoll, paused, isExitTeleport)`,
  `KickFromVehicle(door)`. Owner-safe wrappers on `SCR_CompartmentAccessComponent`:
  `MoveInVehicle`, `AskOwnerToGetOutFromVehicle(...)` (both send `RplRcver.Owner` RPCs, so
  they work on client-owned characters). Vanilla GM Disembark skips players.
- **Rotor contact kills dismounting troops.** `SCR_RotorDamageManagerComponent.OnFilteredContact`
  kills characters touching a spinning rotor, and AI walk round the tail with no notion of
  the blades. Ignore characters while the airframe is landing, unloading or lifting off.
- `SCR_AILeaveStaticVehicles` ejects a cargo group from any non-pilotable vehicle,
  mid-air included (see *AI Orders & Movement*).

## Holding and dropping characters (parachutes)

- **Nothing in script holds a falling character.** The character controller drives the
  fall and re-integrates gravity every frame; `Physics.GetVelocity()` on a falling
  character reads 0. All of these failed: `Physics.SetVelocity`; `BaseGameEntity.Teleport`
  every frame (the controller keeps accumulating fall speed — 3 of 4 jumpers tunnelled
  under the terrain on release); `PhysicsEnableGravity(false)`; `SetSimulationDisabled(true)`
  (documented as ignored in multiplayer); a `CharacterCommandScripted` set while the fall
  command is current; ending the fall with `CharacterCommandFall.Land` from a
  `HandleFalling` override. Per-frame placement also made the landing impact lethal.
- **A hierarchy child is held exactly**: `AddChild` with `EAddChildFlags.AUTO_TRANSFORM`,
  then `SetLocalTransform`, even when the parent moves every frame. Traps:
  1. a touchdown probe starting inside the jumper hits the helicopter he just left —
     exclude the hierarchy (`TraceParam.Exclude`) and start above the body;
  2. `GetOutVehicle_NoDoor` moves the physics body a frame before the entity, so a jumper
     parented in between ends up 3–4 m off and is pulled away;
  3. a character parented while airborne keeps the airborne state, so the default
     `HandleFalling` keeps restarting the fall. Exit onto the ground first, then lift and
     hang in the same frame.
- A character hung while airborne can have its physics go to sleep and then never falls
  after release: call `SetActive(ActiveState.ACTIVE)` on its physics at release.
- Scaling a parent scales its character child — draw a canopy "bloom" as a separate local,
  unreplicated `GenericEntity` (`SetObject(xob)` on each machine) instead.
- `SCR_CharacterDamageManagerComponent.OnHandleFallDamage(EFallDamageType, vector)` can be
  overridden, but guarding it did not make a ~40 m/s free-fall landing survivable (0/4
  alive): it does not cover every lethal path.

## Proposed, not built (unverified)

- Turret operator via `TurretControllerComponent.SetAimingAngles` / `SetFireWeaponWanted`
  (vanilla's cinematic helicopter fires its door gun this way).
- Wheeled operator governing the native AI driver via `AICarMovementComponent.SetCruiseSpeed`
  plus `CarControllerComponent` brakes.
