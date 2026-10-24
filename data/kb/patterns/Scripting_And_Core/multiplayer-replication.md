# Multiplayer & Replication

---

## Server Guard — Use RplComponent, Not IsMaster

`SCR_BaseGameMode.IsMaster()` can return false in some host configurations.
The reliable pattern used across base game scripts:
```c
RplComponent rpl = RplComponent.Cast(owner.FindComponent(RplComponent));
if (rpl && rpl.IsProxy())
    return; // only runs on server/host
```

Proxy optimisation — cache in `EOnInit` and clear FRAME mask on proxies:
```c
protected bool m_bIsProxy;

override protected void EOnInit(IEntity owner)
{
    RplComponent rpl = RplComponent.Cast(owner.FindComponent(RplComponent));
    m_bIsProxy = rpl && rpl.IsProxy();
    if (m_bIsProxy)
        ClearEventMask(owner, EntityEvent.FRAME);
}
```

---

## Rpc() on components

`Rpc()` is declared on `GenericComponent` and so on every `ScriptComponent`:
`proto void Rpc(func method, void p0 = NULL, ... void p7 = NULL)` — at most **8 arguments**.
16 vanilla `ScriptComponent` subclasses call it (e.g. `SCR_PlacingEditorComponent`,
`SCR_CampaignNetworkComponent`, `SCR_EditableGroupComponent`). Older notes that said it
"fails silently on a ScriptComponent" were wrong (checked against the API index and the
vanilla scripts, 2026-10-11).

When a component RPC seems to do nothing, check: the owning entity has an `RplComponent`
(BI wiki: an entity to be replicated should always have one); the method carries
`[RplRpc(...)]`; and the target exists on the receiving machine (a proxy that is not
streamed in receives nothing — see *Additional MP Pitfalls*).

---

## Angular Velocity Does NOT Replicate on Dedicated Server

`Physics.SetAngularVelocity()` is server-side only. With `RplComponent "Rpl State Override" Runtime`,
position and linear velocity replicate to clients but **angular velocity does not**.

- Calling `SetAngularVelocity` in `EOnFrame` on the server produces tumble locally but clients see none.
- `RplProp` + `Replication.BumpMe()` can replicate a float value, but the client still needs to call
  `SetAngularVelocity` locally — this requires `EOnFrame` on the client too, which is fragile.
- `SetWorldTransform` for rotation fights the physics position and causes drift/crashes.

**Solution for visual-only rotation (e.g. tumbling projectile):** Use `ProcAnimComponent` or
`BaseItemAnimationComponent` with an animation graph — runs client-side, no replication needed.

---

## Dedicated Server CRC Mismatch / Infinite Loading

If a dedicated server process is left running in the background after script changes, clients get
`reason=2` connection refusal (CRC32 script checksum mismatch). Not a code issue — kill the stale
server process and relaunch.

---

## Particle Effects in Multiplayer

Particles are visual-only and skipped on dedicated servers.
With `RplComponent (Broadcast)` on the entity, `EOnInit` runs on every client automatically.
Spawn the particle locally in `EOnInit` — no RPC needed:
```c
override protected void EOnInit(IEntity owner)
{
    PlayParticle(owner); // runs on server + all clients
    RplComponent rpl = RplComponent.Cast(owner.FindComponent(RplComponent));
    if (rpl && rpl.IsProxy())
        return; // damage/lifetime: server only from here
}
```

---

## Architecture Overview

- Classical server-client: one server, clients do not talk to each other.
- Single-player = listen server. Properly written MP code runs in SP.
- No distributed servers, no Headless Client.

### Entity Roles
- **Authority**: machine where entity was created. Fixed — never transferred.
- **Proxy**: local representation on other machines, receives state updates.
- **Owner**: optional elevated role (one machine at a time). Ownership CAN be transferred by authority.
  - `RpcAsk_` prefix = owner asking authority.
  - `RpcDo_` prefix = authority pushing to proxies/owner.

### Replication States
- **Loadtime**: placed-in-world entities; insertion must be deterministic. Mismatch = `JIP_ERROR` + client disconnect.
- **Runtime**: created during session by server only. Require a prefab.
- **Local Runtime**: created on client only; no proxy. Used for client-side predicted effects.
- **Rpl State Override** on `RplComponent`: `None` (inherit) or `Runtime`. Child entity must be attached during spawning to inherit parent's override.

---

## RPC Calls

```c
Rpc(Rpc_MyMethod, param1, param2);
```

- Available on `GenericEntity` and `GenericComponent` (so on every `ScriptComponent`); at most 8 arguments.
- RPC order between two machines is guaranteed; RPCs are queued.
- **Never call RPC from `EOnInit`** — not supported.

```c
[RplRpc(RplChannel.Reliable, RplRcver.Owner)]
protected void Rpc_MyMethod(int value) { }
```

| Channel | Notes |
|---|---|
| `Reliable` | Guaranteed delivery, more expensive |
| `Unreliable` | May be lost — use for frequent position updates |

| Receiver | Notes |
|---|---|
| `Server` | Authority only |
| `Owner` | Owner machine only |
| `Broadcast` | All proxies (not authority). Only reaches machines that have the proxy streamed. |

`RplCondition`: `None`, `OwnerOnly`, `NoOwner`, `Custom` (named bool method).

---

## RplProp (Replicated Properties)

```c
[RplProp(onRplName: "OnBroadcastValueUpdated")]
protected int m_iBroadcastValue;

// After changing value on authority:
Replication.BumpMe();
```

- `onRplName` callback fires on **proxies only** (not authority), including JIP/streaming.
- Only machines with the proxy streamed receive the update.

---

## Replication Key Methods

- `Replication.FindId(entity)` — returns `RplId`. **Cache the result** — expensive in tight loops.
- `Replication.FindItem(id)` — returns entity or null.
- `Replication.FindOwner(entity)` — returns owner machine's network id.
- `Replication.BumpMe()` — signals at least one `RplProp` changed; required after every authority-side property mutation.

---

## RplSave / RplLoad

Custom sync data for initial replication:
```c
void RplSave(ScriptBitWriter writer)
{
    writer.Write(m_iValue, 7);  // use fewer bits than type when range allows
    writer.WriteBool(m_bFlag);
    writer.WriteString(m_sName);
}

void RplLoad(ScriptBitReader reader)
{
    reader.Read(m_iValue, 7);   // order MUST match RplSave exactly
    reader.ReadBool(m_bFlag);
    reader.ReadString(m_sName);
}
```

- Read order must match write order. Wrong bit count = undefined behaviour.
- `RplLoad` is called after full hierarchy load, before `EOnFrame`.

---

## Components NOT Instantiated on Dedicated Server

`BaseFlattenGrassComponent`, `CameraHandlerComponent`, `DebugShootComponent`, `MotorExhaustEffectComponent`, `BaseSoundComponent`.

---

## Additional MP Pitfalls

- Entity created on a client = unknown to server, no replication possible.
- `Broadcast` RPC silently lost if proxy not streamed on that machine.
- `onRplName` is NOT called on the authority.
- Setting `RplProp` directly on a proxy causes state discrepancy until next authority broadcast.
- Child entity spawned before attaching to parent loses Rpl State Override inheritance.
- Streaming out while authority exists = undefined behaviour.
- `crossPlatform` server config param broken — use `supportedPlatforms` with explicit platform entries instead.

---

## Field notes (Bifrost addon, game 1.8, Sept–Oct 2026)

Observed in an owned off-screen listen-server instance unless marked; **(unverified)** marks inferences or source reads never exercised.

- **Inventory storages replicate item IDs, not entities, by default.** A storage component
  inheriting `UseVirtualInventoryReplication = 1` gives remote clients no item entities, so
  display code that resolves a replicated item ID to an entity fails only on remote clients.
  Set `UseVirtualInventoryReplication 0` on storages whose items clients must see.
- **Validate every client-supplied value on the server**: whitelist the verbs each caller may
  send, reject NaN/inf/out-of-range floats, cap string and selection lengths, and bound JSON
  nesting depth and item/attachment counts (player-editable kit JSON with a count of
  1,000,000 looped a million spawns).
- **A reliable owner RPC does not make its target exist on the receiver.** An RPC carrying an
  `RplId` whose entity is not streamed in on the client was silently discarded. Carry durable
  state in `RplProp` / `RplSave`-`RplLoad` so it recovers when the target streams in.
- **Scale does not replicate.** `IEntity.SetScale` is not networked, and
  `SCR_EditableEntityComponent.SetTransformBroadcast` restores each peer's existing scale after
  applying the transform, so it cannot fix a scale mismatch. Replicate scale yourself
  (`RplProp` with `onRplName`, plus `RplSave`/`RplLoad` for JIP).
- **Per-shot broadcast RPCs are expensive**: two broadcasts per round at 1,200 rpm is up to 160
  RPCs/s to every client. Merge cues into one unreliable RPC.
- Proxies must still join client-side registries (triggers, emitters); returning early on
  proxies hid objects from remote and JIP Game Masters **(unverified on a remote client)**.
- Whether a parent/child hierarchy relation reaches remote clients and late joiners the same
  way as on the host is **unverified**.
- Client-side "entity creation failure" lines after GM placement matched successful server
  spawns; native completion retries unresolved replica IDs, so late replicas read as failures
  **(unverified)**.
