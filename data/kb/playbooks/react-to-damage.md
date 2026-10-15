---
id: react-to-damage
title: React to damage (hit zones, damage managers)
goal: Damage that lands on the right hit zone, calls the right callbacks, and uses APIs that exist on the component you actually have.
humanStep: false
tools: [component_search, api_search, write_file_tool, project, wb_reload, wb_compile_status, wb_play]
triggers:
  - damage
  - hit zone
  - take damage
  - health
  - bleeding
  - damage over time
  - react to damage
  - damage callback
  - on damage
  - invulnerable
seeAlso: [write-an-enforcescript-component, replicate-state-to-clients]
---

# React to damage (hit zones, damage managers)

**Goal:** damage lands on the right hit zone, fires the right callback, and uses
methods that exist on the component you actually have.

## Pick the component FIRST

```
HitZoneContainerComponent
DamageManagerComponent                       (engine-side)
  SCR_DamageManagerComponent                 (script-side)
ExtendedDamageManagerComponent               (engine-side)
  SCR_ExtendedDamageManagerComponent         (script-side)
    SCR_CharacterDamageManagerComponent      (script-side)
```

Call the **replacement** API. On `ExtendedDamageManagerComponent` these methods
**do not exist**:

| Old (`DamageManagerComponent`) | Replacement |
|---|---|
| `OnDamageOverTimeAdded()` | `OnDamageEffectAdded()` |
| `OnDamageOverTimeRemoved()` | `OnDamageEffectRemoved()` |
| `IsDamagedOverTime()` | `SCR_CharacterDamageManagerComponent.IsBleeding()` |
| `GetDamageOverTime()` | `SCR_RegeneratingHitZone.GetHitZoneDamageOverTime()` or `SCR_CharacterBloodHitZone.GetTotalBleedingAmount()` |

Persistent effects: `GetPersistentEffects()`,
`GetAllPersistentEffectsOnHitZone()`, `GetAllPersistentEffectsOfType()`.

## The damage flow

1. Damage received.
2. `DamageManagerComponent` checks: damage handling enabled, not hijacked, valid
   hit, entity alive.
3. Damage goes to the **hit zone**, which calculates effective damage.
4. It replicates over the network — **clients calculate locally** and display
   effects.
5. `OnDamage()` → propagates to parent hit zones → `DamageManager.OnDamage()`.
6. If `DamageState` unchanged → exit.
7. If changed → `OnDamageStateChanged()` on the hit zone, then the manager.

**Step 6 is the one people miss:** `OnDamage()` fires on every hit, but
`OnDamageStateChanged()` only fires when the state actually changes.

## Callbacks

| Callback | When |
|---|---|
| `OnDamage()` | after damage is dealt; propagates up to parent hit zones |
| `OnDamageStateChanged()` | when damage **state** changes — hit zone first, then manager |
| `OnHealthSet()` | when `SetHealth()` is called directly |
| `OnDamageEffectAdded()` | damage-over-time added *(Extended only)* |
| `OnDamageEffectRemoved()` | damage-over-time removed *(Extended only)* |

## Traps

- **The replaced-API methods fail to compile, not at runtime.** Calling
  `OnDamageOverTimeAdded()` on an `ExtendedDamageManagerComponent` is a compile
  error, which is at least loud — but writing the *old* name from muscle memory
  wastes a build cycle.
- **Clients calculate damage locally.** Adding a damage effect that only exists
  on the server produces effects nobody else sees.
- **`OnDamageStateChanged()` is not per-hit.** Wiring all your logic to it and
  expecting it every time leaves you with no handler for repeat damage in the
  same state.
- **Hit zones nest.** `OnDamage()` propagates to **parent** hit zones, so a
  handler on the parent fires as well — double-counting is easy.
- **`OnDamageEffectAdded/Removed` are Extended-only.** On a plain
  `SCR_DamageManagerComponent` they do not exist at all.

## Verify

- [ ] `wb_compile_status` clean — no calls to the replaced methods
- [ ] the damage **state** change is visibly handled in-game
- [ ] effects appear on a **remote** client, not only the authority
- [ ] you checked whether your logic double-fires via parent hit zones

## Related

- `wb_knowledge "damage system"` — full hierarchy and flow
- Playbook `write-an-enforcescript-component` — attaching the component
