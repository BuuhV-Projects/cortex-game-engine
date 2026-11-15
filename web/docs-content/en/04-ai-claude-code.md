# AI with Claude Code (MCP)

Cortex Studio's AI is **Claude Code** — Anthropic's official tool
(CLI, VS Code extension or desktop app) — opened in your game
project's folder. The Studio no longer has a chat of its own: it
hands the AI what only the Studio knows how to do through an **MCP
server** called `cortex`.

With the `cortex` MCP, Claude Code can see the engine's asset kits,
measure and render thumbnails of `.glb` models, validate the scene
and look up the engine API at the version the Studio installed.
Everything else — reading and writing files, running commands,
planning, asking for approval — is done by Claude Code, the way you
already know.

<div class="callout callout-info">

**The editor works without AI.** Scene, Inspector, preview and export
don't depend on Claude Code. It's only needed for the AI part.

</div>

## Install and connect

### 1. Install Claude Code

Download it from the official page:
[claude.com/product/claude-code](https://claude.com/product/claude-code).
You need **version 2.0 or newer** and a Claude account with a
subscription (Pro/Max) or another plan Claude Code accepts. The
first time you run `claude`, you log in through the browser.

To check the version:

```bash
claude --version
```

### 2. Register the MCP (automatic)

**Install Claude Code before the Studio** and there's nothing else to
do: at the end of the installation, the Studio installer:

1. checks the prerequisites (Claude Code, Blender and Git);
2. registers the `cortex` MCP in your user's Claude Code
   (`claude mcp add --scope user cortex`);
3. shows a report with what it found and what's missing. The same
   report is saved to `<Studio folder>\requisitos.txt`.

Reinstalling or updating the Studio registers it again, pointing at
the new executable. Uninstalling removes the registration.

### 3. Register later (manual)

If you installed Claude Code **after** the Studio, the installation
report warns that the registration is pending. Run this in
PowerShell, replacing `<Studio>` with the Studio install folder:

```powershell
$env:ELECTRON_RUN_AS_NODE=1; & "<Studio>\TS Cortex Studio.exe" "<Studio>\resources\mcp\cortex-setup.mjs" --register
```

The MCP runs on the Studio's own executable — you don't need Node on
your machine for it.

To check that it's registered:

```bash
claude mcp list
```

`cortex` should show up in the list.

## How to use

1. Open Claude Code **in the game project's folder** (in a terminal,
   `cd` into the folder and run `claude`; in VS Code or the desktop
   app, open the folder). The `cortex` tools work on that folder and
   don't leave it.
2. Ask for what you want in natural language. Claude Code decides
   when to call each `cortex` tool — you don't need to name them.

Examples of requests that work well:

- "Which asset kits does the engine have? Pick a platformer one and
  import only the floor and coin pieces."
- "Measure the `.glb` files in `assets/props/` and tell me which ones
  are off the meter scale."
- "Validate the `scenes/main.json` scene and fix whatever is floating
  or going through the floor."
- "How does `AssetLoader` work? Show the signature and an example."
- "Create a system that moves the platform up and down, using the
  engine API."

## `cortex` MCP tools

| Tool | What it does |
|---|---|
| `list_kits` | Lists the engine's asset kits: asset count, roles and tags. |
| `list_kit_assets` | Lists a kit's files, filtered by role or tag. |
| `import_kit` | Copies a kit (or part of it) into the project's `assets/<kit>/`, with `kit.json` and thumbnails. |
| `measure_glb` | Measures width × height × depth (in meters) of `.glb` files. |
| `inspect_assets` | Renders thumbnails and the measurement table for a folder of models. **Needs Blender.** |
| `validate_scene` | Reports geometric errors and warnings in a scene (`scenes/*.json`). |
| `engine_api_index` | Index of the sections of the engine's API and architecture guides. |
| `engine_api_section` | Full text of one guide section. |
| `engine_api_symbol` | Reference for one engine export (class, function, type). |
| `engine_api_search` | Searches the engine API by name or topic. |

The server also exposes two **resources** Claude Code can attach to
the conversation: `cortex://docs/engine-api.md` (API guide) and
`cortex://docs/architecture.md` (engine architecture).

API answers come with the engine version of the installed Studio.

## Limitations

- **No AI playtest, for now.** The AI doesn't run the game or take
  screenshots to check the result yet — test it in the Studio preview
  and tell it what you saw.
- **Generating a 3D model isn't a tool.** When it needs a model,
  Claude Code writes the Blender script on its own. See
  [Blender](#blender).
- **`inspect_assets` requires Blender.** Without it, the other tools
  keep working.
- **The AI can still make mistakes.** Review the diffs Claude Code
  proposes before accepting them.
