[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Collider2DComponent

# Class: Collider2DComponent

Defined in: [src/components/Collider2DComponent.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L30)

Colisor 2D do plataformer (plano **XY**), centrado na posição do
[TransformComponent](TransformComponent.md) **+ um offset** (`offsetX`/`offsetY`). `shape` define
a forma (box/circle/capsule). `solid` = participa da colisão (chão/parede);
`oneWay` = plataforma atravessável por baixo (só pousa de cima). Usado pelo
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

> **new Collider2DComponent**(`halfWidth?`, `halfHeight?`, `solid?`, `oneWay?`, `offsetX?`, `offsetY?`, `shape?`): `Collider2DComponent`

Defined in: [src/components/Collider2DComponent.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L31)

#### Parameters

##### halfWidth?

`number` = `0.5`

Metade da largura (X) — também o **raio** quando `shape` é circle/capsule.

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

Offset do centro em X, relativo ao Transform. Default `0`.

##### offsetY?

`number` = `0`

Offset do centro em Y, relativo ao Transform. Default `0`.

##### shape?

[`ColliderShape2D`](../type-aliases/ColliderShape2D.md) = `'box'`

Forma do collider. Default `box`. Ver [ColliderShape2D](../type-aliases/ColliderShape2D.md).

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

Defined in: [src/components/Collider2DComponent.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L35)

Metade da altura (Y).

***

### halfWidth

> **halfWidth**: `number` = `0.5`

Defined in: [src/components/Collider2DComponent.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L33)

Metade da largura (X) — também o **raio** quando `shape` é circle/capsule.

***

### offsetX

> **offsetX**: `number` = `0`

Defined in: [src/components/Collider2DComponent.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L41)

Offset do centro em X, relativo ao Transform. Default `0`.

***

### offsetY

> **offsetY**: `number` = `0`

Defined in: [src/components/Collider2DComponent.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L43)

Offset do centro em Y, relativo ao Transform. Default `0`.

***

### oneWay

> **oneWay**: `boolean` = `false`

Defined in: [src/components/Collider2DComponent.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L39)

Plataforma de mão única: só colide vindo de cima (atravessa por baixo).

***

### shape

> **shape**: [`ColliderShape2D`](../type-aliases/ColliderShape2D.md) = `'box'`

Defined in: [src/components/Collider2DComponent.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L45)

Forma do collider. Default `box`. Ver [ColliderShape2D](../type-aliases/ColliderShape2D.md).

***

### solid

> **solid**: `boolean` = `true`

Defined in: [src/components/Collider2DComponent.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L37)

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
