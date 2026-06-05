[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / placeOnGround

# Function: placeOnGround()

> **placeOnGround**(`object`, `groundY?`): [`WorldBounds`](../interfaces/WorldBounds.md)

Defined in: src/scene/Placement.ts:92

Assenta um objeto no chão: desloca `object.position.y` até que a **base** da
caixa delimitadora (o ponto mais baixo da geometria) fique exatamente em
`groundY`. Retorna os limites em world space **já com o objeto reposicionado**
— use as bordas (`minX`/`maxX`/...) pra conectar a próxima peça.

Resolve o problema nº1 ao montar cena com `.glb`: como o pivô de cada modelo
é arbitrário, posicionar por um `y` chutado deixa peças flutuando ou afundadas.
`placeOnGround` mede e encaixa, independente de onde está o pivô.

Pra **empilhar** um objeto em cima de outro, passe o topo do alvo como
`groundY`: `placeOnGround(flag, getWorldBounds(island).maxY)`.

## Parameters

### object

`Object3D`

O objeto a assentar (tipicamente recém-adicionado à cena).

### groundY?

`number` = `0`

Altura em que a base deve ficar. Default `0`.

## Returns

[`WorldBounds`](../interfaces/WorldBounds.md)

Os limites em world space após o reposicionamento.

## Example

```ts
// Ilha afundada 1.5u na água, e uma bandeira apoiada no topo dela:
const b = placeOnGround(island, -1.5)
placeOnGround(flag, b.maxY)
flag.position.x = b.center.x
```
