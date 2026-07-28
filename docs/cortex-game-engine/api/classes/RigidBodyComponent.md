[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RigidBodyComponent

# Class: RigidBodyComponent

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L37)

Componente que armazena o estado físico de uma entidade.

`position` representa o centro de massa do corpo no espaço mundial.
`velocity` é expresso em unidades/s — o `PhysicsSystem` converte `deltaTime`
de ms para segundos antes de integrar.

Quando a entidade também possui um componente de transform de renderização,
cabe ao usuário sincronizar `position` com ele após cada tick de física.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new RigidBodyComponent**(): `RigidBodyComponent`

#### Returns

`RigidBodyComponent`

#### Inherited from

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### isStatic

> **isStatic**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L48)

Quando `true`, o corpo não é movido nem recebe gravidade.
Ainda participa da detecção de colisão (comporta-se como superfície sólida).

***

### mass

> **mass**: `number` = `1`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L43)

Massa do corpo em kg. Ignorada se `isStatic` for `true`.

***

### position

> **position**: `Vec3`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L39)

Centro de massa do corpo no espaço mundial.

***

### velocity

> **velocity**: `Vec3`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L41)

Velocidade linear em unidades/s.

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
