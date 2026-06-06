[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlatformerBodyComponent

# Class: PlatformerBodyComponent

Defined in: src/components/PlatformerBodyComponent.ts:11

Corpo de plataforma (o "ator" que se move): velocidade no plano XY, estado de
chão, e a **intenção** de movimento (preenchida por um sistema de input ou
pela IA a cada frame). O [PlatformerPhysicsSystem](PlatformerPhysicsSystem.md) integra gravidade,
movimento e colisão AABB. Tunables de plataformer (pulo/gravidade) ficam aqui.

Convenção: Y para cima (pulo = `vy` positivo; gravidade reduz `vy`).

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new PlatformerBodyComponent**(`moveSpeed?`, `jumpSpeed?`, `gravity?`, `maxFall?`): `PlatformerBodyComponent`

Defined in: src/components/PlatformerBodyComponent.ts:24

#### Parameters

##### moveSpeed?

`number` = `8`

Velocidade de corrida (unidades/seg).

##### jumpSpeed?

`number` = `14`

Velocidade inicial do pulo (unidades/seg).

##### gravity?

`number` = `40`

Aceleração da gravidade (unidades/seg²).

##### maxFall?

`number` = `25`

Velocidade de queda máxima (terminal).

#### Returns

`PlatformerBodyComponent`

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

### gravity

> **gravity**: `number` = `40`

Defined in: src/components/PlatformerBodyComponent.ts:30

Aceleração da gravidade (unidades/seg²).

***

### grounded

> **grounded**: `boolean` = `false`

Defined in: src/components/PlatformerBodyComponent.ts:17

`true` se está apoiado no chão neste frame.

***

### jumpQueued

> **jumpQueued**: `boolean` = `false`

Defined in: src/components/PlatformerBodyComponent.ts:22

Intenção de pulo neste frame (consumida pelo sistema).

***

### jumpSpeed

> **jumpSpeed**: `number` = `14`

Defined in: src/components/PlatformerBodyComponent.ts:28

Velocidade inicial do pulo (unidades/seg).

***

### maxFall

> **maxFall**: `number` = `25`

Defined in: src/components/PlatformerBodyComponent.ts:32

Velocidade de queda máxima (terminal).

***

### moveDir

> **moveDir**: `number` = `0`

Defined in: src/components/PlatformerBodyComponent.ts:20

Intenção horizontal: -1 (esquerda), 0, 1 (direita).

***

### moveSpeed

> **moveSpeed**: `number` = `8`

Defined in: src/components/PlatformerBodyComponent.ts:26

Velocidade de corrida (unidades/seg).

***

### vx

> **vx**: `number` = `0`

Defined in: src/components/PlatformerBodyComponent.ts:13

Velocidade horizontal (X), unidades/seg. Derivada de `moveDir`.

***

### vy

> **vy**: `number` = `0`

Defined in: src/components/PlatformerBodyComponent.ts:15

Velocidade vertical (Y), unidades/seg.

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
