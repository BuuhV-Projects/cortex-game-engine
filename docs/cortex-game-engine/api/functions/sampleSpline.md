[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / sampleSpline

# Function: sampleSpline()

> **sampleSpline**(`points`, `curveDensity?`): [`RoadSample`](../interfaces/RoadSample.md)[]

Defined in: src/road/RoadSpline.ts:80

Amostra a spline que passa pelos `points` (≥2) com **tessellation adaptativa**
(`curveDensity` amostras por 90° de curva). Pontas presas no primeiro/último ponto.

## Parameters

### points

readonly [`RoadVec3`](../type-aliases/RoadVec3.md)[]

### curveDensity?

`number` = `ROAD_DEFAULT_CURVE_DENSITY`

## Returns

[`RoadSample`](../interfaces/RoadSample.md)[]

amostras do início ao fim (inclui os dois extremos). Com <2 pontos devolve
os pontos como vieram (tangente +Z).

## Example

```ts
const s = sampleSpline([[0, 0, 0], [0, 0, 30], [20, 0, 60]])
s[0].pos // [0, 0, 0]
```
