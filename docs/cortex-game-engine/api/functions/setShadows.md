[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setShadows

# Function: setShadows()

> **setShadows**(`object`, `options`): `void`

Defined in: src/scene/SceneAssets.ts:89

Liga/desliga sombras em todos os meshes de um objeto. Use pra **excluir um
objeto específico** do shadowMap (ex.: água, decals, props pequenos):
`setShadows(water, { castShadow: false })`.

## Parameters

### object

`Object3D`

O objeto (ou grupo) a configurar.

### options

[`ShadowOptions`](../interfaces/ShadowOptions.md)

Quais sombras ligar. Campos omitidos não são alterados.

## Returns

`void`
