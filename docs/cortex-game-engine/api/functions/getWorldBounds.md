[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / getWorldBounds

# Function: getWorldBounds()

> **getWorldBounds**(`object`): [`WorldBounds`](../interfaces/WorldBounds.md)

Defined in: src/scene/Placement.ts:48

Mede a caixa delimitadora de um `Object3D` (incluindo todos os descendentes)
em **world space**. Atualiza as matrizes de mundo antes de medir, então o
resultado reflete a posição/rotação/escala atuais — útil logo após carregar
um `.glb` (cujo pivô é imprevisível) pra saber onde a geometria realmente
está.

## Parameters

### object

`Object3D`

O objeto (ou grupo, ex.: a cena de um glTF) a medir.

## Returns

[`WorldBounds`](../interfaces/WorldBounds.md)

Os limites em world space, com os escalares desempacotados.

## Example

```ts
const island = instance(islandGlb)
scene.add(island)
const b = getWorldBounds(island)
// borda direita da ilha (pra encostar a próxima peça):
nextPiece.position.x = b.maxX
```
