[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehiclePhysics

# Class: VehiclePhysics

Defined in: [src/physics/VehiclePhysics.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L42)

Agrupador da física cinemática de veículo: registra no `World` a gravidade +
ground-snap ([VehicleGravitySystem](VehicleGravitySystem.md)) e a colisão lateral com deslize
([VehicleWallCollisionSystem](VehicleWallCollisionSystem.md)), contra a mesma mesh de `ground`, com
opções compartilhadas.

Opera sobre entidades com `TransformComponent` + `KinematicBodyComponent`.

## Example

```ts
const physics = new VehiclePhysics(world, track.root, {
  gravity: { onFallOff: (e) => respawn(e) },
  wall: { halfLength: 2.2, halfWidth: 1.1 },
  pauseWhen: () => editor.active,
})
```

## Constructors

### Constructor

> **new VehiclePhysics**(`world`, `ground`, `options?`): `VehiclePhysics`

Defined in: [src/physics/VehiclePhysics.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L46)

#### Parameters

##### world

[`World`](World.md)

##### ground

`Object3D`

##### options?

[`VehiclePhysicsOptions`](../interfaces/VehiclePhysicsOptions.md) = `{}`

#### Returns

`VehiclePhysics`

## Properties

### gravity

> `readonly` **gravity**: [`VehicleGravitySystem`](VehicleGravitySystem.md)

Defined in: [src/physics/VehiclePhysics.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L43)

***

### wallCollision

> `readonly` **wallCollision**: [`VehicleWallCollisionSystem`](VehicleWallCollisionSystem.md)

Defined in: [src/physics/VehiclePhysics.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L44)
