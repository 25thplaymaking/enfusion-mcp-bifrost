# Testing Without Workbench — Off-Screen Game Instances, Fixtures & Evidence Levels

How the Bifrost addon is tested without driving the user's focused Workbench (game 1.8.0.13,
Sept–Oct 2026). Proven on one Windows PC with the Steam game and tools installed. Use it when
Workbench is busy, unfocused, or the user is playing.

---

## Run an owned, off-screen game instance

Run `ArmaReforgerSteamDiag.exe` **with the game folder as working directory** (otherwise the
base game addon is not found):

```
ArmaReforgerSteamDiag.exe -addonsDir "<Workbench addons dir>" -addons <your addon GUID>
  -world "{77C41EA429B6AC35}worlds/GameMaster/GM_Arland.ent"
  -worldSystemsConfig "{8DDC2A311929D52F}Configs/Systems/GameMasterSystems.conf"
  -window -posX -3000 -forceUpdate -noFocus -noSound -noThrow -noBackend
  -disableCrashReporter -VMErrorMode log_only -profile <scratch> -logsDir <scratch>
```

- It compiles the addon from disk at launch and opens the GM editor for the local player.
  Other GM worlds used: GM_Eden `{BEF094A5F7F3211B}`, GM_Cain `{6228BD33933C8F81}`.
- Kill only processes whose command line contains your scratch profile — never the user's
  game or Workbench.
- Cap frame rate (`-maxFPS 30`–`60`) and run **one instance at a time**: uncapped off-screen
  instances, or one beside a Workbench play session, produced `DXGI_ERROR_DEVICE_HUNG`
  crashes in the first seconds of a world.
- In the unfocused window the cursor reads (0,0) — hide whatever panel sits there before
  synthetic clicks. Never move the user's real cursor.
- Once, `-world` exited with "Couldn't resolve world path" right after compiling and worked
  later the same day **(cause unknown)**; a compile-only check still works (wait for
  "Compiling Game scripts took").
- To test against a server's real mod set: junction every mod GUID folder plus your addon into
  **one** scratch folder and pass only that as `-addonsDir` (141 mods reached the GM editor in
  ~35 s). Never point `-addonsDir` at the Workshop download folder wholesale — it contains the
  Workshop copy of your own addon with the same GUID. Remove junctions non-recursively.

Workbench itself can also run hidden: `-gproj <path> -addonsDir "<game>\addons" -profile
<scratch> -noFocus -forceUpdate -wbModule=ResourceManager -plugin=<Plugin>` compiles the
WORKBENCH configuration, and a plugin can enter play mode with
`WorldEditor.SetOpenedResource(...)` then `SwitchToGameMode`.

## Fixtures

- Put the fixture in a temporary `Scripts/Game/<Name>Temp.c` wrapped in `#ifdef <DEFINE>`,
  start the instance with `-scrDefine <DEFINE>` (pass flag and value as **two separate
  arguments** — a shell that comma-joined them made the fixture silently never compile),
  print `RESULT passed=N failed=M`, then `GetGame().RequestClose()`. Delete the file after the
  run and keep the pattern in `.gitignore`.
- Measure cost inside the fixture: a `modded class` wrapping the method under test with
  `System.GetTickCount()`, plus a `CallLater(..., 0, true)` frame-gap counter.
- Traces from a probe must exclude the probing entity's own hierarchy (`TraceParam.Exclude`)
  and start above the body, or every probe hits itself.

## A result counts only if

1. **The tree compiled first.** Require `COMPILE OK` in the run summary; `COMPILE UNKNOWN`
   means the game never reached the compile. A deliberate syntax error in a temp file must
   produce `Can't compile "Game" script module!` — that validates the gate.
2. **The fixture's own markers are in that run's `console.log`**, proving the new code ran.
3. **The log has no new error of any class**: grep `SCRIPT (E)`, `RESOURCES (E)`, `RPL (E)`,
   `DEFAULT (E)` and `Unknown class`, not only script errors. A fixture printed PASS while
   prefab-GUID and replication errors were in the log.

Two identical results after a code change: re-check the compile before anything else.

## Fixture traps that hid or faked results

- Dead AI leave their group, so a group-count "alive" check hides deaths — track the original
  member entities and their life state.
- A "grounded" check that accepted negative altitude passed while bodies tunnelled under the
  terrain — bound it (e.g. -1 m < AGL < 2.5 m).
- AI far from the camera/player run at low detail and act in bursts — keep the camera near
  the units under test.
- Groups register members over the first seconds after spawn — wait before counting or
  ordering (one order went out with 1 of 8 members present).
- `-noSound` means nothing audible can be verified in the harness; audio stays a hands-on item.

## Evidence levels — say which one you have

Static compile, native validation, off-screen listen-server runtime, dedicated server, remote
client, join-in-progress and save/restart persistence are separate claims; one never implies
another. A dedicated-server test needs the free "Arma Reforger Server" Steam tool
(`ArmaReforgerServer.exe`) and a firewall rule; Workbench play mode does not accept outside
clients without its peer tool. State in every hand-off which levels are still open.
