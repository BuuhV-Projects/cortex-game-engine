[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Collider2DComponent

# Class: Collider2DComponent

Defined in: src/components/Collider2DComponent.ts:12

Caixa de colisão AABB no plano **XY** (plataforma 2.5D), centrada na posição
do [TransformComponent](TransformComponent.md) da entidade. `solid` = participa da colisão
(chão/parede/plataforma); `oneWay` = plataforma atravessável por baixo (só
pousa vindo de cima). Usado pelo [PlatformerPhysicsSystem](PlatformerPhysicsSystem.md).

Distinto do `ColliderComponent` 3D (box/sphere/capsule) do physics de impulso
(`core/Physics`) — este é o collider simples 2D do plataformer.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new Collider2DComponent**(`halfWidth?`, `halfHeight?`, `solid?`, `oneWay?`): `Collider2DComponent`

Defined in: src/components/Collider2DComponent.ts:13

#### Parameters

##### halfWidth?

`number` = `0.5`

Metade da largura (X).

##### halfHeight?

`number` = `0.5`

Metade da altura (Y).

##### solid?

`boolean` = `true`

Participa da colisão como sólido (chão/parede/plataforma).

##### oneWay?

`boolean` = `false`

Plataforma de mão única: só colide vindo de cima (atravessa por baixo).

#### Returns

`Collider2DComponent`

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

### halfHeight

> **halfHeight**: `number` = `0.5`

Defined in: src/components/Collider2DComponent.ts:17

Metade da altura (Y).

***

### halfWidth

> **halfWidth**: `number` = `0.5`

Defined in: src/components/Collider2DComponent.ts:15

Metade da largura (X).

***

### oneWay

> **oneWay**: `boolean` = `false`

Defined in: src/components/Collider2DComponent.ts:21

Plataforma de mão única: só colide vindo de cima (atravessa por baixo).

***

### solid

> **solid**: `boolean` = `true`

Defined in: src/components/Collider2DComponent.ts:19

Participa da colisão como sólido (chão/parede/plataforma).

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
