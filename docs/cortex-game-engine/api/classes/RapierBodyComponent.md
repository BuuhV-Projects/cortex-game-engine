[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierBodyComponent

# Class: RapierBodyComponent

Defined in: [src/components/RapierBodyComponent.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L43)

**Corpo físico do Rapier** como componente (ADR-0061): declara que o objeto é um
corpo (rígido) — tipo + forma + material. O [RapierPhysicsSystem](RapierPhysicsSystem.md) cria o
corpo no Rapier preguiçosamente (a partir da pose atual do `Object3D`) e passa a
**escrever o transform do `Object3D`** a partir da simulação (o Rapier é o dono).

## Example

```ts
const e = world.createEntity()
e.addComponent(new Object3DComponent(mesh))
e.addComponent(new RapierBodyComponent({ bodyType: 'dynamic', shape: { kind: 'auto' } }))
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new RapierBodyComponent**(`options?`): `RapierBodyComponent`

Defined in: [src/components/RapierBodyComponent.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L53)

#### Parameters

##### options?

[`RapierBodyOptions`](../interfaces/RapierBodyOptions.md) = `{}`

#### Returns

`RapierBodyComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### body

> **body**: [`PhysicsBody`](../interfaces/PhysicsBody.md) \| `null` = `null`

Defined in: [src/components/RapierBodyComponent.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L51)

Handle do corpo no Rapier — criado pelo [RapierPhysicsSystem](RapierPhysicsSystem.md). `null` até criar.

***

### bodyType

> **bodyType**: [`RapierBodyType`](../type-aliases/RapierBodyType.md)

Defined in: [src/components/RapierBodyComponent.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L45)

Tipo do corpo (dynamic/fixed/kinematic). NÃO usar `type` (colide com a base ECS).

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### friction?

> `optional` **friction?**: `number`

Defined in: [src/components/RapierBodyComponent.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L48)

***

### isSensor

> **isSensor**: `boolean`

Defined in: [src/components/RapierBodyComponent.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L49)

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [src/components/RapierBodyComponent.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L47)

***

### shape

> **shape**: [`RapierBodyShape`](../type-aliases/RapierBodyShape.md)

Defined in: [src/components/RapierBodyComponent.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L46)

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
