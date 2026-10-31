[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadRibbon

# Function: roadRibbon()

> **roadRibbon**(`samples`, `width`, `tileMeters?`, `gradeY?`, `lift?`): [`RoadRibbon`](../interfaces/RoadRibbon.md)

Defined in: src/road/RoadMesh.ts:45

Gera a fita. `gradeY[i]` (opcional) é o Y da linha `i`; sem ele, usa o Y da amostra.
`lift` soma ao Y (a pista fica um tico acima do platô do terreno).

## Parameters

### samples

readonly [`RoadSample`](../interfaces/RoadSample.md)[]

amostras da spline ([sampleSpline](sampleSpline.md))

### width

`number`

largura total (m)

### tileMeters?

`number` = `ROAD_DEFAULT_TILE_METERS`

metros por repetição da textura no comprimento

### gradeY?

readonly `number`[]

### lift?

`number` = `0`

## Returns

[`RoadRibbon`](../interfaces/RoadRibbon.md)

## Example

```ts
const r = roadRibbon(sampleSpline(pts), 8, 8, undefined, grade, 0.05)
```
