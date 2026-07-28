[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CharacterBodyComponent

# Class: CharacterBodyComponent

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L49)

**Corpo de personagem** (player/NPC) — uma **cápsula** com física vertical de
character controller (estilo UPBGE "Character"): gravidade, pulo (Jump Force /
Max Jumps), queda limitada (Fall Speed Max) e Step Height. Move-se no plano
(X/Z ou X/Y) por input próprio; o [CharacterPhysicsSystem](CharacterPhysicsSystem.md) cuida do Y
(gravidade/pulo) e o [TerrainCollisionSystem](TerrainCollisionSystem.md) o mantém EM CIMA do terreno
(anda em morros, não atravessa). O pivô fica nos **pés** (`transform.y` = base).

## Example

```ts
player.addComponent(new CharacterBodyComponent({ radius: 0.4, height: 1.8, jumpForce: 9 }))
// pular (ex.: no input de espaço):
player.getComponent(CharacterBodyComponent)!.jump()
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new CharacterBodyComponent**(`options?`): `CharacterBodyComponent`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L71)

#### Parameters

##### options?

[`CharacterBodyOptions`](../interfaces/CharacterBodyOptions.md) = `{}`

#### Returns

`CharacterBodyComponent`

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

### fallSpeedMax

> `readonly` **fallSpeedMax**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L55)

***

### footOffset

> **footOffset**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L60)

Distância da origem do mesh até os pés (base). `0` = origem nos pés.

***

### gravity

> `readonly` **gravity**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L52)

***

### grounded

> **grounded**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L65)

`true` quando os pés estão no chão (terreno/colisão). Zera os pulos.

***

### groundY

> **groundY**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L58)

Piso plano onde aterra (sem raycast). `-Infinity` = sem piso.

***

### height

> `readonly` **height**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L51)

***

### jumpForce

> `readonly` **jumpForce**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L54)

***

### jumpQueued

> **jumpQueued**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L69)

Pedido de pulo pendente (consumido pelo [CharacterPhysicsSystem](CharacterPhysicsSystem.md)).

***

### jumpsUsed

> **jumpsUsed**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L67)

Pulos já usados desde o último contato com o chão.

***

### maxJumps

> `readonly` **maxJumps**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L56)

***

### radius

> `readonly` **radius**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L50)

***

### stepHeight

> `readonly` **stepHeight**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L53)

***

### velocityY

> **velocityY**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L63)

Velocidade vertical atual (unidades/s). Integrada pela gravidade/pulo.

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

## Methods

### jump()

> **jump**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/CharacterBodyComponent.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L85)

Pede um pulo — aplicado no próximo tick se ainda houver pulos disponíveis.

#### Returns

`void`
