[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CharacterBodyComponent

# Class: CharacterBodyComponent

Defined in: [src/components/CharacterBodyComponent.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L34)

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

Defined in: [src/components/CharacterBodyComponent.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L52)

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

Defined in: [src/components/CharacterBodyComponent.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L40)

***

### gravity

> `readonly` **gravity**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L37)

***

### grounded

> **grounded**: `boolean` = `false`

Defined in: [src/components/CharacterBodyComponent.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L46)

`true` quando os pés estão no chão (terreno/colisão). Zera os pulos.

***

### height

> `readonly` **height**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L36)

***

### jumpForce

> `readonly` **jumpForce**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L39)

***

### jumpQueued

> **jumpQueued**: `boolean` = `false`

Defined in: [src/components/CharacterBodyComponent.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L50)

Pedido de pulo pendente (consumido pelo [CharacterPhysicsSystem](CharacterPhysicsSystem.md)).

***

### jumpsUsed

> **jumpsUsed**: `number` = `0`

Defined in: [src/components/CharacterBodyComponent.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L48)

Pulos já usados desde o último contato com o chão.

***

### maxJumps

> `readonly` **maxJumps**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L41)

***

### radius

> `readonly` **radius**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L35)

***

### stepHeight

> `readonly` **stepHeight**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L38)

***

### velocityY

> **velocityY**: `number` = `0`

Defined in: [src/components/CharacterBodyComponent.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L44)

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

Defined in: [src/components/CharacterBodyComponent.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L64)

Pede um pulo — aplicado no próximo tick se ainda houver pulos disponíveis.

#### Returns

`void`
