[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ArcadeVehicleComponent

# Class: ArcadeVehicleComponent

Defined in: src/components/ArcadeVehicleComponent.ts:20

Um carro da frota do [VehicleArcadeSystem](VehicleArcadeSystem.md) (SPEC-0259).

Junto de um `Object3DComponent` (a malha do chassi). O sistema avança o mundo
uma vez por passo para todos os carros e escreve a pose do chassi na malha.

Quem dirige (o input do jogador, um `ScriptBehavior` de IA) só escreve em
`vehicle.setEngineForce/setBrake/setSteering`.

## Example

```ts
const vehicle = physics.createVehicle(spec);
entity
  .addComponent(new Object3DComponent(carMesh))
  .addComponent(new ArcadeVehicleComponent(vehicle, new GroundAdhesion(physics, vehicle)));
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new ArcadeVehicleComponent**(`vehicle`, `adhesion?`): `ArcadeVehicleComponent`

Defined in: src/components/ArcadeVehicleComponent.ts:21

#### Parameters

##### vehicle

[`Vehicle`](Vehicle.md)

##### adhesion?

[`GroundAdhesion`](GroundAdhesion.md) \| `null`

Aderência arcade. `null` = simulação pura, ainda no passo compartilhado.

#### Returns

`ArcadeVehicleComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### adhesion

> `readonly` **adhesion**: [`GroundAdhesion`](GroundAdhesion.md) \| `null` = `null`

Defined in: src/components/ArcadeVehicleComponent.ts:24

Aderência arcade. `null` = simulação pura, ainda no passo compartilhado.

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### vehicle

> `readonly` **vehicle**: [`Vehicle`](Vehicle.md)

Defined in: src/components/ArcadeVehicleComponent.ts:22

## Accessors

### type

#### Get Signature

> **get** **type**(): `string`

Defined in: [src/ecs/Component.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L16)

Identificador do tipo do componente.
Retorna o nome da classe construtora (ex: "TransformComponent").
Usado por Entity para indexar componentes no Map<string, Component>.

##### Returns

`string`

#### Inherited from

[`Component`](Component.md).[`type`](Component.md#type)
