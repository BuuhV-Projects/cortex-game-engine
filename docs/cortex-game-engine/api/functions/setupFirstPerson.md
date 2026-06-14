[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setupFirstPerson

# Function: setupFirstPerson()

> **setupFirstPerson**(`game`, `options?`): [`FirstPersonHandle`](../interfaces/FirstPersonHandle.md)

Defined in: [src/scene/FirstPerson.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/FirstPerson.ts#L36)

Registra num [Game](../classes/Game.md) os sistemas de **primeira pessoa** (FPS): sincronização
mesh↔transform e a câmera/controle FPS (mouse-look + WASD + pulo). O **player** é
um nó `character` na cena (cápsula); o `buildScene` registra sozinho a física
vertical dele (`CharacterPhysicsSystem` — gravidade/pulo/aterrar no terreno), e o
terreno colidível vem de um nó `terrain`. Reduz o bootstrap a uma linha.

O controle FPS **pausa** no editor (F2) e no pause do play, então não rouba o
mouse nem move o player enquanto você edita.

## Parameters

### game

[`Game`](../classes/Game.md)

### options?

[`SetupFirstPersonOptions`](../interfaces/SetupFirstPersonOptions.md) = `{}`

## Returns

[`FirstPersonHandle`](../interfaces/FirstPersonHandle.md)

## Example

```ts
const game = new Game({ canvas })
setupFirstPerson(game, { camera: { moveSpeed: 6 } })
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
game.start()
```
