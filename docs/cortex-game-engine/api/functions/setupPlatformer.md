[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setupPlatformer

# Function: setupPlatformer()

> **setupPlatformer**(`game`, `options?`): [`PlatformerHandle`](../interfaces/PlatformerHandle.md)

Defined in: [src/scene/Platformer.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Platformer.ts#L33)

Registra num [Game](../classes/Game.md) os sistemas de **plataforma 2.5D**: sincronização
mesh↔transform, input (teclado→intenção), física (gravidade+colisão AABB) e a
câmera 2D-follow. Os objetos vêm da cena data-driven (`buildScene` com `world`
— nós com `collider`/`player` viram entidades). Reduz o bootstrap a uma linha.

## Parameters

### game

[`Game`](../classes/Game.md)

### options?

[`SetupPlatformerOptions`](../interfaces/SetupPlatformerOptions.md) = `{}`

## Returns

[`PlatformerHandle`](../interfaces/PlatformerHandle.md)

## Example

```ts
const game = new Game({ canvas })
const { followCamera } = setupPlatformer(game, { camera: { distance: 16 } })
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
game.start()
```
