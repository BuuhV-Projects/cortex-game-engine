[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ProfileLane

# Interface: ProfileLane

Defined in: src/road/profiles.ts:9

**Seção transversal de uma via** (ADR-0087). Uma faixa do perfil, da esquerda pra direita;
a soma das larguras = largura total da via. Calçada e meio-fio são faixas (não código
especial): calçada = `height` ~0.15 + `walkable`; o meio-fio aparece como o **degrau
vertical automático** entre faixas de alturas diferentes (ver [profileMesh](../functions/profileMesh.md)).

## Properties

### drivable

> **drivable**: `boolean`

Defined in: src/road/profiles.ts:18

Entra no collider de PISTA do carro (`cortexRoad`).

***

### height

> **height**: `number`

Defined in: src/road/profiles.ts:14

Altura (Y) da faixa: 0 = pista; ~0.15 = calçada (degrau = meio-fio).

***

### role

> **role**: `"roadway"` \| `"sidewalk"` \| `"curb"` \| `"median"` \| `"shoulder"`

Defined in: src/road/profiles.ts:10

***

### surface?

> `optional` **surface?**: [`RoadSurfaceName`](../type-aliases/RoadSurfaceName.md)

Defined in: src/road/profiles.ts:16

Superfície (override do default da via).

***

### walkable

> **walkable**: `boolean`

Defined in: src/road/profiles.ts:20

Entra na navegação de PEDESTRE.

***

### width

> **width**: `number`

Defined in: src/road/profiles.ts:12

Largura da faixa em metros.
