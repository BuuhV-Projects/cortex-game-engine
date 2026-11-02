[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GroundAdhesionOptions

# Interface: GroundAdhesionOptions

Defined in: [src/physics/GroundAdhesion.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/GroundAdhesion.ts#L41)

## Properties

### airborneProbe?

> `optional` **airborneProbe?**: `number`

Defined in: [src/physics/GroundAdhesion.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/GroundAdhesion.ts#L49)

Alcance do raio abaixo da base quando o carro já está no ar (m). Default 0,12.

***

### minNormalY?

> `optional` **minNormalY?**: `number`

Defined in: [src/physics/GroundAdhesion.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/GroundAdhesion.ts#L47)

`y` mínimo da normal do plano de apoio — inclinação máxima dirigível. Default 0,55 (~57°).

***

### probeRise?

> `optional` **probeRise?**: `number`

Defined in: [src/physics/GroundAdhesion.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/GroundAdhesion.ts#L45)

Quanto acima da base do pneu o raio nasce (m). Default 0,45.

***

### snapDistance?

> `optional` **snapDistance?**: `number`

Defined in: [src/physics/GroundAdhesion.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/GroundAdhesion.ts#L43)

Quanto o chão pode "puxar" o carro por passo (m). Maior salto = solta. Default 0,65.
