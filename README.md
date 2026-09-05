# Bifrost Enfusion MCP

Focus-safe MCP suite for Arma Reforger modding: official API/Wiki research, packed-game inspection, authoring, Workbench control, structured compile feedback, and in-editor testing in one direct process.

See the [Bifrost Workbench Editor Operations Manual](docs/WORKBENCH_EDITOR_OPERATIONS.md) for the reviewed editor APIs, asset formats, operation outcomes, focus behavior, evidence, and known engine boundaries.

For Codex/Astra, see the [Codex workflow](docs/CODEX_WORKBENCH.md). Start with `wb_capabilities` (`live=true` for actual project/editor state), use `project` for source inspection and precise edits, and `wb_batch` for ordered live operations.

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
| `wb_knowledge` | Search the bundled Arma Reforger modding knowledge base — distilled patterns covering scripting, audio, weapons, vehicles, AI, UI, game modes, animation, and more |
| `game_browse` | Browse base game files — loose files and `.pak` archives transparently |
| `game_read` | Read base game files — scripts, prefabs, configs from loose files or `.pak` |
| `prefab_inspect` | Inspect a prefab's full inheritance chain — merges all components across ancestors, showing which level each value comes from. Solves the problem of `.et` files only showing overrides. |
| `asset_search` | Search game assets by name across loose files and `.pak` archives |
| `project` | Browse, read with line ranges/hash, search recursively, write, or precisely edit supported text sources across editors |
| `mod_create` | Scaffold a complete addon with directory structure and `.gproj` |
| `script_create` | Generate Enforce Script (`.c`) files — 7 types: component, gamemode, action, entity, manager, modded, basic. Auto-fetches overridable parent methods from API index when `parentClass` is specified |
| `prefab_create` | Generate Entity Template (`.et`) prefabs — 7 types: character, vehicle, weapon, spawnpoint, gamemode, interactive, generic |
| `layout_create` | Generate UI layout (`.layout`) files — 5 types: hud, menu, dialog, list, custom |
| `layout_recipe` | Generate complete UI layouts from reusable Enfusion-safe recipes |
| `menu_create` | Generate a menu layout and controller scaffold with consistent widget bindings |
| `gamemode_scaffold` | Generate a game-mode script, prefab, and config scaffold |
| `config_create` | Generate config files — factions, missions, entity catalogs, editor placeables |
| `server_config` | Generate dedicated server config for local testing |
| `mod_validate` | Validate project structure, scripts, prefabs, configs, and naming |
| `mod_build` | Build the addon using the Workbench CLI |

### Live Workbench Tools

Control a running Workbench instance over TCP. Requires the handler scripts installed (see setup above).

| Tool | What it does |
|------|-------------|
| `wb_capabilities` | Editor/source/tool coverage, batch eligibility, and optional read-only live project/module discovery |
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

10 built-in templates for `mod_create`:

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
- **Arma Reforger Tools** (Steam) — needed for `mod_build` and all `wb_*` tools

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
