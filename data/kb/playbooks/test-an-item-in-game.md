---
id: test-an-item-in-game
title: Test an item in game (the five-step item test)
goal: One item looked at properly, its defect stated and reproduced, and fixed or blocked with a reason, without rerunning suites.
humanStep: false
tools: [wb_validate_scripts, wb_reload, wb_compile_status, wb_play, wb_stop, wb_state, game_read]
triggers:
  - test in game
  - in-game check
  - in game test
  - verify in game
  - look at the item
  - screenshot review
  - acceptance list
  - visual check
  - regression run
  - rerun the tests
  - test fixture
  - clipping
  - z-fighting
  - item review
seeAlso: [import-a-model-from-blender, add-a-prefab, live-workbench-session]
---

# Test an item in game (the five-step item test)

**Goal:** one item, judged by looking at it, ends either fixed (same-angle before and
after images) or open with a concrete blocker. Nothing is "ready" while an item is open.

This is the owner's standing test method (recorded 2026-11-11). It replaced a workflow
in which parallel agents re-ran the same full suites after every change, closed items
on pass counts, and reported "ready" while the owner could still see the defects he
had marked (an elbow through a sleeve, a helmet strobe cover missing). A suite counted
82 of 82 helmets as passing while that strobe cover was invisible.

## The five steps, one item at a time

1. **The item.** Name the exact asset under test: prefab path and variant, and the
   reported defect with the reporter's marked image if there is one.
2. **Multiple angles, aspects and conditions.** Look at it from the angles that matter
   (front, side, rear, top, three-quarter, a close-up aimed at the defect), in the
   aspects it is used in (worn, dropped on the ground, in the arsenal, on and off the
   host item; stand, crouch, prone for wearables) and in the conditions that change how
   it reads (day and dusk lighting, with and without neighbouring items). Open every
   image yourself.
3. **What is wrong, and is it reproducible?** One sentence each: what is wrong and
   where; whether it shows every time and under which angle, stance or condition; the
   cause if known.
4. **Can it be fixed easily, and how?** Name the fix and what it costs. If it is not
   easy, say what the real fix is (often the authentic construction of the real object).
5. **Fix.** Then look again with the **same** angles and conditions as step 2, and put
   before and after side by side, next to the marked image and the source model, in
   one comparison image per item.

## Rules that keep the loop moving

- **Pass counts close nothing.** A suite counts what it can measure; it cannot see a
  missing cover or a seam. An item closes only on the step-5 image pair.
- **No suites between fixes.** One import and one look per fix. A single full
  regression runs once, at the very end, after every item is closed.
- **Check framing before a run counts.** A shot that shows grass, a wall or the wrong
  part is not evidence and is not an attempt. Aim each camera at the part under test
  (a bone or the item's bounds), not at the character's feet plus a fixed height, and
  never crop a fixed region afterwards: the part moves between stances.
- **Reproduce cheaply first.** Pose the model to the failing stance in the source tool
  (or inspect it in Workbench) and reproduce the defect there before spending a game run.
- **Two failed attempts on one item: stop.** Re-read the spec, the references and every
  open request from the owner, write down what both attempts showed, and only try again
  with a new cause demonstrated outside the game.
- **Report the list.** Each item: fixed, with its image pair; or open, with the blocker
  and the next step. Never a pass count as the headline.

## Traps

- **Imports and test runs must not overlap.** A Workbench import that overlapped a
  test game by 12 s made 9 optic checks fail aiming (recorded 2026-11-11); serialise
  them on one machine.
- **A compile pass is not a look.** `wb_validate_scripts` and `wb_compile_status` only
  prove the scripts compile; see `live-workbench-session`.
- **Workbench must be focused** for the live tools, and an unfocused editor reports
  `play mode`; see `live-workbench-session` before chasing `wb_stop`.

## Verify

- [ ] the item is named exactly (prefab path and variant)
- [ ] step 2 images cover every angle, aspect and condition the defect depends on, and
      each was opened
- [ ] the defect statement says whether it reproduces and under what
- [ ] the fix is applied and the step-2 views are re-shot at the same angles
- [ ] one comparison image: marked image, source model, before, after
- [ ] no suite ran between fixes; the one full regression is left for the end

## Related

- Playbook `live-workbench-session`: compile, reload and play-mode traps
- Playbook `import-a-model-from-blender`: what an import does and does not prove
