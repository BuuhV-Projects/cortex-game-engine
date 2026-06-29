[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RoadProfile

# Interface: RoadProfile

Defined in: [src/road/profiles.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/profiles.ts#L36)

Um perfil completo: faixas + raio mínimo de curva + superfície/marcação default.

## Properties

### lanes

> **lanes**: [`ProfileLane`](ProfileLane.md)[]

Defined in: [src/road/profiles.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/profiles.ts#L38)

***

### minRadius

> **minRadius**: `number`

Defined in: [src/road/profiles.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/profiles.ts#L40)

Raio mínimo de curva (m) — orienta o traçado, não trava.

***

### name

> **name**: [`RoadProfileName`](../type-aliases/RoadProfileName.md)

Defined in: [src/road/profiles.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/profiles.ts#L37)

***

### surface

> **surface**: [`RoadSurfaceName`](../type-aliases/RoadSurfaceName.md)

Defined in: [src/road/profiles.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/profiles.ts#L42)

Superfície default da pista (faixas sem `surface` própria).
