---
id: write-an-enforcescript-component
title: Write an EnforceScript component
goal: A ScriptComponent that compiles, attaches to an entity, and runs on the lifecycle events you expect.
humanStep: false
tools: [script_create, component_search, api_search, project, wb_projects, wb_reload, wb_compile_status, wb_component]
triggers:
  - write a script
  - new enforcescript class
  - script component
  - add a component to an entity
  - write c code
  - enforcescript
  - script authoring
  - new script file
  - attach a component
seeAlso: [replicate-state-to-clients, live-workbench-session, add-a-prefab]
---

# Write an EnforceScript component

**Goal:** a `ScriptComponent` that compiles, attaches to an entity, and fires the
lifecycle events you expect.

## Before you write

- **Check the base class exists** rather than guessing its name:
  ```
  component_search {"query":"ScriptComponent"}
  api_search {"query":"ScriptComponent"}
  ```
- **Check the method you are calling actually exists**, with its real signature.
  Most "impossible" EnforceScript bugs are a hallucinated method name.
- **Know the mod prefix.** Use the prefix from your `.gproj`; it is capped at 4
  characters.

## Steps

1. **Create the file.** `scriptType` is required and picks the parent:

   ```
   script_create {"className":"MyMod_MyComponent","scriptType":"component","description":"...","projectPath":"<addon root>"}
   ```

   | `scriptType` | Default parent |
   |---|---|
   | `component` | `ScriptComponent` |
   | `gamemode` | `SCR_BaseGameMode` |
   | `action` | `ScriptedUserAction` |
   | `entity` | `GenericEntity` |
   | `manager` | none (static) |
   | `basic` | none |
   | `modded` | **requires** `parentClass` — it cannot be derived |

   - `className` must match `/^[A-Za-z_][A-Za-z0-9_]*$/`.
   - If you omit `methods` but give `parentClass`, it looks the parent up and
     picks up to 8 overridable methods for you.
   - If the file already exists it **returns the code without writing** — that is
     not an error, and it is not proof your edit landed.
   - With no `projectPath` it returns code only and writes nothing.

2. **Write the class pair.** Components are two classes — the *class* (editor-side
   metadata) and the *component* (runtime):

   ```c
   [ComponentEditorProps(category: "MyMod/SubCategory", description: "What it does")]
   class MyMod_MyComponentClass : ScriptComponentClass
   {
   }

   class MyMod_MyComponent : ScriptComponent
   {
       [Attribute("defaultValue", UIWidgets.EditBox, "Description")]
       protected float m_fMyValue;

       override protected void OnPostInit(IEntity owner)
       {
           super.OnPostInit(owner);
           SetEventMask(owner, EntityEvent.FRAME);
       }

       override protected void EOnFrame(IEntity owner, float timeSlice)
       {
           // per-tick work
       }
   }
   ```

3. **Respect the lifecycle order.** This is the single most common source of
   "my code never ran":

   | Hook | When | Use for |
   |---|---|---|
   | `OnPostInit` | component attached, world may not be loaded | init, event masks, deferred work |
   | `EOnInit` | world loaded, entity fully in world | work needing the world |
   | `EOnFrame` | every tick, **only if the mask is set** | per-frame logic |

   **`SetEventMask` is not optional.** Without it, `EOnFrame`/`EOnContact` never
   fire and there is no error — the handler is simply never called.

4. **Write it into the addon and compile.**

   ```
   wb_projects {"action":"list"}
   wb_reload {"target":"scripts"}
   wb_compile_status
   ```

5. **Attach it to an entity and verify it is really running.**

   ```
   wb_component {"action":"list","entityName":"<entity name>"}
   ```

## Traps

- **There is no ternary operator.** `a ? b : c` is a compile error, always.
  Expand to `if/else`.
- **No `f` float suffix.** `1.4f` is a compile error; write `1.4`.
- **No closures.** Lambdas that capture scope do not exist — restructure.
- **`switch` with `default:` does not satisfy return analysis.** Add an explicit
  `return` after the block.
- **`CallLater` from inside `EOnInit` is unreliable** — the callback may be
  silently dropped. Schedule deferred work from `OnPostInit`.
- **`SpawnEntityPrefab` called too early (e.g. straight from `EOnInit`) can
  silently fail.** Delay it with `CallLater` from `OnPostInit`.
- **Initialization goes in `OnPostInit`**, not the constructor.
- **`[BaseContainerProps()]` is required** on classes used as inline array element
  types.
- **Put the `bool` first in `&&`/`||`.** Short-circuit ordering avoids evaluating
  the call.
- **Never use raw `ScriptInvoker`** — always the typed variants.
- **Method casing is exact.** The widget callback is `OnDisable`, *not*
  `OnDisabled`.

## Verify

- [ ] `wb_compile_status` clean, with no new warnings versus before your change
- [ ] the component appears in `wb_component list` on the target entity
- [ ] your init hook demonstrably ran (a log line, a changed value)
- [ ] you can state which evidence level you have: source compile, native
      validation, or actual runtime

## Related

- `wb_knowledge "enforcescript language"` — types, casting, collections, preprocessor
- `wb_knowledge "entity lifecycle"` — the full lifecycle table
- Playbook `replicate-state-to-clients` — getting state to other players
