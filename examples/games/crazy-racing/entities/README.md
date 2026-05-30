# entities/

Cada arquivo exporta **uma função factory** que cria uma `Entity` com os
Components apropriados e a registra no `World`. Centraliza o "como
montar" cada tipo de objeto do jogo.

## Exemplo

```ts
// createPlayer.ts
import { Mesh, BoxGeometry, MeshStandardMaterial, type World, type Scene } from 'cortex-game-engine'
import { PositionComponent } from '../components/PositionComponent'
import { VelocityComponent } from '../components/VelocityComponent'
import { PlayerComponent } from '../components/PlayerComponent'
import { MeshComponent } from '../components/MeshComponent'

export function createPlayer(world: World, scene: Scene): void {
  const mesh = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0x4ec9b0 }),
  )
  scene.add(mesh)

  const entity = world.createEntity()
  entity.addComponent(new PlayerComponent())
  entity.addComponent(new PositionComponent(0, 0, 0))
  entity.addComponent(new VelocityComponent(0, 0, 0))
  entity.addComponent(new MeshComponent(mesh))
}
```

## Padrão

- Função top-level (não classe).
- Recebe `world` e o que mais precisar (`scene`, parâmetros de spawn).
- Cria a entity, adiciona Components, adiciona Mesh à cena se aplicável.
- Não retorna nada (regra geral) — gameplay queries por Component.
  Exceções: retornar a entity se o caller precisar referenciar.

## Quando criar

- Quando o jogo tem >1 tipo de entity que repete (player, enemy, coin).
- Antes disso, criar inline em `scenes/` é OK.
