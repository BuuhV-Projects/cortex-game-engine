[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleLean

# Class: VehicleLean

Defined in: [src/physics/VehicleLean.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleLean.ts#L45)

Inclina um nó visual conforme a curva do veículo.

## Example

```ts
// jogador: pela opção do VehicleControlSystem
new VehicleControlSystem(physics, vehicle, motoMesh, camera, gamepad, input, { lean: { object: 'Body' } });
// frota: no componente
arcadeComponent.lean = new VehicleLean(motoMesh.getObjectByName('Body')!, { maxLean: 0.5 });
```

## Constructors

### Constructor

> **new VehicleLean**(`object`, `options?`): `VehicleLean`

Defined in: [src/physics/VehicleLean.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleLean.ts#L53)

#### Parameters

##### object

`Object3D`

Nó FILHO da malha do chassi (a raiz recebe a pose do corpo e perderia a rotação).

##### options?

[`VehicleLeanOptions`](../interfaces/VehicleLeanOptions.md) = `{}`

#### Returns

`VehicleLean`

## Properties

### angle

> **angle**: `number` = `0`

Defined in: [src/physics/VehicleLean.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleLean.ts#L47)

Inclinação atual (rad, em torno do +Z local; positivo tomba para a direita do piloto).

***

### object

> `readonly` **object**: `Object3D`

Defined in: [src/physics/VehicleLean.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleLean.ts#L55)

Nó FILHO da malha do chassi (a raiz recebe a pose do corpo e perderia a rotação).

## Methods

### update()

> **update**(`vehicle`, `dt`): `void`

Defined in: [src/physics/VehicleLean.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleLean.ts#L65)

Aproxima a inclinação do alvo deste quadro e grava no nó. `dt` em segundos.

#### Parameters

##### vehicle

[`VehicleLeanSource`](../type-aliases/VehicleLeanSource.md)

##### dt

`number`

#### Returns

`void`
