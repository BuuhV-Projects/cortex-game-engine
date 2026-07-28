[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FollowCameraTargetComponent

# Class: FollowCameraTargetComponent

Defined in: [src/components/FollowCameraTargetComponent.ts:7](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/FollowCameraTargetComponent.ts#L7)

Marcador: a câmera de perseguição (`ThirdPersonCameraSystem`) segue a
entidade que tiver este componente. Espera-se no máximo uma por cena.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new FollowCameraTargetComponent**(): `FollowCameraTargetComponent`

#### Returns

`FollowCameraTargetComponent`

#### Inherited from

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

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
