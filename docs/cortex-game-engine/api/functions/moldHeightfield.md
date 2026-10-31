[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / moldHeightfield

# Function: moldHeightfield()

> **moldHeightfield**(`grid`, `centerline`, `halfWidth`, `taludeWidth`): `Float32Array`

Defined in: src/road/RoadGrade.ts:123

**Molda o terreno à estrada**: para cada vértice perto do eixo, a altura-alvo é o
greide no **platô** (`halfWidth` + acostamento ≥ 1,5 célula — a borda da pista nunca
cai no talude), um `smoothstep` do greide até a base no **talude**, e a base fora.

Custo O(segmentos × células perto de cada segmento) + O(vértices): cada segmento só
visita a caixa dele ± alcance.

## Parameters

### grid

[`HeightfieldGrid`](../interfaces/HeightfieldGrid.md)

### centerline

readonly [`GradePoint`](../interfaces/GradePoint.md)[]

### halfWidth

`number`

### taludeWidth

`number`

## Returns

`Float32Array`

o **delta** (alvo − base) por vértice; tudo 0 com <2 pontos no eixo.

## Example

```ts
const delta = moldHeightfield(grid, centerline, 4, 6)
terrain.setRoadMolding(delta)
```
