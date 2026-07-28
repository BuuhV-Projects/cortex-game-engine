[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / KinematicBodyComponent

# Class: KinematicBodyComponent

Defined in: [.claude/worktrees/feat-input-rebind/src/components/KinematicBodyComponent.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/KinematicBodyComponent.ts#L14)

Estado cinemático de uma entidade movida por raycast (não por impulso).

Usado pelos sistemas de `src/physics/` (gravidade + ground-snap, colisão
lateral). É a generalização do antigo acoplamento a `VehicleComponent`
(`velocityY` / `grounded` / `speed`), pra que qualquer entidade — não só
veículos — possa cair, grudar no chão e raspar em paredes.

Diferente do `RigidBodyComponent` (src/core/Physics.ts), que é resolvido
por impulso/AABB. Os dois podem coexistir em entidades distintas.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new KinematicBodyComponent**(): `KinematicBodyComponent`

#### Returns

`KinematicBodyComponent`

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

### grounded

> **grounded**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/KinematicBodyComponent.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/KinematicBodyComponent.ts#L19)

`true` quando o último ground-snap encostou a entidade no chão.

***

### horizontalSpeed

> **horizontalSpeed**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/KinematicBodyComponent.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/KinematicBodyComponent.ts#L22)

Velocidade horizontal em unidades/s, no eixo do heading (`TransformComponent.rotationY`).

***

### velocityY

> **velocityY**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/KinematicBodyComponent.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/KinematicBodyComponent.ts#L16)

Velocidade vertical em unidades/s. Positivo = subindo. Integrada pela gravidade.

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
