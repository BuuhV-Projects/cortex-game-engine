[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setupThirdPerson

# Function: setupThirdPerson()

> **setupThirdPerson**(`game`, `options?`): [`ThirdPersonHandle`](../interfaces/ThirdPersonHandle.md)

Defined in: src/scene/ThirdPerson.ts:35

Registra num [Game](../classes/Game.md) os sistemas de **terceira pessoa** (estilo Unity
StarterAssets ThirdPerson): sincronização mesh↔transform + o controle/câmera
(orbita por mouse, WASD relativo à câmera, corre com Shift, pula com Espaço; o
personagem vira pra direção do movimento) e a **animação** (idle/walk/run/jump/
fall) do `.glb`. O **player** é um nó `character` na cena (idealmente um `model`
`.glb` rigado com clipes); o `buildScene` liga a física vertical (gravidade/pulo/
aterrar no terreno) sozinho. Pausa no editor (F2). Reduz o bootstrap a uma linha.

## Parameters

### game

[`Game`](../classes/Game.md)

### options?

[`SetupThirdPersonOptions`](../interfaces/SetupThirdPersonOptions.md) = `{}`

## Returns

[`ThirdPersonHandle`](../interfaces/ThirdPersonHandle.md)

## Example

```ts
const game = new Game({ canvas })
setupThirdPerson(game, { control: { moveSpeed: 2, sprintSpeed: 5.3 } })
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world })
game.start()
```
