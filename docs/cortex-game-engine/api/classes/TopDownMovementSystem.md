[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TopDownMovementSystem

# Class: TopDownMovementSystem

Defined in: [src/systems/TopDownMovementSystem.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L44)

Movimento **top-down** (farm sim / RPG estilo Stardew): lê o **eixo** de um
[MoveAxisProvider](../type-aliases/MoveAxisProvider.md) fornecido pelo jogo e move o player no **plano XZ**
(`x` = ±X, `y` cima = −Z), respeitando o **analógico** (anda devagar com pouco
tilt), e faz o personagem **virar na direção do movimento** (`transform.rotationY`).
O **Y** (gravidade/aterrar) fica com o [CharacterBodyComponent](CharacterBodyComponent.md) +
`CharacterPhysicsSystem`. O engine não conhece o esquema de input — o jogo passa o
eixo (ADR-0066).

Mira o único player (entidade com [TransformComponent](TransformComponent.md) +
[CharacterBodyComponent](CharacterBodyComponent.md), `entities[0]`) e o **marca como alvo da câmera**
([FollowCameraTargetComponent](FollowCameraTargetComponent.md)) no 1º update se faltar. Tipicamente montado
via `setupTopDown`.

## Example

```ts
// o jogo passa o eixo do controle dele:
const move = new TopDownMovementSystem(() => meuControle.moveAxis(), { moveSpeed: 5 })
move.pauseWhen = () => game.editorActive
game.world.addSystem(move)
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new TopDownMovementSystem**(`readMove`, `options?`): `TopDownMovementSystem`

Defined in: [src/systems/TopDownMovementSystem.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L51)

#### Parameters

##### readMove

[`MoveAxisProvider`](../type-aliases/MoveAxisProvider.md)

##### options?

[`TopDownMovementOptions`](../interfaces/TopDownMovementOptions.md) = `{}`

#### Returns

`TopDownMovementSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### keepOnClear

> **keepOnClear**: `boolean` = `false`

Defined in: [src/ecs/System.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L51)

Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
— ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
`false` (sistema da cena/jogo, é removido no clear).

#### Inherited from

[`System`](System.md).[`keepOnClear`](System.md#keeponclear)

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L73)

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

> **priority**: `number` = `2`

Defined in: [src/systems/TopDownMovementSystem.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L46)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`CharacterBodyComponent`](CharacterBodyComponent.md))[]

Defined in: [src/systems/TopDownMovementSystem.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L45)

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

### dispose()

> **dispose**(): `void`

Defined in: [src/ecs/System.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L90)

Libera recursos ao remover o sistema — chamado por [World.clear](World.md#clear) (e
pode ser chamado manualmente). No-op por padrão; sobrescreva pra liberar
handles nativos que o GC não coleta sozinho (ex.: o mundo do Rapier em
[RapierPhysicsSystem](RapierPhysicsSystem.md)). Essencial pra trocar de cena/fase sem vazar.

#### Returns

`void`

#### Inherited from

[`System`](System.md).[`dispose`](System.md#dispose)

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/TopDownMovementSystem.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L60)

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
