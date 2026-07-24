[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / placeOnGround

# Function: placeOnGround()

> **placeOnGround**(`object`, `options?`): [`Bounds`](../interfaces/Bounds.md)

Defined in: [src/scene/SceneAssets.ts:296](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L296)

Assenta um objeto: aplica `rotY`/`scale`, posiciona o **centro horizontal** em
`(x, z)` e a **base** da geometria (ponto mais baixo do bbox) em `y` —
independente de onde está o pivô do `.glb`. Retorna os [Bounds](../interfaces/Bounds.md) já
reposicionados, pra você conectar peças vizinhas por bordas reais.

## Parameters

### object

`Object3D`

O objeto a assentar (tipicamente recém-adicionado à cena).

### options?

[`PlaceOptions`](../interfaces/PlaceOptions.md) = `{}`

Posição/rotação/escala. Ver [PlaceOptions](../interfaces/PlaceOptions.md).

## Returns

[`Bounds`](../interfaces/Bounds.md)

Os limites em world space após o posicionamento.

## Example

```ts
const a = placeOnGround(islandA, { x: 0, y: -1.5 })
const b = placeOnGround(islandB, { x: 25, y: -1.5 })
// ponte no meio do gap real, deck no topo das ilhas:
placeOnGround(bridge, { x: (a.maxX + b.minX) / 2, y: a.topY, z: a.center.z })
```
