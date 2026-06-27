[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / moldHeightfield

# Function: moldHeightfield()

> **moldHeightfield**(`grid`, `centerline`, `halfWidth`, `taludeWidth`): `Float32Array`

Defined in: [src/road/RoadGrade.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L143)

**Molda o terreno à estrada** (cut & fill + talude). Para cada vértice da grade,
acha o ponto mais próximo do eixo da pista (`centerline`, coords locais com Y =
greide) e calcula a altura-alvo:
- dentro de `halfWidth` (sob a pista) → **greide** (corta/aterra até a pista);
- dentro de `halfWidth + taludeWidth` (talude) → `smoothstep` do greide → base;
- fora → base (delta 0).

Devolve o **delta** (`alvo − base`) por vértice — somado à base pelo [Terrain](../classes/Terrain.md)
(não-destrutivo). Acumule deltas de várias estradas com [mergeDeltas](mergeDeltas.md).

Puro. `centerline` com <2 pontos = nenhuma moldagem (delta tudo 0).

## Parameters

### grid

[`HeightfieldGrid`](../interfaces/HeightfieldGrid.md)

### centerline

[`GradePoint`](../interfaces/GradePoint.md)[]

### halfWidth

`number`

### taludeWidth

`number`

## Returns

`Float32Array`
