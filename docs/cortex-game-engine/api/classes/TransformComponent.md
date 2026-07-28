[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TransformComponent

# Class: TransformComponent

Defined in: [.claude/worktrees/feat-input-rebind/src/components/TransformComponent.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/TransformComponent.ts#L15)

Transform "lógico" de uma entidade no plano XZ + altura Y.

Mantém a posição e o heading (yaw) como dados puros, desacoplados do
`Object3D` de renderização — o `Object3DSyncSystem` copia este estado para
o mesh a cada frame. `rotationY` em radianos; sentido positivo gira
anti-horário visto de cima (convenção three.js).

Pitch/roll (inclinação no terreno) NÃO ficam aqui — vivem no
`GroundConformComponent` e são aplicados direto no `Object3D`, pois são
efeito visual derivado, não estado de gameplay.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new TransformComponent**(`x?`, `y?`, `z?`, `rotationY?`): `TransformComponent`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/TransformComponent.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/TransformComponent.ts#L16)

#### Parameters

##### x?

`number` = `0`

##### y?

`number` = `0`

##### z?

`number` = `0`

##### rotationY?

`number` = `0`

#### Returns

`TransformComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### rotationY

> **rotationY**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/TransformComponent.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/TransformComponent.ts#L20)

***

### x

> **x**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/TransformComponent.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/TransformComponent.ts#L17)

***

### y

> **y**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/TransformComponent.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/TransformComponent.ts#L18)

***

### z

> **z**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/TransformComponent.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/TransformComponent.ts#L19)

## Accessors

### type

#### Get Signature

> **get** **type**(): `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Component.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L16)

Identificador do tipo do componente.
Retorna o nome da classe construtora (ex: "TransformComponent").
Usado por Entity para indexar componentes no Map<string, Component>.

##### Returns

`string`

#### Inherited from

[`Component`](Component.md).[`type`](Component.md#type)
