[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CharacterBodyComponent

# Class: CharacterBodyComponent

Defined in: [src/components/CharacterBodyComponent.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L41)

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

Defined in: [src/components/CharacterBodyComponent.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L61)

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

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### fallSpeedMax

> `readonly` **fallSpeedMax**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L47)

***

### gravity

> `readonly` **gravity**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L44)

***

### grounded

> **grounded**: `boolean` = `false`

Defined in: [src/components/CharacterBodyComponent.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L55)

`true` quando os pés estão no chão (terreno/colisão). Zera os pulos.

***

### groundY

> **groundY**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L50)

Piso plano onde aterra (sem raycast). `-Infinity` = sem piso.

***

### height

> `readonly` **height**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L43)

***

### jumpForce

> `readonly` **jumpForce**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L46)

***

### jumpQueued

> **jumpQueued**: `boolean` = `false`

Defined in: [src/components/CharacterBodyComponent.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L59)

Pedido de pulo pendente (consumido pelo [CharacterPhysicsSystem](CharacterPhysicsSystem.md)).

***

### jumpsUsed

> **jumpsUsed**: `number` = `0`

Defined in: [src/components/CharacterBodyComponent.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L57)

Pulos já usados desde o último contato com o chão.

***

### maxJumps

> `readonly` **maxJumps**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L48)

***

### radius

> `readonly` **radius**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L42)

***

### stepHeight

> `readonly` **stepHeight**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L45)

***

### velocityY

> **velocityY**: `number` = `0`

Defined in: [src/components/CharacterBodyComponent.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L53)

Velocidade vertical atual (unidades/s). Integrada pela gravidade/pulo.

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

## Methods

### jump()

> **jump**(): `void`

Defined in: [src/components/CharacterBodyComponent.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L74)

Pede um pulo — aplicado no próximo tick se ainda houver pulos disponíveis.

#### Returns

`void`
