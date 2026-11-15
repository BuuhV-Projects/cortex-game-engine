# Introduction

**cortex-game-engine** is an IDE focused on building 3D games with
TypeScript and AI. Instead of juggling Unity + Cursor + Blender +
ChatGPT, the editor, live preview, terminal and Windows installer
packager live in a single app — and the AI is **Claude Code**, which
connects to the Studio through an MCP server (`cortex`) and sees the
engine's asset kits, the scene and the engine API.

## What you get

- **ECS engine** on top of Three.js — entities, components (data
  only), systems (no internal state).
- **Electron IDE** with Monaco, file tree, hot-reload preview,
  embedded terminal.
- **AI via Claude Code + the `cortex` MCP** — you open Claude Code in
  the game folder and it imports kits, measures models, validates the
  scene and looks up the engine API. Details in
  [AI with Claude Code](#ai-claude-code).
- **Blender integration** — model thumbnails and measurements,
  auto-rig, and scripts Claude Code writes to create or tweak `.glb`
  files.
- **Windows installer** in one click — packaging via Tauri 2.

## Who it's for

People who write TypeScript and want to make 3D games without
switching to C# or C++. People who want to iterate fast with AI
without losing control over the generated code. People who prefer
shipping a real `.exe` over publishing in the browser.

## What it's not

- It's not a AAA engine. There's no custom renderer, no drag-and-drop
  visual editor, no built-in advanced physics.
- It's not an online platform — games run offline, packaged as
  desktop apps.
- It doesn't replace Unity/Unreal for large projects. It's focused
  on 3D indie/jam games, fast prototyping and learning.
