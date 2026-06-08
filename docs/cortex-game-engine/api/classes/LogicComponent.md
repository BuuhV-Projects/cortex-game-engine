[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / LogicComponent

# Class: LogicComponent

Defined in: src/components/LogicComponent.ts:9

Bricks de lógica de um objeto (sensores/controllers/actuators) — ver
[LogicBricksSystem](LogicBricksSystem.md). Só dados; o `_prevKey` é estado de edge (frame
anterior) gerenciado pelo system.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new LogicComponent**(`logic`): `LogicComponent`

Defined in: src/components/LogicComponent.ts:13

#### Parameters

##### logic

###### actuators

(\{ `id`: `string`; `loc?`: \[`number`, `number`, `number`\]; `perSecond?`: `boolean`; `rot?`: \[`number`, `number`, `number`\]; `type`: `"motion"`; \} \| \{ `clip`: `string`; `id`: `string`; `loop?`: `boolean`; `type`: `"animation"`; \})[] = `...`

###### controllers

`object`[] = `...`

###### sensors

(\{ `id`: `string`; `type`: `"always"`; \} \| \{ `edge?`: `boolean`; `id`: `string`; `key`: `string`; `type`: `"key"`; \})[] = `...`

#### Returns

`LogicComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### \_prevKey

> **\_prevKey**: `Record`\<`string`, `boolean`\> = `{}`

Defined in: src/components/LogicComponent.ts:11

Estado anterior de teclas pra sensores `edge` (gerenciado pelo system).

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### logic

> **logic**: `object`

Defined in: src/components/LogicComponent.ts:13

#### actuators

> **actuators**: (\{ `id`: `string`; `loc?`: \[`number`, `number`, `number`\]; `perSecond?`: `boolean`; `rot?`: \[`number`, `number`, `number`\]; `type`: `"motion"`; \} \| \{ `clip`: `string`; `id`: `string`; `loop?`: `boolean`; `type`: `"animation"`; \})[]

#### controllers

> **controllers**: `object`[]

#### sensors

> **sensors**: (\{ `id`: `string`; `type`: `"always"`; \} \| \{ `edge?`: `boolean`; `id`: `string`; `key`: `string`; `type`: `"key"`; \})[]

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
