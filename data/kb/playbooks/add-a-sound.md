---
id: add-a-sound
title: Add or change a sound (.acp)
goal: A sound that plays at the right moment, at the right volume, from the right component — and that is audible in-game rather than silent.
humanStep: true
tools: [editor_asset, component_search, api_search, wb_resources, project, wb_reload, wb_play, wb_debug]
triggers:
  - add a sound
  - footsteps
  - footstep sounds
  - weapon sound
  - gunshot audio
  - change a sound
  - audio system
  - acp file
  - sound event
  - vehicle engine sound
  - sound is silent
  - audio not playing
seeAlso: [live-workbench-session, create-a-model-in-workbench]
---

# Add or change a sound (`.acp`)

**Goal:** a sound that actually plays, at the right volume, from the right component.

**Needs a human click** to author in the Audio Editor node graph.

## The one thing that makes sounds silent

> **Sound Event Names are strings, and the name in the `.acp` must EXACTLY match
> what is called from code or script.**

A mismatch produces **silence, not an error**. Same for the Signal Input node name
versus the game signal name. This is the first thing to check when a sound does
not play.

## The pipeline

- Entities with `SoundComponent`s play sounds defined in **`.acp`** files (Audio
  Config Project), authored in the Audio Editor node graph.
- **Signals** (named floats) flow from game state into the audio graph to
  modulate parameters in real time.
- **One-shots** go through `SCR_SoundManagerEntity` — no SoundComponent needed.
  **Loops always require a SoundComponent.**

## Pick the most specific component

```
BaseSoundComponent            (minimal)
  SimpleSoundComponent
    SoundComponent            (reads signals, animation events)
      WeaponSoundComponent
      CharacterSoundComponent
      VehicleSoundComponent
      CommunicationSoundComponent
```

Use the most specific one available — `SCR_SuperMenuBase`-style shortcuts do not
exist here, and a generic `SoundComponent` on a vehicle misses the engine signals.

## Key signals by component

| Component | Signals it exposes |
|---|---|
| Character | Speed, Stance, Surface, MovementSpeed, WeaponStance |
| Vehicle | RPM, Wheels, Damage |
| Weapon | Suppressor, TimeSinceAutoSeq, IsADS |
| Global | GInterior, GCurrVehicleCoverage, EnvironmentType |
| Helicopter | ~25 dedicated signals |

**Surface** is what drives footsteps — it is how the engine knows whether the
character is on grass, metal, wood or water. That is why changing a footstep sound
means touching the Character signal path, not just the Sound node.

## Driving audio from script

Audio Variables are `.conf` files. From EnforceScript:

```c
AudioSystem.SetVariableByName("MyVar", value);
AudioSystem.SetVariableByID(id, value);
```

Bus, Sound and Amplitude nodes can feed a variable; the **Variable** node reads it
back through a curve.

## Traps

- **A name mismatch is silent.** Sound event name, or Signal Input node name vs
  the real signal — no error, just no sound.
- **`.wav` files: max 1024 per Bank.** The Bank is the sample player and
  references them.
- **`Stream` node ID must be exactly `"Stream"`** — it is the VoN audio source.
- **A loop with no SoundComponent never loops.** One-shots can go via
  `SCR_SoundManagerEntity`; loops cannot.
- **VoN has no offline test.** It needs at least two clients and a real session;
  a local `wb_play` proves nothing about it.
- **Node graph authoring has no API.** `editor_asset` inspects; it does not draw
  an audio graph. Budget a human at the Audio Editor.
- **SndSystem activeness rules** apply — an inactive sound system is not a bug in
  your graph.

## Verify

- [ ] the Sound node name in the `.acp` matches the string called from code
- [ ] any Signal Input node name matches a real game signal for that component
- [ ] the component on the entity is the **most specific** one available
- [ ] `wb_resources rebuild` + `wb_reload` after changing the `.acp`
- [ ] audible in a live `wb_play` session, at a sane distance
- [ ] you can state explicitly if the sound is **VoN**, which is unverified locally

## Related

- `wb_knowledge "audio system"` — full node and DSP reference
- `wb_knowledge "particle editor"` — the other purely-visual system
