[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Object3DComponent

# Class: Object3DComponent

Defined in: [src/components/Object3DComponent.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Object3DComponent.ts#L10)

Liga uma entidade ao seu `Object3D` (Mesh/Group) na cena Three.js.

O `Object3DSyncSystem` copia o `TransformComponent` da entidade para
`object.position` / `object.rotation.y` a cada frame.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new Object3DComponent**(`object`): `Object3DComponent`

Defined in: [src/components/Object3DComponent.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Object3DComponent.ts#L11)

#### Parameters

##### object

`Object3D`

#### Returns

`Object3DComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### object

> **object**: `Object3D`

Defined in: [src/components/Object3DComponent.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Object3DComponent.ts#L11)

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
