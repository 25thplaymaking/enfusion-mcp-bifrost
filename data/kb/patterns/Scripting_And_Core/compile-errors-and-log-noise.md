# Compile Errors, Runtime Errors & Log Noise — What They Actually Mean

Field reference built from recorded agent sessions (Bifrost addon, Sept–Oct 2026)
and checked against the shipped API index, the BI wiki and the vanilla scripts.
Each entry says what the message means and the fix that worked. Where a cause is
inferred rather than proven it says so.

---

## Read the FIRST error in YOUR files — vanilla errors are usually a cascade

When one of your scripts fails to parse, the compile of the module aborts and
Workbench then prints errors in **vanilla files you never touched**. Seen in the
field, all caused by a single error in an addon file:

| Vanilla file | Message |
|---|---|
| `SCR_PlayerArsenalLoadout.c` | `Can't find variable 'sortSlots'`, `Error in parameters`, `Syntax error` |
| `SCR_ScenarioUICommon.c`, `SCR_SpawnLogic.c` | `Can't find class Tuple2` |
| `SCR_SpinningWidgetComponent.c` | `Can't find class SCR_SpinningWidgetAnimation` |
| `SCR_ScenarioFrameworkGetCountEntitiesInTrigger.c` | `Can't find class SCR_ScenarioFrameworkParam` |
| `SCR_InventoryStorageBaseUI.c` | `Can't find variable 'changeMap'` |
| `SCR_ModularButtonComponent.c` | `Can't find variable 'widgetEffectEventMasks'` |

Then `Can't compile "Game" script module!`. Do not edit or "fix" vanilla files.
Find the first `SCRIPT (E)` line whose path is inside your addon and fix that;
the vanilla errors disappear with it. (Recorded root cause in one case: a test
script used the reserved word `vanilla` as a variable name.)

---

## Compiler messages

| Message | Meaning | Fix |
|---|---|---|
| `Overloaded method 'Tick', argument name 'timeSlice' differs from prototype 'tDelta'` | An override must keep the **parameter names** of the method it overrides, not just the types. | Copy the parent's signature exactly (`game_read` the parent, or `api_search`). |
| `'this' or 'super' inside static method is not valid` | Static methods have no instance. | Pass the instance in, or make the method non-static. Static methods also cannot call instance `Rpc()` or `Replication.BumpMe()`; route through an instance method. |
| `Undefined function 'Math.Atan'` | `Math` has no `Atan`. It has `Tan`, `Asin`, `Acos` and `Atan2(float y, float x)`. | `Math.Atan2(y, x)`. |
| `Undefined function 'DoorComponent.GetOwner'` | `GetOwner()` is declared on `ScriptComponent`. Native components such as `DoorComponent` (`BaseDoorComponent` → `GameComponent` → `GenericComponent`) do not have it. | Keep the owner entity you looked the component up from, or use the component's own API (`GetDoorPivotPointWS()` for a door's position). |
| `Undefined function 'X.Y'` (your own classes) | The method does not exist on the **static type** of the expression, or it lives in a file that failed to compile. | Check the type you hold; check for an earlier error in the file that declares `Y`. |
| `Can't find variable 'm_X'` in your file | Typo, or a member declared in a class that did not compile. | Fix the declaration; look for an earlier error. |
| `Unknown type 'X'` / `Bad type 'X'` | The class is not visible to this file: renamed, deleted, or declared in a file that failed to compile. Seen when a new class's own file had an earlier error. | Fix the earlier error first. If it persists, check the class exists (`api_search`, or `project search` in your addon). |
| `Multiple declaration of class 'X'` | Two loaded scripts declare the same non-`modded` class. Seen as `RadioBroadcastComponentClass` (`Scripts/Game/generated/Components/RadioBroadcastComponent.c`) during a dedicated-server startup crash-loop that was traced to a mod script conflict. | Use `modded class` to extend a class that already exists, or give your class your addon tag prefix. |
| `Broken expression (missing ';'?)` / `Syntax error` | Parse error at or **just before** the reported line. | Look one statement above too: unclosed brackets and `?:` show up here. |
| `Incompatible parameter 'X'` / `Error in parameters` | An argument does not match the declared parameter (type, or `out`/`inout`). In a vanilla file it is part of a cascade (see above). | Compare the call against the declared signature from `api_search`. |

### Language rules that produce the errors above

- **No ternary operator.** `a ? b : c` does not compile. (Zero uses in all 6,568
  vanilla `.c` files.) Use `if`/`else`. See *EnforceScript Language Quirks*.
- **No `f` float suffix.** `1.4f` is a compile error; write `1.4`.
- **`%` is integer modulo** and is fine on ints (vanilla uses it 70+ times). For
  floats use `Math.Mod(v, div)` (remainder) or `Math.Repeat(value, range)` (loops
  the value into the range).
- **`vanilla` is reserved** and cannot be used as an identifier.

---

## Runtime errors (VM exceptions)

`Virtual Machine Exception` followed by `Reason: NULL pointer to instance. Variable 'x'`
and a call stack. Read the **first** exception of the run: later ones are often
consequences (a component that failed to init, then every caller of it).

- `Provided prefab '...' is invalid!` / `Prefab '...' is missing SCR_EditableEntityComponent!`
  — a Game Master placement path was given a prefab that is not GM-editable.

---

## Resource and replication errors that a passing test can hide

A fixture can print PASS while these are in the log. Grep for `RESOURCES (E)` and
`RPL (E)`, not only `SCRIPT (E)`:

- `RESOURCES (E): Wrong GUID/name for resource {GUID}...` and
  `RPL (E): Attempting to insert an entity with invalid prefab resource GUID` —
  a prefab `.et`/`.meta` written by hand is not in the addon's Workbench-built
  `resourceDatabase.rdb` until Workbench rescans. Clients on a dedicated server
  cannot create it. Create prefabs with Workbench running, or add components to an
  already registered prefab.
- `Unknown class 'X' at offset N(0x...)` while loading a prefab, layout or config —
  the resource names a script class that is not in the compiled set: removed or
  renamed (`SCR_WidgetExportRuleRoot`, `SCR_EditableEntityCore`), defined by an
  addon that is not loaded (`GL_Vest_Chest_Accessories`, `AGN_StartupSystemAction`),
  or behind a compile failure. The object is dropped and loading continues.

---

## Log noise in Workbench play mode — do not chase without a baseline

These appear in large numbers in Workbench play sessions and off-screen test
worlds whether or not your change is present (hundreds per session in the
recorded logs):

- `Cannot find editor component '...', local instance of editor manager not found!`
- `'...' needs a entity catalog manager!`
- `... should check if Item is in storage but no storage manager found so this step will be ignored!`
- 14 obsolete-API **warnings** from base-game scripts on every Workbench compile.

They come from the world not having the Game Master editor manager or catalog
manager that those components expect. Treat them as baseline: run the same world
once without your change, and only investigate messages that are new. They
matter only when your feature itself needs the GM editor (then use a world with
an editor manager).

---

## Workflow that avoids most of the above

1. `wb_validate_scripts` after every edit — it compiles without touching the
   running editor. Fix the first error in your own files.
2. `wb_reload` and accept only **Reload Complete**. **Reload Refused — no compile
   ran** is not a script error. Never run `wb_reload` alongside `wb_play`/`wb_stop`.
3. Before calling a method you have not used before, confirm it with `api_search`
   (method names in the index match their declarations since 2026-10-11) or
   `game_read` with `search` on the vanilla class.
4. After a run, read the first error of each kind (`SCRIPT (E)`, `RESOURCES (E)`,
   `RPL (E)`, VM exception) and compare against a baseline run.

---

## More field notes

- `SCRIPT (E): Too many instructions per function` across the whole Game module: class-level
  `static const ref array/map` initialisers share one static-init function; with many mods it
  overflows (see *EnforceScript Language Quirks*).
- `DEFAULT (E): Unknown class '<X>'` for a vanilla class you modded: the `modded class` of a
  config root is missing `[BaseContainerProps(configRoot: true)]`.
- Grep test logs for `DEFAULT (E)` too, not only `SCRIPT (E)`, `RESOURCES (E)` and `RPL (E)`.
- **Also baseline / not yours:** `EditBoxFilterComponent used on invalid widget type` (vanilla
  `WLib_EditBox`, reproduced on unmodified code); shutdown-only
  `Cannot find editor component 'SCR_MenuLayoutEditorComponent'` and `Group contains null
  waypoints!`; the `SCR_WidgetExportRuleRoot` GUI error; 18 base-game warnings once common
  dependencies are loaded (14 without). Compare counts before and after your change.
- `Resources are leaking! Check log!` at native reload and `==== Resource leaks ====` at
  shutdown appeared with passing compiles; the cause was never established — do not claim a
  clean resource-lifetime result.
- **Other mods' exceptions** (thousands per session from a radio or drone component are
  normal on modded servers): attribute by stack, do not suppress or patch third-party code.
- A server `crash.log` full of VM exception records is not a list of process crashes.
- `DXGI_ERROR_DEVICE_HUNG` (0x887A0006) with Windows `nvlddmkm` Event 153 is a GPU
  device hang / driver reset, not a script error (no script frame in the native stack).
