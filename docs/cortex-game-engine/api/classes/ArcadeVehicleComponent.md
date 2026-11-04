[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ArcadeVehicleComponent

# Class: ArcadeVehicleComponent

Defined in: [src/components/ArcadeVehicleComponent.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L35)

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

// trilho cinemático: o jogo escreve a malha e o sistema pula o carro (SPEC-0687)
component.poseOwner = 'external';
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new ArcadeVehicleComponent**(`vehicle`, `adhesion?`): `ArcadeVehicleComponent`

Defined in: [src/components/ArcadeVehicleComponent.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L47)

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

Defined in: [src/components/ArcadeVehicleComponent.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L50)

Aderência arcade. `null` = simulação pura, ainda no passo compartilhado.

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### restingPoseCopied

> **restingPoseCopied**: `boolean` = `false`

Defined in: [src/components/ArcadeVehicleComponent.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L39)

Dormindo, a pose final já foi copiada para a malha (SPEC-0655/0687): não copia de novo até acordar.

***

### restSteps

> **restSteps**: `number` = `0`

Defined in: [src/components/ArcadeVehicleComponent.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L37)

Subpassos seguidos em repouso; ao chegar em `REST_STEPS` o chassi dorme (SPEC-0655).

***

### vehicle

> `readonly` **vehicle**: [`Vehicle`](Vehicle.md)

Defined in: [src/components/ArcadeVehicleComponent.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L48)

## Accessors

### poseOwner

#### Get Signature

> **get** **poseOwner**(): [`VehiclePoseOwner`](../type-aliases/VehiclePoseOwner.md)

Defined in: [src/components/ArcadeVehicleComponent.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L60)

Quem escreve a pose da malha (SPEC-0687; padrão `'physics'`). Voltar para `'physics'` copia a pose do corpo
já no próximo `update`, mesmo dormindo. Use `'external'` para corpo cinemático ou congelado: dinâmico marcado
assim continua no Rapier, mas sem controlador e sem a malha seguir.

##### Returns

[`VehiclePoseOwner`](../type-aliases/VehiclePoseOwner.md)

#### Set Signature

> **set** **poseOwner**(`owner`): `void`

Defined in: [src/components/ArcadeVehicleComponent.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L64)

##### Parameters

###### owner

[`VehiclePoseOwner`](../type-aliases/VehiclePoseOwner.md)

##### Returns

`void`

***

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

***

### poseOwnerVersion

#### Get Signature

> **get** `static` **poseOwnerVersion**(): `number`

Defined in: [src/components/ArcadeVehicleComponent.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L43)

Versão das trocas de [ArcadeVehicleComponent.poseOwner](#poseowner) de todos os carros (SPEC-0687).

##### Returns

`number`
