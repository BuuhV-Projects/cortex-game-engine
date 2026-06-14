[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FirstPersonCameraOptions

# Interface: FirstPersonCameraOptions

Defined in: src/systems/FirstPersonCameraSystem.ts:10

Opções do [FirstPersonCameraSystem](../classes/FirstPersonCameraSystem.md).

## Properties

### eyeHeight?

> `optional` **eyeHeight?**: `number`

Defined in: src/systems/FirstPersonCameraSystem.ts:14

Altura dos olhos acima dos **pés** do personagem. Default `1.6`.

***

### moveSpeed?

> `optional` **moveSpeed?**: `number`

Defined in: src/systems/FirstPersonCameraSystem.ts:12

Velocidade de caminhada no plano (unidades/s). Default `6`.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: src/systems/FirstPersonCameraSystem.ts:23

Predicado de **pausa** (ex.: `() => game.editorActive`). Quando `true`, o
sistema não move/olha (e **mostra** o mesh do player pra editar). Diferente do
`System.pauseWhen` (que o World usa pra PULAR o update): aqui o update **sempre
roda** pra poder restaurar a visibilidade do corpo ao voltar pro editor.

#### Returns

`boolean`

***

### sensitivity?

> `optional` **sensitivity?**: `number`

Defined in: src/systems/FirstPersonCameraSystem.ts:16

Sensibilidade do mouse (rad por pixel de movimento). Default `0.0022`.
