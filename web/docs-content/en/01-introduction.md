# Introduction

**cortex-game-engine** is an IDE focused on building 3D games with
TypeScript and AI. Instead of juggling Unity + Cursor + Blender +
ChatGPT, everything lives inside a single app: editor, live preview,
terminal, AI chat with per-project sandbox, 3D model generator via
Blender, and Windows installer packager.

## What you get

- **ECS engine** on top of Three.js — entities, components (data
  only), systems (no internal state).
- **Electron IDE** with Monaco, file tree, hot-reload preview,
  embedded terminal and AI chat in the sidebar.
- **AI agent** that acts inside the project sandbox: Read/Write/Edit
  with per-tool approval.
- **Blender generator** that takes a natural language description
  and returns a `.glb` ready to use in the scene.
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
