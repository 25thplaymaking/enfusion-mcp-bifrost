---
id: replicate-state-to-clients
title: Replicate state to clients
goal: State that reaches every client, with the right authority guard and the right replication mechanism.
humanStep: false
tools: [api_search, component_search, project, wb_reload, wb_compile_status, wb_debug]
triggers:
  - replicate
  - replication
  - sync to clients
  - multiplayer state
  - network sync
  - rplprop
  - rpc
  - jip
  - dedicated server
  - clients dont see my change
  - state not syncing
seeAlso: [write-an-enforcescript-component, live-workbench-session]
---

# Replicate state to clients

**Goal:** state that actually reaches every client — and an honest statement of
which evidence level you have reached.

## The evidence ladder

These are **separate claims**, not one. `docs/NATIVE_AGENT_WORKFLOW.md` is
explicit: "Source parsing, a successful module compile, a runtime breakpoint
session, and multiplayer/JIP testing are **separate evidence**." Widened for
replication work, track at least:

1. source compiles
2. native `ValidateScripts` passes
3. physical single-client runtime
4. **dedicated-server** runtime
5. remote client
6. **JIP** (a client that joins *after* the state was set)
7. save/restart persistence

A clean compile proves only (1). Say which one you have reached, and never
describe a lower tier in the words of a higher one.

## Steps

1. **Guard for authority with `RplComponent`, not `IsMaster`.**

   ```c
   RplComponent rpl = RplComponent.Cast(owner.FindComponent(RplComponent));
   if (rpl && rpl.IsProxy())
       return; // only runs on server/host
   ```

   `SCR_BaseGameMode.IsMaster()` can return **false in some host configurations**.

2. **Choose the mechanism.**

   | Need | Mechanism |
   |---|---|
   | persistent state, late joiners | `RplProp` + `RplSave`/`RplLoad` |
   | one-off event ("I just fired") | `Rpc` / broadcast RPC |
   | per-frame transform | a replication component |

3. **For `RplProp`, bump it.** A changed `RplProp` needs `Replication.BumpMe()`
   or clients never see the change.

4. **For an RPC, check the prerequisites.** `Rpc()` exists on `GenericEntity`
   and `GenericComponent` (so on every `ScriptComponent`) and takes at most 8
   arguments. The owning entity needs an `RplComponent`, the method needs
   `[RplRpc(...)]`, and the receiver must exist on the target machine.

5. **Compile and check.**

   ```
   wb_reload {"target":"scripts"}
   wb_compile_status
   wb_debug {"action":"diagnostics","log":"script.log"}
   ```

## Traps

- **An RPC to an entity that is not streamed in on the receiver is dropped silently.**
  A reliable owner RPC does not make its target exist there; carry durable state in an
  `RplProp` / `RplSave`-`RplLoad` so it recovers when the target streams in.
- **Older KB text said `Rpc()` fails silently on a `ScriptComponent` — it does not.**
  16 vanilla `ScriptComponent` subclasses call it.
- **Static methods cannot call instance `Rpc`/`Replication.BumpMe()`.** Route
  through an instance method (`Publish()`) that owns the call.
- **Adding `RplProp`/`RplRpc` to a *modded vanilla* class is an unproven delivery
  path** — never confirmed working, and it is where a real scale bug lived. An
  own-class replication component that owns the whole layout is the reliable route.
- **Angular velocity does not replicate on a dedicated server.** Position and
  linear velocity do; angular velocity does not. For visual-only tumble, use
  `ProcAnimComponent`/`BaseItemAnimationComponent` with an animation graph rather
  than fighting replication.
- **`SetWorldTransform` for rotation fights the physics position** and causes
  drift or crashes.
- **A stale dedicated server left running after a script change gives clients
  `reason=2`** (CRC32 script checksum mismatch) and an infinite load screen. That
  is a stale process, not a code bug — kill and relaunch.
- **Optimise proxies deliberately:** cache `IsProxy()` in `EOnInit` and
  `ClearEventMask(owner, EntityEvent.FRAME)` on proxies.

## Verify

- [ ] compiles and `ValidateScripts` is clean *(levels 1–2)*
- [ ] observed working in a local single-client session *(level 3)*
- [ ] observed on a **dedicated** server with a remote client *(levels 4–5)*
- [ ] verified for a player who joins **after** the state was set *(level 6)*
- [ ] state named explicitly for which levels remain unproven

## Related

- `wb_knowledge "multiplayer replication"` — the full pattern set
- Playbook `write-an-enforcescript-component` — the component itself
