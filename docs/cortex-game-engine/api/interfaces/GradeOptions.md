[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GradeOptions

# Interface: GradeOptions

Defined in: [src/road/RoadGrade.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L16)

Opções do greide suavizado.

## Properties

### maxSlope?

> `optional` **maxSlope?**: `number`

Defined in: [src/road/RoadGrade.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L22)

Inclinação **máxima** do greide (Δaltura / Δhorizontal). Default `0.08` (8% —
limite confortável pra estrada). O greide nunca sobe/desce mais íngreme que isso,
cortando/aterrando o terreno pra compensar.

***

### smoothMeters?

> `optional` **smoothMeters?**: `number`

Defined in: [src/road/RoadGrade.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L28)

Janela da média móvel em **metros** (alisa bossas pequenas antes do clamp de
inclinação). Default `12`. Maior = greide mais reto (mais cut & fill); menor =
acompanha mais o relevo.
