---
id: create-a-particle-effect
title: Create a particle effect (.ptc)
goal: A .ptc that actually shows up — with its LODs, physics prerequisites and billboard mode chosen deliberately.
humanStep: true
tools: [editor_asset, wb_entity_create, wb_resources, project, wb_play, wb_debug]
triggers:
  - particle
  - particle effect
  - ptc
  - emitter
  - vfx
  - smoke effect
  - muzzle flash
  - sparks
  - fire effect
  - looping effect
seeAlso: [create-a-model-in-workbench, live-workbench-session]
---

# Create a particle effect (`.ptc`)

**Goal:** a `.ptc` that is actually visible — with LODs, physics prerequisites
and billboard mode chosen on purpose.

**Needs a human click** to author in the Particle Editor.

## Structure

- A `.ptc` is **one or more emitters**. Place it with the World Editor's
  `ParticleEffect` entity, or spawn it from script.
- **Dedicated servers skip loading most emitters** — they are purely visual, so
  never gate gameplay logic on a particle existing.

## LODs — three fixed levels

The engine picks LOD by distance, resolution and FOV. Default distances at
1080p / 70° vertical FOV:

| LOD | Distance |
|---|---|
| 0 | < 25 m |
| 1 | 25–200 m |
| 2 | > 200 m |

Each emitter has its own min/max LOD slider (`0-1` = active in LOD 0 and 1 only).
**Inactive emitters stop emitting new particles but existing ones still finish
their life** — design the LOD set with that in mind.

Debug in-game: Diag Menu → Scene → Particles → **Show Particle FX LOD**.

## The properties that actually decide the look

| Property | Why it matters |
|---|---|
| `Shape Type` | Box, Point, Sphere, Ellipse |
| `Max Num` | max simultaneous particles — **the main performance lever** |
| `Birth Rate` | particles/sec |
| `Local Transform` | local-space sim **moves with the parent**; world-space leaves particles behind |
| `Billboarding Type` | `Full` (default), `LockedAxis` (trees/fire), `None` (quads) |
| `Center X/Y` | pivot offset — e.g. `0,-1` makes a muzzle flash grow upward |
| `Stretch Multiplier` | > 1 = **streak mode** |
| `Blend Mode` | Normal or **Additive** — Additive is what makes fire/sparks read as light |
| `Alpha To Emissive LV` | `From Alpha Graphs` = cheap; `Per Pixel` = quality |
| `Emissive` | normalised, zero by default — without it the effect looks flat/dead |

## Traps — the invisible-effect list

- **Streak mode requires velocity or gravity.** `Stretch Multiplier` > 1 with
  neither set produces **nothing visible**.
- **`Wind Influence` only works if `Air Resistance` > 0.** Zero air resistance
  silently disables wind.
- **`Restitution` = 0 means no collision** — particles pass straight through.
  `Lifetime Shortening` (after collision) also requires `Restitution` > 0.
- **`Anim FPS = 0` still animates — at 1 FPS.** For a near-static effect use
  `0.001`.
- **`Anim Once` holds the last frame**, so the last frame must be transparent for
  the particle to vanish.
- **`Lifetime by Anim` overrides the other lifetime settings.**
- **The emitter enable/disable checkbox in the Emitters list is preview-only —
  it is not saved to the file.** Use the LOD sliders for real control.
- **`Vel Angle` cannot be combined with Random Angle.**
- **`LockedAxis`/`None` need `Angular Fade Out` set** or you get side-on
  artifacts.
- **Looping from script is not possible: no script-accessible loop flag exists.**
  The emitter's `Repeat` property *is* the loop flag, but it is only settable in
  the Particle Editor at author time. For a runtime loop, store the reference and
  **respawn on a timer**.
- **Per-emitter "master" graphs multiply the per-particle value**
  (`result = particleProperty * emitterMaster`), so a master curve at 0 erases the
  particle entirely.

## Verify

- [ ] the effect is visible in a live `wb_play` session, not just in the editor preview
- [ ] each emitter has a deliberate LOD range
- [ ] streak/wind/collision effects have their prerequisite set
- [ ] `Blend Mode` is Additive for anything that should read as light
- [ ] it is not load-bearing for any gameplay logic

## Related

- `wb_knowledge "particle editor"` — the full property reference
- Playbook `create-a-model-in-workbench` — attaching the effect to a prefab
