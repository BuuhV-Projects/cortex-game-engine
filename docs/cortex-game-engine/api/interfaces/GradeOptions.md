[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GradeOptions

# Interface: GradeOptions

Defined in: [src/road/RoadGrade.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L16)

Opções do greide suavizado.

## Properties

### maxSlope?

> `optional` **maxSlope?**: `number`

Defined in: [src/road/RoadGrade.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L23)

Inclinação **máxima** do greide (Δaltura / Δhorizontal). Default `0.25` (25% —
deixa a estrada **subir o morro** fazendo ladeira, escavando só um canal). Valores
baixos (ex. 0.08) deixam a pista mais plana mas **aplainam o relevo**; altos seguem
mais o terreno. O greide nunca sobe/desce mais íngreme que isso.

***

### smoothMeters?

> `optional` **smoothMeters?**: `number`

Defined in: [src/road/RoadGrade.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L29)

Janela da média móvel em **metros** (alisa bossas pequenas antes do clamp de
inclinação). Default `12`. Maior = greide mais reto (mais cut & fill); menor =
acompanha mais o relevo.
