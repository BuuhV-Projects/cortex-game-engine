[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlatformerAnimationSystem

# Class: PlatformerAnimationSystem

Defined in: src/systems/PlatformerAnimationSystem.ts:82

Toca a animação do player conforme a **ação** derivada do
[PlatformerBodyComponent](PlatformerBodyComponent.md): idle/walk/run no chão, jump/fall no ar, e
one-shots disparados ([PlayerAnimatorComponent.trigger](PlayerAnimatorComponent.md#trigger), ex.: attack).
Mapeia a ação pro clipe via [PlayerAnimatorComponent.clips](PlayerAnimatorComponent.md#clips) e toca no
`SceneAnimator` (em `userData.cortexAnim`). É o "controle de player" padronizado:
a IA/editor só preenchem o mapa ação→clipe; o resto é automático.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new PlatformerAnimationSystem**(): `PlatformerAnimationSystem`

#### Returns

`PlatformerAnimationSystem`

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

> **priority**: `number` = `35`

Defined in: src/systems/PlatformerAnimationSystem.ts:84

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`Object3DComponent`](Object3DComponent.md) \| *typeof* [`PlatformerBodyComponent`](PlatformerBodyComponent.md) \| *typeof* [`PlayerAnimatorComponent`](PlayerAnimatorComponent.md))[]

Defined in: src/systems/PlatformerAnimationSystem.ts:83

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

Defined in: src/systems/PlatformerAnimationSystem.ts:86

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
