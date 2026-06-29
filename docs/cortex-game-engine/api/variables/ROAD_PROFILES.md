[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ROAD\_PROFILES

# Variable: ROAD\_PROFILES

> `const` **ROAD\_PROFILES**: `Record`\<[`RoadProfileName`](../type-aliases/RoadProfileName.md), [`RoadProfile`](../interfaces/RoadProfile.md)\>

Defined in: src/road/profiles.ts:57

**Catálogo dos 9 perfis** (ADR-0087). Larguras em metros (total = soma das faixas). Stylized:
use com `matte` + `surfaces` tiláveis. Pista = `roadway`/`shoulder` (drivable), calçada =
`sidewalk` (walkable), `pedestrian_market` não tem pista (carro barrado).
