[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptComponent

# Class: ScriptComponent

Defined in: src/components/ScriptComponent.ts:27

Componente que carrega **um ou mais scripts** ([ScriptBehavior](ScriptBehavior.md)) anexados a um nó —
ADR-0085. O [ScriptHostSystem](ScriptHostSystem.md) instancia/roda os slots; o `object` é o `Object3D` do
nó (injetado nos scripts como `this.object3d`). Um nó tem **um** ScriptComponent com N slots
(igual aos vários componentes de um GameObject na Unity).

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new ScriptComponent**(`object`, `scripts?`): `ScriptComponent`

Defined in: src/components/ScriptComponent.ts:30

#### Parameters

##### object

`Object3D`\<`Object3DEventMap`\> \| `null`

O `Object3D` do nó (injetado nos scripts como `object3d`).

##### scripts?

[`ScriptDecl`](../interfaces/ScriptDecl.md)[] = `[]`

#### Returns

`ScriptComponent`

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

> **object**: `Object3D`\<`Object3DEventMap`\> \| `null`

Defined in: src/components/ScriptComponent.ts:32

O `Object3D` do nó (injetado nos scripts como `object3d`).

***

### scripts

> **scripts**: [`ScriptSlot`](../interfaces/ScriptSlot.md)[]

Defined in: src/components/ScriptComponent.ts:28

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
