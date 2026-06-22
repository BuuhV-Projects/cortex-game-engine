[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / sampleSpline

# Function: sampleSpline()

> **sampleSpline**(`nodes`, `curveDensity?`): [`RoadSample`](../interfaces/RoadSample.md)[]

Defined in: [src/road/RoadSpline.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadSpline.ts#L77)

Amostra a spline que passa pelos `nodes` (≥2) com **tessellation adaptativa**:
`curveDensity` = amostras por **90° de curvatura** (default 16) — curvas fechadas
ganham mais faces (sem facetar), retas usam poucas (1 a cada ~2 m, pra seguir o
terreno). Os extremos são duplicados (clamp) pra começar/terminar nos nós das pontas.

## Parameters

### nodes

`Vec3`[]

### curveDensity?

`number` = `16`

## Returns

[`RoadSample`](../interfaces/RoadSample.md)[]

lista de [RoadSample](../interfaces/RoadSample.md) do início ao fim (inclui os dois extremos).
