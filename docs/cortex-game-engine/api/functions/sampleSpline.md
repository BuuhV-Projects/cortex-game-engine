[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / sampleSpline

# Function: sampleSpline()

> **sampleSpline**(`nodes`, `stepsPerSegment?`): [`RoadSample`](../interfaces/RoadSample.md)[]

Defined in: [src/road/RoadSpline.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadSpline.ts#L55)

Amostra a spline que passa pelos `nodes` (≥2). `stepsPerSegment` = densidade de
amostras por segmento entre dois nós (default 12). Os extremos são duplicados
(clamp) pra a curva começar/terminar exatamente nos nós das pontas.

## Parameters

### nodes

`Vec3`[]

### stepsPerSegment?

`number` = `12`

## Returns

[`RoadSample`](../interfaces/RoadSample.md)[]

lista de [RoadSample](../interfaces/RoadSample.md) do início ao fim (inclui os dois extremos).
