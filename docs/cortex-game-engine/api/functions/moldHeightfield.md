[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / moldHeightfield

# Function: moldHeightfield()

> **moldHeightfield**(`grid`, `centerline`, `halfWidth`, `taludeWidth`, `shoulder?`): `Float32Array`

Defined in: [src/road/RoadGrade.ts:151](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L151)

**Molda o terreno à estrada** (cut & fill + ombro + talude). Para cada vértice da
grade, acha o ponto mais próximo do eixo da pista (`centerline`, coords locais com
Y = greide) e calcula a altura-alvo:
- dentro de `halfWidth + ombro` (**platô** = sob a pista + acostamento) → **greide**
  (o terreno fica cravado no nível da pista, **colado na borda** sem vão);
- no `taludeWidth` seguinte → `smoothstep` do greide → base;
- fora → base (delta 0).

O **ombro** é crucial: a grade do terreno costuma ser mais grossa que a pista, então
sem ele o vértice logo fora da borda cai no talude e o terreno "descola" da pista
(vão/penhasco na beira). O ombro estende o platô pelo menos ~1,5 célula da grade além
da borda, garantindo que a borda da pista sempre caia sobre terreno no nível do greide.

Devolve o **delta** (`alvo − base`) por vértice — somado à base pelo [Terrain](../classes/Terrain.md)
(não-destrutivo). Acumule deltas de várias estradas com [mergeDeltas](mergeDeltas.md).

Puro. `centerline` com <2 pontos = nenhuma moldagem (delta tudo 0). `shoulder` é o
acostamento mínimo (m); o efetivo é `max(shoulder, ~1,5 célula)` pra cobrir a grade.

## Parameters

### grid

[`HeightfieldGrid`](../interfaces/HeightfieldGrid.md)

### centerline

[`GradePoint`](../interfaces/GradePoint.md)[]

### halfWidth

`number`

### taludeWidth

`number`

### shoulder?

`number` = `0`

## Returns

`Float32Array`
