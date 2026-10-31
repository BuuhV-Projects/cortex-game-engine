[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RoadCorridor

# Class: RoadCorridor

Defined in: src/road/RoadCorridor.ts:18

Índice espacial do eixo de uma estrada. Ver [RoadCorridor.contains](#contains).

## Constructors

### Constructor

> **new RoadCorridor**(`centerline`, `radius`): `RoadCorridor`

Defined in: src/road/RoadCorridor.ts:30

#### Parameters

##### centerline

readonly [`CorridorPoint`](../interfaces/CorridorPoint.md)[]

eixo da estrada (≥2 pontos)

##### radius

`number`

distância máxima ao eixo considerada "dentro" (m)

#### Returns

`RoadCorridor`

#### Example

```ts
const c = new RoadCorridor(eixo, 4 + 2)
c.contains(10, 3) // true se a árvore cai na pista ou na faixa livre
```

## Methods

### contains()

> **contains**(`x`, `z`): `boolean`

Defined in: src/road/RoadCorridor.ts:52

`true` se `(x, z)` está a até `radius` de algum segmento do eixo.

#### Parameters

##### x

`number`

##### z

`number`

#### Returns

`boolean`
