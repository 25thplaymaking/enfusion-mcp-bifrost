# AI Orders, Movement, Sight & Skill — Field Behaviour of Vanilla AI

What vanilla Reforger AI actually does when script gives it orders, measured while building
scripted room clearing, garrisons, convoys and air insertion for the Bifrost addon
(game 1.8, Sept–Oct 2026). Unless marked otherwise, each item was observed in an owned
off-screen **listen-server** instance; nothing here was run on a dedicated server or a
remote/JIP client. Items marked **(unverified)** are inferences or source reads that were
never exercised.

---

## Sight and cover: use physics traces, not the navmesh

- **`AIPathfindingComponent.RayTrace` is not line of sight.** It answers "does this line
  stay on the navmesh": `true` = clear over navmesh, `false` = it meets a navmesh edge
  (including holes under furniture). It ignores height — at 1.5 m eye height it returned
  "clear" through farmhouse walls (0 of 30 wall-separated pairs read blocked). Reading
  `true` as "blocked" silently broke five cover/suppression features.
- **For "can the threat see this spot", trace physics on fire geometry.** `TraceMove` with
  `TraceFlags.WORLD | TraceFlags.ENTS | TraceFlags.OCEAN`,
  `TargetLayers = EPhysicsLayerDefs.FireGeometry` (the layer vanilla
  `SCR_AIUpdateTargetSuppressionData` uses for AI visibility), and a filter callback that
  drops characters and their gear. Default layers count a pole fence's walk-blocking box
  as a wall (fake cover); without the character filter a trace from the threat's eye starts
  inside his own body and always reads "blocked". A layer mask of 0 never reports cover.
- **`QueryEntitiesByAABB` returns the terrain entity and map furniture.** An occupancy probe
  meaning "a placed prop" must require `SCR_EditableEntityComponent` on the hit.
- Room IDs from `WorldSubsceneComponent.FindArea` are render-side and reportedly empty on a
  dedicated server — do not use them in server AI **(unverified)**.

## Move orders: what actually happens

| Behaviour | Detail |
|---|---|
| Minimum distance | A Move to a point closer than ~1.5 m completes before the man steps. Send at least 1.6 m. |
| Short stops | A native `SCR_AIMessage_Move` can stop ~3 m short. Re-send if beyond 1.5 m, no more often than every 5 s. |
| After a door order | The AI often steps back ~1 m and parks until the order is re-sent. "Arrived" must mean "stopped within 1.5 m". |
| What a Move becomes | `SCR_AIMoveIndividuallyBehavior` with a 1.0 m arrival radius; the pace in the message is dropped. `MoveIndividually.bt` runs at RUN unless a speed setting limits it, and fails with "Movement to unreachable position!" when the target is unreachable. Vanilla's door reaction uses a 0.3 m radius. |
| Speed | Set team speed with a scenario-origin `SCR_AICharacterMovementSpeedSetting` on the group's settings component (measured 2.3–2.5 m/s). |
| Idle | A man with nothing to do runs `Idle.bt`: after 10 ± 5 s he walks back to formation or into cover — so garrison walk-ins advance in bursts unless orders are re-sent (~every 2.5 s). |
| Group paths | `SCR_AIGroup.GetMovementComponent().GetCurrentPath` is **empty for walking infantry**; the leader agent's path holds the route, start to end, not trimmed as the unit advances. |
| Spawn timing | A group's members register over the first seconds after spawn (one fixture saw 1 of 8 members when its order went out). Wait before counting or ordering. |

## Things vanilla AI will not do

- **Step aside for other AI.** Vanilla avoidance (`SCR_AIDangerReaction_PhysicsContact`)
  reacts only to players; two AI stood touching in a corridor for up to 74 s.
- **Ignore an opening door.** When a leaf starts to swing, every AI within reach of it gets
  its own "step away" move from `SCR_AIDangerReaction_DoorMovement`, replacing the current
  order. Ignoring that reaction for a clearing team cut entries from 16–19 s to 6–7 s.
- **React to `SCR_AIMessage_Retreat` / `SCR_AIMessage_Flee`.** The messages exist, but
  `SCR_AIGoalReaction.c` defines no reaction for them **(unverified, source read)**.
- **Pilot helicopters.** See *Helicopter & Air Scripting*.

## Doors

- Every door swings **one way only**; `SetControlValue(-1)` does not reverse it (checked
  over every building prefab on three maps; the exception was one garage).
- `DoorComponent.GetAngleRange()` is in **radians**. A leaf at normalised state `s` stands at
  the closed direction rotated by `-s * range`; the opening side is `sign(-angleRange)`.
- `DoorComponent` has no `GetOwner()` (only `ScriptComponent` declares it). Collect door
  entities by root parent; use `GetDoorPivotPointWS()` for the hinge.
- **Navmesh drop-out after a door opens:** ~2 s after a door finishes opening, tiles under
  the building can read "loaded but not valid" for ~2 s. A path planned in that window ends
  at a 48 m tile edge and the order stays "running" forever — re-issue once the tile is valid.

## Dormant AI and ticking

- **AI far from every player drop to max LOD and ignore orders** (no current action,
  speed 0): the intermittent "nobody moves for minutes". `PreventMaxLOD` alone does not wake
  them; call `SetLOD(GetMaxLOD() - 1)` first (vanilla `SCR_ResupplyTaskSolver` pattern).
- **`SCR_AIGroupUtilityComponent.EvaluateActivity` stops being called once a group is
  idle** — after `ReleaseWaypointMovement`, or for a fresh group whose leader did not exist
  at the first evaluation. Anything that must keep ticking needs its own call-queue timer.

## Aiming and looking while moving

- With the weapon raised, aim stays where it was and turns only 20–45°/s, so a man sent
  behind himself walks backwards. Lowered (low ready), he faces the way he walks.
- Every `LookAt` restarts the turn — suppress repeats for ~1.5 s. Vanilla move behaviours
  cancel looks (`m_LookAction.Cancel()`). Standing, a man turns to a look order within ~1 s.

## Skill, combat mode and perception levers

- `SCR_AIGroupUtilityComponent.SetCombatMode` / `GetCombatModeActual` is a plain
  **server-only, unreplicated** member.
- `SCR_AICombatComponent.SetHoldFire` and `SetCombatType` are `[Obsolete]` no-ops.
  `EAIThreatState` is computed by the AI and cannot be set.
- Working levers: `SetAISkill`, `ResetAISkill`, `SetPerceptionFactor`, `SetFireRateCoef`,
  `SetGroupFireRateCoef`, `SetExpectedEnemyType`; `AIControlComponent.ActivateAI` /
  `DeactivateAI` / `IsAIActivated` / `GetAIAgent`.
- **Own these levers in one place.** When several features (base settings, morale,
  suppression, night penalty) each wrote `SetAISkill`/`SetFireRateCoef` directly they
  overwrote each other; compute baseline + modifiers in one resolver.
- Group perception cannot be written directly (there is no `SCR_AIPerceptionComponent`);
  `SCR_AIGroupPerception.AddOrUpdateTarget` needs an engine `BaseTarget`.
  `AddOrUpdateGunshot` on a friendly group's perception works for contact reports.
- To make AI react to a script-made danger, broadcast it: `AIWorld.RequestBroadcastDangerEvent`
  with an `EAIDangerEventType` (or a scripted `SCR_AIDangerEvent_UnsafeArea`).

## Navmesh and placed props

- Props spawned at runtime do not carve the navmesh; call
  `SCR_AIWorld.RequestNavmeshRebuild` or AI walk into them.
- Tiles over a tall building's upper air may never report loaded; upper floors of many
  Arland houses have no navmesh stairs link. A fresh instance can take 60–130 s before the
  first surveyed building produces movement (navmesh streaming).

## Vehicles

- **Vanilla AI does drive wheeled vehicles** (1.8 source): the driver is native
  `AICarMovementComponent` (Max Stuck Time 4 s, `MaxReverseTravelDistance 15`,
  `CruiseVehicleSpeedKmh 60`, paths on the `BTRLike` navmesh). A stuck vehicle raises
  `EMoveError.STUCK`, then `SCR_AIProcessFailedMovementResult` sends a high-priority
  `SCR_AIGetOutActivity` (crew dismounts). Script levers: `SetCruiseSpeed` /
  `ResetCruiseSpeed`, `GetOnMoveFailed()`, `CarControllerComponent.SetPersistentHandBrake`;
  there is no reverse call. Group vehicles use `SCR_AIGroupVehicleManager` subgroups.
- `SCR_AILeaveStaticVehicles` makes a group leave any vehicle whose `CanBePiloted()` is
  false (every vanilla helicopter) whenever the tree runs it — including mid-air. Keep a
  cargo group's AI deactivated from boarding until the airframe is settled.

## Bodies and editor waypoints

- A dead `SCR_EditableCharacterComponent` returns `GetFaction() == null`, and
  `SCR_EditableGroupComponent.OnAgentRemoved` re-parents the corpse to root; it stays
  registered in `SCR_EditableEntityCore` until deleted. Dead AI leave their group, so group
  counts hide deaths — track the original member entities.
- `SCR_EditableGroupComponent.OnWaypointRemoved` **deletes** an editable waypoint removed
  from its group. Adding waypoints to a group whose waypoints are cycled recurses in
  `SCR_AIGroup.OnWaypointAdded` — un-cycle first.
- GM-placeable waypoints live in `PrefabsEditable/Auto/AI/Waypoints` (16: ArtillerySupport,
  Defend, DefendSmall, ForcedMove, GetIn, GetInNearest, GetInSelected, GetOut,
  LoadSupplies, Move, Patrol, Scout, SearchAndDestroy, Suppress_Editor, UnloadSupplies,
  Wait). Attack, Follow, Heal, ObservationPost, OpenGate, UserAction, Cycle and others exist
  only under `Prefabs/AI/Waypoints`. `AIWaypoint_ForcedMove` has `m_fPriorityLevel 2000`
  (moves ignoring autonomous behaviour); `AIWaypoint_Loiter_CO` is a defend waypoint, not an
  aircraft loiter.
- An AI whose AI was turned off with `DeactivateAI()` has no hit zones — bullets pass
  through. Keep AI on for damage targets.
