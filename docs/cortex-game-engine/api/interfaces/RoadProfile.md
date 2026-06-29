[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RoadProfile

# Interface: RoadProfile

Defined in: src/road/profiles.ts:36

Um perfil completo: faixas + raio mínimo de curva + superfície/marcação default.

## Properties

### lanes

> **lanes**: [`ProfileLane`](ProfileLane.md)[]

Defined in: src/road/profiles.ts:38

***

### minRadius

> **minRadius**: `number`

Defined in: src/road/profiles.ts:40

Raio mínimo de curva (m) — orienta o traçado, não trava.

***

### name

> **name**: [`RoadProfileName`](../type-aliases/RoadProfileName.md)

Defined in: src/road/profiles.ts:37

***

### surface

> **surface**: [`RoadSurfaceName`](../type-aliases/RoadSurfaceName.md)

Defined in: src/road/profiles.ts:42

Superfície default da pista (faixas sem `surface` própria).
