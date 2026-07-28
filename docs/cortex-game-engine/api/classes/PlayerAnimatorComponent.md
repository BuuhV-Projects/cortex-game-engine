[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlayerAnimatorComponent

# Class: PlayerAnimatorComponent

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L13)

**Mapa ação → clipe** do player (o "contrato"/padrão de animação). É a base que a
IA preenche e o editor edita: pra cada ação de locomoção (`idle`/`walk`/`run`/
`jump`/`fall`/`land`) e ações custom (`attack`/`hurt`/…), qual clipe do `.glb`
tocar. O [PlatformerAnimationSystem](PlatformerAnimationSystem.md) deriva a ação do
[PlatformerBodyComponent](PlatformerBodyComponent.md) e toca o clipe mapeado no `SceneAnimator`.

Só DADOS (os campos de estado abaixo são escritos pelo system). Estenda o System
pra lógica custom; dispare one-shots com [trigger](#trigger).

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new PlayerAnimatorComponent**(`clips?`, `runThreshold?`): `PlayerAnimatorComponent`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L26)

#### Parameters

##### clips?

`Record`\<`string`, `string`\> = `{}`

Mapa ação → nome do clipe (ex.: `{ idle: 'Idle', run: 'Run' }`).
  Ações sem clipe caem num fallback (run↔walk, fall↔jump, land→idle).

##### runThreshold?

`number` = `4`

`|vx|` acima disto = `run`; abaixo = `walk`. Default `4`.

#### Returns

`PlayerAnimatorComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### clips

> **clips**: `Record`\<`string`, `string`\> = `{}`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L27)

Mapa ação → nome do clipe (ex.: `{ idle: 'Idle', run: 'Run' }`).
  Ações sem clipe caem num fallback (run↔walk, fall↔jump, land→idle).

***

### current

> **current**: `string` \| `null` = `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L15)

Ação tocando agora (escrito pelo system).

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### oneShot

> **oneShot**: `string` \| `null` = `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L17)

Ação one-shot disparada (override até acabar). Use [trigger](#trigger).

***

### oneShotTime

> **oneShotTime**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L19)

Tempo restante do one-shot (s) — gerenciado pelo system.

***

### runThreshold

> **runThreshold**: `number` = `4`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L28)

`|vx|` acima disto = `run`; abaixo = `walk`. Default `4`.

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

### trigger()

> **trigger**(`action`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/PlayerAnimatorComponent.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/PlayerAnimatorComponent.ts#L34)

Dispara uma ação **one-shot** (ataque/hit/…): toca uma vez e volta à locomoção.

#### Parameters

##### action

`string`

#### Returns

`void`
