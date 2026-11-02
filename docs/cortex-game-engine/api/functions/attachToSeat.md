[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / attachToSeat

# Function: attachToSeat()

> **attachToSeat**(`vehicle`, `seatName`, `driver`): `Object3D`

Defined in: [src/systems/VehicleDriverSystem.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleDriverSystem.ts#L98)

Parenteia `driver` no anchor `seatName` de `vehicle` e devolve o anchor.
**Lança** com os nomes disponíveis se o anchor não existir — use no
carregamento. Offset/rotação/escala ficam a cargo do componente.

## Parameters

### vehicle

`Object3D`

### seatName

`string`

### driver

`Object3D`

## Returns

`Object3D`
