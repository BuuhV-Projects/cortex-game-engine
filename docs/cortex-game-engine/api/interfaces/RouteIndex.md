[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RouteIndex

# Interface: RouteIndex

Defined in: [src/scene/Route.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Route.ts#L46)

Índice de uma rota: comprimento de cada segmento e distância acumulada até
cada ponto. Transforma "onde fica o ponto a N metros daqui?" de uma marcha
pela rota numa busca binária — no kart-racer (384 pontos) a IA fazia essa
pergunta dezenas de vezes por carro por frame.

## Properties

### cumulative

> `readonly` **cumulative**: `Float64Array`

Defined in: [src/scene/Route.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Route.ts#L52)

`cumulative[i]` = distância do ponto 0 até o ponto `i`, no plano XZ. Tem
`route.length + 1` entradas: a última é o perímetro, o que deixa a busca
binária sem caso especial no segmento que fecha a rota.

***

### length

> `readonly` **length**: `number`

Defined in: [src/scene/Route.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Route.ts#L56)

Perímetro da rota fechada, em metros.

***

### segments

> `readonly` **segments**: `Float64Array`

Defined in: [src/scene/Route.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Route.ts#L54)

`segments[i]` = comprimento do segmento `i` → `i + 1` (o último fecha).
