[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditableTargetComponent

# Class: EditableTargetComponent

Defined in: [src/components/EditableTargetComponent.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/EditableTargetComponent.ts#L8)

Marcador: entidades editáveis no modo editor. O `EditorMode` usa este
componente para descobrir o que pode ser teleportado/manipulado de forma
genérica, sem o engine conhecer tipos específicos de jogo (ex.: veículo).

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new EditableTargetComponent**(): `EditableTargetComponent`

#### Returns

`EditableTargetComponent`

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
