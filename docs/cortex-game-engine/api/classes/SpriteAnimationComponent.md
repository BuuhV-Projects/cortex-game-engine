[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SpriteAnimationComponent

# Class: SpriteAnimationComponent

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L21)

Estado de **animação de sprite** (spritesheet). Vai numa entidade ECS junto do
`Object3DComponent` do sprite; o [SpriteAnimationSystem](SpriteAnimationSystem.md) avança os frames
e aplica o recorte UV na `texture` (clonada do sprite). Troque a animação com
[SpriteAnimationComponent.play](#play) (ex.: `idle` → `run` → `jump`).

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new SpriteAnimationComponent**(`sheet`, `anims`, `texture`, `initial?`): `SpriteAnimationComponent`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L29)

#### Parameters

##### sheet

[`Spritesheet`](Spritesheet.md)

A spritesheet (grade de frames).

##### anims

`Record`\<`string`, [`SpriteAnim`](../interfaces/SpriteAnim.md)\>

Animações nomeadas.

##### texture

`Texture`

Textura do sprite (clonada da sheet) onde o frame é aplicado.

##### initial?

`string`

Animação inicial.

#### Returns

`SpriteAnimationComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### anims

> `readonly` **anims**: `Record`\<`string`, [`SpriteAnim`](../interfaces/SpriteAnim.md)\>

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L33)

Animações nomeadas.

***

### current

> **current**: `string` \| `null` = `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L23)

Nome da animação atual (ou `null`).

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### frameIndex

> **frameIndex**: `number` = `-1`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L27)

Índice do frame atual DENTRO da animação (não o índice na sheet).

***

### sheet

> `readonly` **sheet**: [`Spritesheet`](Spritesheet.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L31)

A spritesheet (grade de frames).

***

### texture

> `readonly` **texture**: `Texture`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L35)

Textura do sprite (clonada da sheet) onde o frame é aplicado.

***

### time

> **time**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L25)

Tempo acumulado na animação atual (s).

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

### play()

> **play**(`name`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/SpriteAnimationComponent.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/SpriteAnimationComponent.ts#L44)

Troca a animação (reinicia do frame 0). Sem efeito se já é a atual ou não existe.

#### Parameters

##### name

`string`

#### Returns

`void`
