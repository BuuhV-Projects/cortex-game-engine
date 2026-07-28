[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setupTopDown

# Function: setupTopDown()

> **setupTopDown**(`game`, `options?`): [`TopDownHandle`](../interfaces/TopDownHandle.md)

Defined in: [src/scene/TopDown.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/TopDown.ts#L51)

Registra num [Game](../classes/Game.md) os sistemas de **top-down** (farm sim / RPG estilo
Stardew): sincronização mesh↔transform, movimento no plano XZ (vira na direção do
andar) e a câmera 3/4 que segue o player. O **player** é um nó `character` na cena
(cápsula); o `buildScene` cuida do Y (gravidade/aterrar). O **input é do jogo**:
passe `readMove` lendo o controle dele (o engine só fornece `InputManager`/
`GamepadManager` crus — ADR-0066). Use **perspectiva** (default do `Game`).

Pausa a gameplay no editor (F2) e no pause do play.

## Parameters

### game

[`Game`](../classes/Game.md)

### options?

[`SetupTopDownOptions`](../interfaces/SetupTopDownOptions.md) = `{}`

## Returns

[`TopDownHandle`](../interfaces/TopDownHandle.md)

## Example

```ts
const game = new Game({ canvas })
const controle = criarControleDoJogo(game.input) // o JOGO implementa
setupTopDown(game, { readMove: () => controle.moveAxis(), move: { moveSpeed: 5 } })
await buildScene(game.scene, [level], { renderer: game.renderer, world: game.world,
  physicsPaused: () => game.editorActive || game.gameplayPaused })
game.start()
```
