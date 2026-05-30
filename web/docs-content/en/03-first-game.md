# First game

Minimal roadmap: from an empty project to a running 3D scene.

## Project structure

Every project created by the IDE follows the ECS architectural
pattern:

```
my-game/
├── components/   Data only — classes extends Component
├── systems/      Logic only — classes extends System
├── entities/     Factories — functions that build entities
├── scenes/       Scene/level setup
├── assets/       .glb, textures, sounds
├── utils/        Generic helpers
├── main.ts       Bootstrap (World + GameLoop + Renderer)
└── vendor/cortex-game-engine/
```

## Bootstrap

The freshly-created `main.ts` already wires `World`, `GameLoop`,
`Renderer` and calls the initial scene. You don't need to touch
it to start.

## Add an entity

In `entities/cube.ts`:

```ts
import { Mesh, BoxGeometry, MeshStandardMaterial } from 'cortex-game-engine'
import type { Entity, World } from 'cortex-game-engine'

export function createCube(world: World): Entity {
  const entity = world.createEntity()
  const mesh = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0x44aaff }),
  )
  // ...add components that carry the mesh + position
  return entity
}
```

Imports always come from `'cortex-game-engine'` — never from
`'three'` directly. The Vite alias resolves to the vendored bundle.

## Talk to the AI

Open the chat in the right sidebar and describe what you want. The
agent reads the whole project (sandbox), and can write new files,
edit existing ones and run commands in the embedded terminal — always
asking approval before (`ask` mode) or acting directly (`auto` mode).

Examples of requests that work well:

- "Create a system that rotates the cube on the Y axis."
- "Add a directional light to the scene with shadows enabled."
- "Replace the cube with a light-blue sphere."

## Generate installer

When the game is ready to ship:

1. Menu → Project → **Generate installer...** (shortcut `Ctrl+Shift+B`).
2. On the first time, the IDE configures Tauri in the project
   (creates `src-tauri/`, generates placeholder icons, runs
   `yarn install`).
3. Click again — the `.exe` lands in
   `src-tauri/target/release/bundle/nsis/`.

Details in [Installation](#installation).
