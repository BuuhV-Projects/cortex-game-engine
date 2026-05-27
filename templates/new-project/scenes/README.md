# scenes/

Cada arquivo descreve uma **cena/level** completo: cria entities,
registra systems no `World`, configura câmera e luzes. O `main.ts`
escolhe qual cena carregar inicialmente.

## Exemplo

```ts
// MainScene.ts
import {
  type World, type Scene, AmbientLight, DirectionalLight, PerspectiveCamera,
} from 'cortex-game-engine'
import { MovementSystem } from '../systems/MovementSystem'
import { InputSystem } from '../systems/InputSystem'
import { createPlayer } from '../entities/createPlayer'
import { createCoin } from '../entities/createCoin'

export function setupMainScene(world: World, scene: Scene): { camera: PerspectiveCamera } {
  // Luzes
  scene.add(new AmbientLight(0xffffff, 0.4))
  const dir = new DirectionalLight(0xffffff, 0.8)
  dir.position.set(3, 5, 4)
  scene.add(dir)

  // Câmera
  const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.z = 10

  // Systems
  world.addSystem(new InputSystem())
  world.addSystem(new MovementSystem())

  // Entities
  createPlayer(world, scene)
  for (let i = 0; i < 10; i++) {
    createCoin(world, scene, Math.random() * 16 - 8, Math.random() * 16 - 8)
  }

  return { camera }
}
```

## Quando ter múltiplas

- Menu / Jogo / Tela de fim → 3 cenas.
- Levels diferentes → uma por level.
- Cada cena exporta uma `setup*` que monta tudo.
