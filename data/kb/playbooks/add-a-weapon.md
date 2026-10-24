---
id: add-a-weapon
title: Add a weapon or weapon attachment
goal: A weapon prefab (or attachment prefab) that fires, cocks, reloads, and can be put in someone's hands.
humanStep: false
tools: [prefab, game_duplicate, config_create, component_search, api_search, wb_prefabs, wb_resources, project, wb_reload, wb_play]
triggers:
  - add a weapon
  - new gun
  - weapon attachment
  - scope
  - suppressor
  - magazine
  - weapon mod
  - reskin a weapon
seeAlso: [add-a-prefab, import-a-model-from-blender, write-an-enforcescript-component]
---

# Add a weapon or weapon attachment

**Goal:** a weapon prefab that fires, cocks and reloads, whose magazine and
attachments fit, and that appears in an Entity Catalog so it can be spawned or
placed in a loadout.

**Needs a human click:** two things cannot be done from the MCP layer and must
be done in the Workbench GUI or a text editor:

1. **Component property values.** `prefab` generates component *entries*; the
   property values the KB cares about (`MeshObject.Object`,
   `MuzzleComponent.MagazineWell`, `SightsComponent.BaseSights`, the
   `AttachmentSlotComponent` pivot IDs) are set in the Workbench component
   inspector on the `.et`.
2. **Collimator `.emat` script bindings.** `TCModFuncs` Refs cannot be set in
   the GUI at all — they must be hand-edited into the `.emat` text (see Traps).
   Everything else in this playbook is scriptable.

## Before you start

| Precondition | How to check | If it fails |
|---|---|---|
| Enfusion Workbench is running and the MCP plugin is connected | `wb_state` | Reconnect Workbench before any `wb_*` call |
| Addon root / project path is known | `project {"action":"browse"}` | Set the project root in server config |
| Model exists as a `.xob` | `wb_prefabs {"action":"locate","searchPath":"<addon root>"}` or `api_search` for model paths | See `import-a-model-from-blender` |
| A base weapon prefab to inherit from exists | `prefab {"action":"inspect","path":"Prefabs/Weapons/Core/Rifle_Base.et"}` | Use `game_duplicate` on a vanilla weapon to see a complete working shape |

## Which shape are you building?

| You want | `prefabType` | `variant` | Recipe default parent |
|---|---|---|---|
| A rifle / DMR | `firearm` | `rifle` | `Prefabs/Weapons/Core/Rifle_Base.et` |
| A pistol / revolver | `firearm` | `handgun` | `Prefabs/Weapons/Core/Handgun_Base.et` |
| A machine gun | `firearm` | `machinegun` | `Prefabs/Weapons/Core/MachineGun_Base.et` |
| A launcher | `firearm` | `launcher` | `Prefabs/Weapons/Core/Launcher_Base.et` |
| A suppressor | `attachment` | `suppressor` | `Prefabs/Weapons/Core/Suppressor_Base.et` |
| A scope / optic | `attachment` | `optic` | `Prefabs/Weapons/Core/WeaponSight_Base.et` |
| A flash hider / brake | `attachment` | `muzzle_device` | `Prefabs/Weapons/Core/MuzzleDevice_Base.et` |

Variants and parents come from `data/recipes/firearm.json` and
`data/recipes/attachment.json`.

## Steps

1. **Inspect the base first** so you know what you inherit. This merges the whole
   ancestor chain and tells you which file each component comes from:

   ```
   prefab {"action":"inspect","path":"Prefabs/Weapons/Core/Rifle_Base.et"}
   ```

2. **Create the weapon prefab** with the matching `prefabType` and `variant`.
   `parentPrefab` resolves the ancestor chain and pre-populates inherited
   components as GUID-matched override slots:

   ```
   prefab {"action":"create","name":"MyRifle","prefabType":"firearm","variant":"rifle","parentPrefab":"Prefabs/Weapons/Core/Rifle_Base.et","description":"My rifle"}
   ```

   To bake everything into a standalone prefab with no parent reference,
   duplicate the vanilla weapon instead:

   ```
   game_duplicate {"sourcePath":"{GUID}Prefabs/Weapons/....et","destPath":"Prefabs/Weapons/Rifles/MyRifle.et","flatten":true,"register":true}
   ```

   **Weapons MUST inherit from a base game weapon prefab or they will not
   function.** This is called out in `data/patterns/weapon-reskin.json` and is
   the single most common cause of a dead weapon.

3. **Verify the component stack survived creation.** The KB's required stack for
   a weapon prefab is `MeshObject`, `RigidBody`, `Hierarchy`,
   `SignalsManagerComponent`, `RplComponent`, `ActionsManagerComponent`,
   `WeaponSoundComponent`, `SCR_WeaponStatsManagerComponent`,
   `SCR_WeaponAttachmentsStorageComponent`:

   ```
   prefab {"action":"inspect","path":"Prefabs/Weapons/Rifles/MyRifle.et"}
   ```

   Anything missing from that list is a finding — add it as a component override
   or fix the parent.

4. **Find the components you need before writing script against them.** The KB
   names `WeaponAnimationComponent`, `MuzzleComponent`, `SightsComponent`,
   `AttachmentSlotComponent`, `SCR_WeaponStatsManagerComponent`,
   `SCR_2DPIPSightsComponent`, `SCR_CollimatorSightsComponent` — verify each
   exists and check the methods before calling any of them:

   ```
   component_search {"query":"WeaponAnimation","category":"weapon","limit":20}
   api_search {"query":"SCR_WeaponStatsManagerComponent","type":"class","format":"tree"}
   api_search {"query":"MuzzleComponent","type":"property"}
   ```

   Enfusion API method names are non-standard and many obvious-sounding methods
   do not exist. `api_search` every method before you call it.

5. **Set the properties that make it a weapon** (Workbench inspector on the
   `.et`, or `project action=edit` on the file):

   - `MeshObject.Object` → your `.xob` path. **An empty `Object` makes the entity
     invisible in-game** — it does not error.
   - `RigidBody` → **Layer Preset empty, enable Model Geometry.**
   - `WeaponSoundComponent.Filenames` → `.acp` sound config. For suppressor sound
     switching, list **both** the normal and the suppressed `.acp`.
   - `MuzzleComponent.MagazineWell` → the magazine class. **This class determines
     magazine compatibility** — a wrong value means no magazine will ever fit.
   - `MuzzleComponent.MagazineTemplate` / `MagazinePosition` (pivot
     `slot_magazine`, snap `snap_weapon`).
   - Fire modes: `FireModes` array, default Safe + Single at 500 RPM per the
     firearm recipe; `MaxBurst`, `MaxSalvo`, `RoundsPerMinute`,
     `BurstType` (`Uninterruptable` / `Interruptable` / `InterruptableAndReseting`).
   - `SightsComponent.BaseSights` → ADS camera PointInfo, usually the `eye` pivot.

6. **Add the bones and slot points the model must have.** These are naming
   contracts, not preferences:

   | Name | Used by |
   |---|---|
   | `slot_magazine` | `MuzzleComponent` |
   | `slot_optics` | `AttachmentSlotComponent` (dovetail/non-rail) |
   | `slot_barrel_muzzle` | `AttachmentSlotComponent` (suppressor/compensator) |
   | `slot_underbarrel`, `slot_bayonet`, `slot_flashlight` | `AttachmentSlotComponent` |
   | `snap_weapon` | on **every** attachment; aligns to the parent's `slot_*`. Absent → scene root is used |
   | `eye` | ADS camera (`SightsComponent`) |
   | `barrel_chamber`, `barrel_muzzle` | bullet origin / firing direction |
   | `w_bolt`, `w_trigger`, `w_mag_release`, `w_ch_handle`, `w_fire_mode`, `w_safety`, `w_slide`, `w_bipodleg*` | animation bones |

7. **For attachments, do the attachment side**, per the KB's suppressor workflow
   (`Prefabs/Weapons/Core/Suppressor_base.et` as the model):

   ```
   prefab {"action":"create","name":"MySuppressor","prefabType":"attachment","variant":"suppressor","parentPrefab":"Prefabs/Weapons/Core/Suppressor_Base.et"}
   ```

   - Add `_base` suffix for a base prefab; create a child prefab inheriting it
     for variants and reskins.
   - `MeshObject.Object` set; `RigidBody` → enable **Model Geometry**.
   - Collider: layer `ItemFireView`, game material `weapon_metal.gamemat`.
   - `snap_weapon` empty at the attachment origin, aligned with forward axis.
   - `InventoryItemComponent > Custom Attributes > SCR_WeaponAttachmentSuppressorAttributes`:
     set `Attachment Type` to your custom muzzle class, then velocity,
     dispersion, obstruction length and recoil factors. Typical sound reduction
     0.7–0.9 multiplier, ~0.3–0.5 kg (attachment recipe).
   - `WeaponAttachmentComponent.m_SlotType` must match the weapon's slot —
     `muzzle`, `sight`/`scope`, etc.
   - `SCR_MuzzleEffectComponent`: assign e.g. `Suppressor_Carbine.ptc`, `Effect
     Position` = `EntitySlotInfo` at the suppressor muzzle end, disable
     `Reset On Fire` for continuous barrel smoke.
   - `SCR_WeaponAttachmentObstructionAttributes`: incompatible / required
     attachment types (already on `Suppressor_base.et`).

8. **On the weapon, add the matching slot:**

   ```
   component_search {"query":"AttachmentSlotComponent","category":"weapon"}
   ```

   Add `AttachmentSlotComponent` as a child of `MuzzleComponent` (muzzle
   attachments) or `WeaponComponent` (accessories): `Pivot ID = slot_barrel_muzzle`,
   `Child Pivot ID = snap_weapon`, set `Attachment Type`, enable
   `Show in Inspection`. Add `SCR_WeaponStatsManagerComponent` to the weapon or
   the attachment cannot modify any stat.

   Rail compatibility for optics is a class hierarchy, not a flag: a slot
   accepting `AttachmentOpticsRIS1913Medium` also accepts `Short` and `VeryShort`;
   a `VeryShort` slot only accepts `VeryShort`. Long class wants a ≥250 mm rail;
   `Medium`/`Short` ≤120 mm; `VeryShort` ≤80 mm.

9. **For a scope / PIP optic**, inherit `WeaponOptic_Base.et` and use
   `SCR_2DPIPSightsComponent`. Required mesh empties: `optic_rear` (center of
   ocular), `optic_front` (front glass), `eye` (few cm behind ocular),
   `eye_ironsight` if backup irons exist. **All three sight axis points must lie on
   a single aligned axis.** Materials: PIP surface mesh slot `Optic_pip` →
   duplicated `Optic_PSO1_PIPMaterial.emat`; glass lens `Optic_lensglass` →
   duplicated `Optic_ARTII_Lensglass.emat`. Enable `Export hierarchy` in Import
   Settings or the empties do not export.

10. **Register the resource** so the engine picks up the new GUID:

    ```
    wb_resources {"action":"register","path":"<addon root>/Prefabs/Weapons/Rifles/MyRifle.et","buildRuntime":true}
    wb_prefabs {"action":"getGuid","templatePath":"<addon root>/Prefabs/Weapons/Rifles/MyRifle.et"}
    ```

    `game_duplicate` and `wb_prefabs createTemplate` already register; if you
    hand-wrote the file, register it here.

11. **Make it reachable — Entity Catalog / Game Master.** Attachments must be
    catalogued as `Item Type = WEAPON_ATTACHMENT`, `Item Mode = ATTACHMENT`:

    ```
    config_create {"configType":"entity-catalog","name":"MyWeapons","categoryName":"Weapons","prefabRefs":["{GUID}Prefabs/Weapons/Rifles/MyRifle.et","{GUID}Prefabs/Weapons/Attachments/MySuppressor.et"]}
    ```

    Without the catalog entry the prefab exists but nothing can spawn or equip it.

12. **Test in a live session.** Scripts compile before play, so a compile error
    shows up here rather than at load:

    ```
    wb_reload {"target":"scripts"}
    wb_play {"debugMode":true}
    ```

    Or, without Workbench, follow `live-workbench-session`.

## Traps

Silent failures first — none of these throw an error, they just produce a
weapon that does not work.

- **`Hierarchy` missing → `RplComponent` fails.** The KB lists `Hierarchy` as
  *required by RplComponent*. No replication, no held weapon.
- **`RigidBody` Model Geometry not enabled.** The mesh has no collision volume:
  no obstruction, no interaction, silent no-op. Layer Preset must be empty.
- **`MuzzleComponent.MagazineWell` class wrong.** It *determines* magazine
  compatibility. Mismatched class = the magazine never seats, regardless of how
  correct `MagazineTemplate` looks.
- **`MeshObject.Object` empty.** Entity is invisible in-game. `prefab` generates
  the recipe's empty placeholder — it never picks a model for you.
- **Missing `snap_weapon` on an attachment.** Falls back to the scene root, so
  the attachment snaps to the wrong place with no warning.
- **`WeaponAnimationComponent` is not present on `Rifle_Base.et` by default** —
  it must be added manually. Without it there is no bolt cycle, no trigger
  animation, no `TriggerPulled` / `Cocked` / `State` variables.
- **Attachment stats silently do nothing without
  `SCR_WeaponStatsManagerComponent` on the weapon.**
- **`ItemAttributeCollection` only finds the *first* matching attribute**, so
  only one attribute subclass ever applies per attachment. A custom subclass
  must implement `bool ApplyModifiers(...)` and `void ClearModifiers(...)`.
- **A muzzle-effect override stays registered until explicitly cleared.** Call
  `ClearMuzzleEffectOverride(...)` on detach or the effect persists.
- **Obstruction uses only the main `MeshObject` bounding box.** Modular weapons
  with stock/barrel attachments need a manual `Obstruction Test BB Scale`
  adjustment. If `Can Go to Full Obstruction` is false the weapon clips through
  walls but can still fire — that is expected behaviour, not a bug.
- **Collimator (red dot) `.emat` script bindings.** `TCModFuncs` Refs cannot be
  set in the Workbench GUI — edit the `.emat` in a text editor. Then:
  - `TCModShift` **inner Refs are lost on any Workbench save** — re-add manually
    every time.
  - Refs stop working after **any** material change in Workbench — a **full
    Workbench restart** is required.
  - The collimator only works in-game, **NOT in the World Editor**. Not a
    failure.
  - Flipped UV on the projection plane → wrong sight movement. Check UVs first.
  - Inheriting from `WeaponOptic_Base.et` for a collimator is wrong: it pulls in
    `SCR_2DPIPSightsComponent`. Duplicate it and remove that component, or start
    from `Attachment_Base.et`. A collimator needs
    `SCR_CollimatorSightsComponent` (parent) + `SCR_CollimatorControllerComponent`
    (child).
- **Unlocalised attachments** show the raw token `#AR-UserAction_Dettach` in
  the detach action. Localise `Item Display Name`.
- **Animation `.agr` duplication:** after `File → Duplicate Workspace`, the
  `AnimSetTemplate` GUID still points at the old template — edit the `.agr` in a
  text editor. `Anim Injection` Binding Name must be exactly `"Weapon"`.
- **Blender:** do **not** use Force Connect Children or Automatic Bone
  Orientation on the Reforger skeleton; enable Net API in Workbench Options
  before any TXA export.
- **API names.** Verify every method with `api_search` before writing
  `SCR_WeaponStatsManagerComponent` / `SCR_CollimatorSightsComponent` code.

## Verify

- [ ] `prefab inspect` shows the full required component stack, with `Hierarchy`
      present alongside `RplComponent`
- [ ] `RigidBody` has Model Geometry enabled and an empty Layer Preset
- [ ] `MeshObject.Object` points at a real `.xob`
- [ ] `MuzzleComponent.MagazineWell` matches the magazine prefab you actually
      use; magazine seats and ejects in game
- [ ] `slot_*` points and `snap_weapon` exist in the model, on one axis
- [ ] `WeaponSoundComponent.Filenames` lists the `.acp` files (both variants if
      it must switch to `SOUND_SUPPRESSED_SHOT`)
- [ ] attachment: `m_SlotType` matches the weapon's `AttachmentSlotComponent`
      `Attachment Type`, and the weapon has `SCR_WeaponStatsManagerComponent`
- [ ] attachment: stats actually change when attached/detached
- [ ] `wb_prefabs getGuid` returns a GUID for the new prefab
- [ ] the prefab is in an Entity Catalog and appears in Game Master
- [ ] `wb_play` starts, the weapon is equippable, and it fires, cocks, reloads,
      and switches to the attachment in a live test

## Related

- `wb_knowledge "weapon components"` — required component stack and properties
- `wb_knowledge "weapon attachments"` — slot/bone naming, stat modifiers
- `wb_knowledge "weapon animation"` — `.aw` / `.agr` / `.asi` workflow
- `add-a-prefab` — GUID, override and root-`ID` semantics
- `import-a-model-from-blender` — getting the `.xob` and its named bones in