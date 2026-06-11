[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CharacterPhysicsSystem

# Class: CharacterPhysicsSystem

Defined in: [src/systems/CharacterPhysicsSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L19)

Física vertical do [CharacterBodyComponent](CharacterBodyComponent.md) (character controller estilo
UPBGE): aplica **gravidade** (limitada por `fallSpeedMax`), processa o **pulo**
(`jumpForce` até `maxJumps`) e integra o Y. O movimento horizontal (X/Z) fica
com o input do jogo. O **ground** vem de duas fontes (estáveis, sem raycast):
- o **piso plano** `groundY` do próprio corpo (aterra ali — ideal pra top-down
  de chão plano; default `-Infinity` = sem piso);
- e/ou o [TerrainCollisionSystem](TerrainCollisionSystem.md) (terreno esculpido), que roda depois.
Aterrar zera `velocityY`, marca `grounded` e reseta os pulos.

Roda na física (priority 5), **antes** do [TerrainCollisionSystem](TerrainCollisionSystem.md) (7) e do
`Object3DSyncSystem` (10).

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new CharacterPhysicsSystem**(): `CharacterPhysicsSystem`

#### Returns

`CharacterPhysicsSystem`

#### Inherited from

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L65)

Predicado opcional de PAUSA: se definido e retornar `true` num tick, o
`World` pula o `update` deste sistema nesse frame. Usado, por ex., pra pausar
a gameplay (física/input) enquanto o editor está ativo
(`pauseWhen = () => game.editorActive`).

#### Returns

`boolean`

#### Inherited from

[`System`](System.md).[`pauseWhen`](System.md#pausewhen)

***

### priority

> **priority**: `number` = `5`

Defined in: [src/systems/CharacterPhysicsSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L21)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`CharacterBodyComponent`](CharacterBodyComponent.md))[]

Defined in: [src/systems/CharacterPhysicsSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L20)

Construtores dos componentes que este sistema requer.

O `World` usa essa lista para filtrar as entidades antes de chamar `update`,
garantindo que apenas entidades com todos os componentes declarados sejam
repassadas ao sistema.

Subclasses devem sobrescrever este campo estático.

#### Example

```ts
static requiredComponents = [TransformComponent, VelocityComponent];
```

#### Overrides

[`System`](System.md).[`requiredComponents`](System.md#requiredcomponents)

## Methods

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/CharacterPhysicsSystem.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L23)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.

##### deltaTime

`number`

Tempo decorrido desde o último tick, em segundos.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
