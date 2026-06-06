[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Collider2DComponent

# Class: Collider2DComponent

Defined in: [src/components/Collider2DComponent.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L18)

Caixa de colisão AABB no plano **XY** (plataforma 2.5D), centrada na posição
do [TransformComponent](TransformComponent.md) da entidade **+ um offset** (`offsetX`/`offsetY`).
`solid` = participa da colisão (chão/parede/plataforma); `oneWay` = plataforma
atravessável por baixo (só pousa vindo de cima). Usado pelo
[PlatformerPhysicsSystem](PlatformerPhysicsSystem.md).

O **offset** permite que o collider seja uma **sub-região** do objeto sem
desacoplar a entidade: o collider mora na MESMA entidade do mesh (Object3D +
Transform) e movem juntos, mas pode cobrir só o "deck" (não os pilares) ou
compensar um pivô descentralizado do GLB. Offset `0` = centrado no Transform.

Distinto do `ColliderComponent` 3D (box/sphere/capsule) do physics de impulso
(`core/Physics`) — este é o collider simples 2D do plataformer.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new Collider2DComponent**(`halfWidth?`, `halfHeight?`, `solid?`, `oneWay?`, `offsetX?`, `offsetY?`): `Collider2DComponent`

Defined in: [src/components/Collider2DComponent.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L19)

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

##### offsetX?

`number` = `0`

Offset do centro do AABB em X, relativo ao Transform. Default `0`.

##### offsetY?

`number` = `0`

Offset do centro do AABB em Y, relativo ao Transform. Default `0`.

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

Defined in: [src/components/Collider2DComponent.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L23)

Metade da altura (Y).

***

### halfWidth

> **halfWidth**: `number` = `0.5`

Defined in: [src/components/Collider2DComponent.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L21)

Metade da largura (X).

***

### offsetX

> **offsetX**: `number` = `0`

Defined in: [src/components/Collider2DComponent.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L29)

Offset do centro do AABB em X, relativo ao Transform. Default `0`.

***

### offsetY

> **offsetY**: `number` = `0`

Defined in: [src/components/Collider2DComponent.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L31)

Offset do centro do AABB em Y, relativo ao Transform. Default `0`.

***

### oneWay

> **oneWay**: `boolean` = `false`

Defined in: [src/components/Collider2DComponent.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L27)

Plataforma de mão única: só colide vindo de cima (atravessa por baixo).

***

### solid

> **solid**: `boolean` = `true`

Defined in: [src/components/Collider2DComponent.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L25)

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
