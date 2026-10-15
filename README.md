# Bifrost Enfusion MCP

Focus-safe MCP suite for Arma Reforger modding: official API/Wiki research, packed-game inspection, authoring, Workbench control, structured compile feedback, and in-editor testing in one direct process.

See the [Bifrost Workbench Editor Operations Manual](docs/WORKBENCH_EDITOR_OPERATIONS.md) for the reviewed editor APIs, asset formats, operation outcomes, focus behavior, evidence, and known engine boundaries.

For Codex/Astra, see the [Codex workflow](docs/CODEX_WORKBENCH.md). Start with `wb_capabilities` (`live=true` for actual project/editor state), use `project` for source inspection and precise edits, and `wb_batch` for ordered live operations.

The [native bridge guide](docs/NATIVE_AGENT_WORKFLOW.md) covers inspect/navigate/edit access across ten Workbench modules, exact entity and property targets, unsaved script buffers, debugger controls and runtime logs, and local documentation deployment. Install or update the bridge in the verified loaded addon with `wb_bridge`; no additional service is needed.

## Install

### Local Windows installation

```powershell
npm ci
npm run build
```

Register the built server with a direct Node executable. Do not use a `cmd`, `npx`, or shell wrapper:

```json
{
  "mcpServers": {
    "enfusion-mcp": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\Bryce\\source\\repos\\enfusion-mcp-bifrost\\dist\\index.js"],
      "env": {
        "ENFUSION_WORKBENCH_PATH": "P:\\SteamLibrary\\steamapps\\common\\Arma Reforger Tools\\Workbench",
        "ENFUSION_GAME_PATH": "P:\\SteamLibrary\\steamapps\\common\\Arma Reforger",
        "ENFUSION_PROJECT_PATH": "C:\\Users\\Bryce\\Documents\\My Games\\ArmaReforgerWorkbench\\addons",
        "ENFUSION_WORKBENCH_PROFILE": "C:\\Users\\Bryce\\Documents\\My Games\\ArmaReforgerWorkbench",
        "ENFUSION_DEFAULT_MOD": "Bifrost-Dev"
      }
    }
  }
}
```

### Workbench Plugin

The live Workbench tools (`wb_*`) require handler scripts running inside Workbench. These ship in `mod/Scripts/WorkbenchGame/EnfusionMCP/`. Ordinary calls fail fast and never launch or restart Workbench; only an explicit `wb_launch` is allowed to launch it.

## Usage

Ask Codex/Astra or another MCP client to work on a mod:

- *"Create a HUD widget that shows player health and stamina"*
- *"Make a zombie survival game mode with wave spawning"*
- *"Create a custom faction called CSAT with desert camo soldiers"*
- *"Add an interactive object that heals the player when used"*
- *"Override the damage system to add armor mechanics"*

Or use the guided prompts for structured workflows:

| Prompt | Description |
|--------|-------------|
| `/create-mod` | Full guided mod creation — from idea to built addon |
| `/modify-mod` | Modify or extend an existing mod project |

The supported workflow is:

1. **Establish the target** — inspect live projects and capabilities, then choose the smallest complete implementation
2. **Research** the Enfusion API (8,693 indexed classes), the Arma Reforger wiki (250+ guides), and base game assets (read directly from `.pak` archives) to find the right approach
3. **Scaffold** the full addon — `.gproj`, scripts, prefabs, configs, UI layouts
4. **Reuse the running Workbench** and fail fast if it is unavailable
5. **Load the project**, reload scripts, register resources
6. **Validate and build** the addon
7. **Enter play mode** so you can test in-game

For complex mods, a `MODPLAN.md` is written to the project root tracking the full vision, completed phases, and what's next — so any future session can pick up right where the last one left off via `/modify-mod`.

## Tools

### Offline Tools

Work without Workbench running — API search, mod scaffolding, code generation, validation, and building.

| Tool | What it does |
|------|-------------|
| `api_search` | Search 8,693 Enfusion/Arma Reforger API classes and methods — includes inherited members, enum-like class detection, related sibling classes, and `format: 'tree'` for ASCII inheritance hierarchy visualization |
| `component_search` | Search ScriptComponent descendants — filter by category (character, vehicle, weapon, damage, inventory, ai, ui, etc.) and event handlers |
| `wiki_search` | Search 271 current Enfusion/BI Wiki and API pages (264 official Wiki pages with revision metadata) |
| `wiki_read` | Read the full content of a wiki page by title — no truncation, includes code examples |

### Tools (63 total: 26 offline, 37 live)

**Start every authoring task with `wb_playbook`.** It returns the preconditions,
the ordered tool calls, the traps that fail silently, and how to verify. Use
`wb_knowledge` for engine facts once you know the task.

**The `wb_` prefix does not mean "needs Workbench".** `wb_knowledge` and
`wb_playbook` are `wb_`-prefixed and work entirely offline.

#### Procedure (start here)

| Tool | What it does |
|------|-------------|
| `wb_playbook` | **START HERE.** Task-oriented playbook: preconditions, ordered tool calls, silent-failure traps, verification. `query="catalogue"` lists all 19 |
| `wb_knowledge` | Subject-oriented KB: engine concepts and API detail across 48 pattern docs |

#### Reference / research

| Tool | What it does |
|------|-------------|
| `api_search` | Search the Enfusion/Arma script API by class, method, or keyword (8693 classes indexed) |
| `component_search` | Find ScriptComponent descendants — the building blocks you attach to entities |
| `wiki_search` | Search the pre-downloaded BI wiki (271 pages) |
| `wiki_read` | Read a full wiki page by title |
| `game_browse` | Browse base game data files (scripts, prefabs, configs) |
| `game_read` | Read a file from the base game data |
| `asset_search` | Search for base game assets (prefabs, models, textures, scripts, configs) by name |

#### Authoring (offline)

| Tool | What it does |
|------|-------------|
| `mod` | Addon management — `action`: `create` (scaffold), `validate` (no build needed), `build` (needs local Steam Diag Workbench) |
| `script_create` | Create a new Enforce Script (.c) file for an Arma Reforger mod |
| `prefab` | Prefab `.et` work — `action=create` from a recipe type, or `action=inspect` for the full inheritance chain |
| `config_create` | Create a config (.conf) file for an Arma Reforger mod |
| `server_config` | Generate a dedicated server config (server.json) for testing an Arma Reforger mod locally |
| `layout_create` | Create a UI layout (.layout) file for an Arma Reforger mod |
| `layout_recipe` | Generate a UI layout (.layout) from a proven blueprint recipe (extracted from real Arma Reforger HUDs) |
| `menu_create` | Scaffold a complete custom Arma Reforger menu: the Enforce class (.c) with the modded ChimeraMenuPreset enum entry and... |
| `gamemode_scaffold` | Scaffold a modded SCR_GameModeCampaign for Conflict by composing cookbook-verified feature recipes (battle_prep, seedi... |
| `scenario_create` | Create a scenario element in the live scene (objective, spawnpoint, ...) |
| `scenario_create_conflict` | Generate a full Conflict multiplayer scenario as up to 7 files |
| `animation_graph` | Author and inspect vehicle animation graphs (AGF/AGR) |
| `editor_asset` | Inspect/author Workbench graph-editor assets (ACP/PTC/PAP/SIGA) |
| `building_setup` | Set up a destructible building from a Blender export manifest |
| `game_duplicate` | Duplicate a base-game prefab/config into your mod for editing |
| `project` | Browse, read, search, write, or precisely edit Workbench source files, including audio/particle/animation graphs, mate... |
| `workshop_info` | Read Workshop metadata (mod ID, GUID, dependencies) from a `.gproj` |

#### Project files

| Tool | What it does |
|------|-------------|

#### Live Workbench (needs editor open + focused)

| Tool | What it does |
|------|-------------|
| `wb_capabilities` | **Start here for live Workbench work.** Editor/source/tool coverage and read-only project discovery |
| `wb_state` | Get a full snapshot of the current Workbench state |
| `wb_connect` | Test connection to Arma Reforger Workbench |
| `wb_diagnose` | Full diagnostic of the MCP <-> Workbench connection with a verdict |
| `wb_launch` | Launch Workbench (opt-in) |
| `wb_docs` | List/read the bundled agent Workbench guides |
| `wb_bridge` | Inspect/install the native MCP handler plugin in a verified loaded addon |
| `wb_debug` | Bounded runtime logs, resumable cursors, source context, native debugger panes |
| `wb_cleanup` | Remove temporary EnfusionMCP handler scripts |
| `wb_reload` | Reload and compile scripts or plugins in the running Workbench, then return structured compile errors from Workbench's... |
| `wb_validate_scripts` | Run Workbench's built-in ValidateScripts NET API endpoint and return its structured success flag, errors, warnings, fi... |
| `wb_compile_status` | Read the latest Workbench script compilation result from its authoritative script.log |
| `wb_script_editor` | Read the live Script Editor buffer (including unsaved changes) and edit exact lines with conflict checks |
| `wb_batch` | Run up to 25 existing Workbench tools in order (not atomic) |
| `wb_projects` | Query actual loaded addon IDs, locate the loaded project containing an absolute filesystem path, or open a .gproj with... |
| `wb_open_resource` | Open a resource file in the appropriate Workbench editor |
| `wb_play` | Switch Workbench to game (play) mode |
| `wb_stop` | Stop game mode and return to the World Editor |
| `wb_save` | Save the current world in the World Editor |
| `wb_undo_redo` | Undo or redo the last action in the World Editor |
| `wb_execute_action` | Execute a Workbench menu action by its menu path |
| `wb_editor_module` | Shared control for every Reforger Workbench editor |
| `wb_entity_create` | Create a new entity in the World Editor from a prefab |
| `wb_entity_list` | List entities in the current world |
| `wb_entity_inspect` | Get detailed information about a specific entity, including its components, properties, position, and children |
| `wb_entity_modify` | Modify an entity in the World Editor |
| `wb_entity_delete` | Delete an entity from the World Editor by name |
| `wb_entity_select` | Manage entity selection in the World Editor |
| `wb_entity_duplicate` | Duplicate a scene entity (including locked base-game prefab instances) into your mod folder, assigning it a new resour... |
| `wb_component` | Manage components on an entity in the World Editor |
| `wb_prefabs` | Create/save Workbench prefab templates, look up registered GUIDs, or discover prefab source files in a directory on th... |
| `wb_resources` | Manage Workbench resources |
| `wb_layers` | Manage layers in the World Editor |
| `wb_terrain` | Query terrain information |
| `wb_validate` | Validate a material or texture resource using the Workbench's built-in validators |
| `wb_clipboard` | Clipboard operations in the World Editor |
| `wb_localization` | Manage localization entries in the Workbench Localization Editor |

### Live Workbench Tools

Control a running Workbench instance over TCP. Requires the handler scripts installed (see setup above).

| Tool | What it does |
|------|-------------|
| `wb_capabilities` | Editor/source/tool coverage, batch eligibility, and optional read-only live project/module discovery |
| `wb_bridge` | Inspect/install the native plugin in a verified loaded addon without duplicating Workbench |
| `wb_docs` | Read or deploy bundled local workflow documentation |
| `wb_debug` | Runtime logs and cursors, source context, debugger panes and documented control dispatch |
| `wb_batch` | Up to 25 ordered existing operations, whole-plan preflight, structured partial results, stop on error |
| `wb_launch` | Start Workbench if not running, wait for NET API |
| `wb_cleanup` | Remove injected MCP handlers from one mod or every detected addon before publishing |
| `wb_connect` | Test connection to Workbench |
| `wb_state` | Full state snapshot — mode, world, entity count, selection |
| `wb_play` | Switch to game mode (Play in Editor) |
| `wb_stop` | Return to edit mode |
| `wb_save` | Save the current world |
| `wb_undo_redo` | Undo or redo the last action |
| `wb_open_resource` | Open a resource in its editor |
| `wb_reload` | Reload/compile scripts without focus and return file/line/message diagnostics from Workbench's script.log |
| `wb_compile_status` | Read the latest structured compile result without modifying or focusing Workbench |
| `wb_diagnose` | Read-only connection, handler, path, and editor-mode diagnosis |
| `wb_execute_action` | Run supported menu actions with foreground acknowledgement; unsafe lifecycle paths remain blocked |
| `wb_entity_create` | Create entity from prefab at a position |
| `wb_entity_delete` | Delete entity by name |
| `wb_entity_list` | List and search entities in the world |
| `wb_entity_inspect` | Get entity details — properties, components, children |
| `wb_entity_modify` | Move, rotate, rename, reparent, set/clear/get/list properties, list/add/remove array items |
| `wb_entity_select` | Select, deselect, clear, get current selection |
| `wb_component` | Add, remove, list entity components — supports lookup by name or index (for unnamed entities) |
| `wb_terrain` | Query terrain height and world bounds |
| `wb_layers` | Create, delete, rename layers, set visibility/active |
| `wb_resources` | Register resources, rebuild database |
| `wb_prefabs` | Create templates, save, GUID lookup |
| `wb_clipboard` | Copy, cut, paste, duplicate entities |
| `wb_script_editor` | Read/write lines in the open script file |
| `wb_localization` | String table CRUD for localization |
| `wb_projects` | List actual loaded project IDs, locate owner by absolute path, open `.gproj` with foreground acknowledgement |
| `wb_validate` | Material and texture validation |

### Mod Patterns

10 built-in templates, applied via `mod` with `action: "create"` and `pattern`:

`game-mode` `custom-faction` `custom-action` `spawn-system` `custom-component` `modded-behavior` `admin-tool` `custom-vehicle` `weapon-reskin` `hud-widget`

### MCP Resources

| URI | Description |
|-----|-------------|
| `enfusion://class/{className}` | Full class docs with inheritance, methods, ancestors/descendants |
| `enfusion://pattern/{patternName}` | Mod pattern definition with all templates |
| `enfusion://group/{groupName}` | API group with class list |

## Configuration

All optional — sensible defaults are used when nothing is set. Configuration is via environment variables, passed through your MCP client's `env` block:

```json
{
  "mcpServers": {
    "enfusion-mcp": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\path\\to\\enfusion-mcp-bifrost\\dist\\index.js"],
      "env": {
        "ENFUSION_WORKBENCH_PATH": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Arma Reforger Tools",
        "ENFUSION_PROJECT_PATH": "C:\\Users\\you\\Documents\\My Games\\ArmaReforgerWorkbench\\addons"
      }
    }
  }
}
```

### Core

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ENFUSION_PROJECT_PATH` | Default mod output directory | `~/Documents/My Games/ArmaReforgerWorkbench/addons` |
| `ENFUSION_WORKBENCH_PATH` | Path to Arma Reforger Tools | `C:\Program Files (x86)\Steam\steamapps\common\Arma Reforger Tools` |
| `ENFUSION_GAME_PATH` | Path to the Arma Reforger game install (used as CWD when launching Workbench so base-game addons resolve correctly) | Auto-detected from sibling of `ENFUSION_WORKBENCH_PATH` |
| `ENFUSION_WORKBENCH_HOST` | NET API host | `127.0.0.1` |
| `ENFUSION_WORKBENCH_PORT` | NET API port | `5775` |

### Advanced

Rarely needed — the defaults are correct for almost everyone.

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ENFUSION_EXTRACTED_PATH` | Path to a pre-extracted game-data library (flattened prefabs); `game_duplicate` checks here before falling back to `.pak` loose files | unset |
| `ENFUSION_DEFAULT_MOD` | Static fallback addon folder name when `modName` is omitted in a tool call (normally set automatically when `wb_launch` opens a `.gproj`) | unset |
| `ENFUSION_MCP_DATA_DIR` | Override the bundled data directory (scraped index + patterns) — for development | bundled `data/` |

> **WSL users:** `ENFUSION_WORKBENCH_HOST` and Windows-path handling need extra setup — see [docs/wsl-windows-setup.md](docs/wsl-windows-setup.md).

## Requirements

- **Node.js 20+**
- **Arma Reforger Tools** (Steam) — needed for the live `wb_*` bridge tools, and for
  `mod` with `action: "build"` (which additionally needs the *Profiling Build* beta
  for `ArmaReforgerWorkbenchSteamDiag.exe`). The other 24 tools work without it.

## Development

```bash
git clone https://github.com/steffenbk/enfusion-mcp-BK.git
cd enfusion-mcp-BK
npm install
npm run scrape   # Build API index from Workbench docs
npm run build
npm test
```

## License

MIT
