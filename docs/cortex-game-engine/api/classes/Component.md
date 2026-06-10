[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Component

# Class: Component

Defined in: [src/ecs/Component.ts:7](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L7)

Classe base para todos os componentes do sistema ECS.

Subclasses devem carregar apenas dados (ex: TransformComponent, MeshComponent).
A lógica pertence aos Systems — vide ADR-0002.

## Extended by

- [`RigidBodyComponent`](RigidBodyComponent.md)
- [`ColliderComponent`](ColliderComponent.md)
- [`TransformComponent`](TransformComponent.md)
- [`Object3DComponent`](Object3DComponent.md)
- [`KinematicBodyComponent`](KinematicBodyComponent.md)
- [`FollowCameraTargetComponent`](FollowCameraTargetComponent.md)
- [`EditableTargetComponent`](EditableTargetComponent.md)
- [`Collider2DComponent`](Collider2DComponent.md)
- [`PlatformerBodyComponent`](PlatformerBodyComponent.md)
- [`PlayerAnimatorComponent`](PlayerAnimatorComponent.md)
- [`SpriteAnimationComponent`](SpriteAnimationComponent.md)
- [`TerrainComponent`](TerrainComponent.md)

## Constructors

### Constructor

> **new Component**(): `Component`

#### Returns

`Component`

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

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
