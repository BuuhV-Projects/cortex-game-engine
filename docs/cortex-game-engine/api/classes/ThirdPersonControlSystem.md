[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonControlSystem

# Class: ThirdPersonControlSystem

Defined in: [src/systems/ThirdPersonControlSystem.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L55)

**Controle de terceira pessoa** — porta o `ThirdPersonController` do Unity
StarterAssets (comportamento; a arte é separada): câmera **orbital por mouse**
(pointer lock, pitch clampado), **movimento relativo à câmera** (WASD), o
personagem **vira suavemente** pra direção do movimento, **corre** com Shift e
**pula** com Espaço (sobre o [CharacterBodyComponent](CharacterBodyComponent.md) — gravidade/colisão).
Também dirige a **animação** (idle/walk/run/jump/fall) do `.glb` via
`SceneAnimator` (em `userData.cortexAnim`).

Mira a única entidade com [TransformComponent](TransformComponent.md) + [CharacterBodyComponent](CharacterBodyComponent.md).
Roda em `priority = 20` (depois da física). Pausa no editor via `pauseWhen`.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new ThirdPersonControlSystem**(`camera`, `input`, `canvas`, `options?`): `ThirdPersonControlSystem`

Defined in: [src/systems/ThirdPersonControlSystem.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L76)

#### Parameters

##### camera

`PerspectiveCamera`

##### input

[`InputManager`](InputManager.md)

##### canvas

`HTMLElement`

##### options?

[`ThirdPersonControlOptions`](../interfaces/ThirdPersonControlOptions.md) = `{}`

#### Returns

`ThirdPersonControlSystem`

#### Overrides

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

> **priority**: `number` = `20`

Defined in: [src/systems/ThirdPersonControlSystem.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L57)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`CharacterBodyComponent`](CharacterBodyComponent.md))[]

Defined in: [src/systems/ThirdPersonControlSystem.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L56)

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

Defined in: [src/systems/ThirdPersonControlSystem.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L101)

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
