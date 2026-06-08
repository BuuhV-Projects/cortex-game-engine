[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / LogicBricksSystem

# Class: LogicBricksSystem

Defined in: src/systems/LogicBricksSystem.ts:50

Interpreta os **Logic Bricks** (ver [LogicComponent](LogicComponent.md)): a cada frame avalia
sensores → controllers → actuators, e executa as ações (motion: move/gira o
objeto; animation: toca um clipe no `SceneAnimator`). É o runtime do editor de
lógica estilo UPBGE. Precisa do [InputManager](InputManager.md) (sensores de tecla).

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new LogicBricksSystem**(`input`): `LogicBricksSystem`

Defined in: src/systems/LogicBricksSystem.ts:54

#### Parameters

##### input

[`InputManager`](InputManager.md)

#### Returns

`LogicBricksSystem`

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

> **priority**: `number` = `25`

Defined in: src/systems/LogicBricksSystem.ts:52

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`Object3DComponent`](Object3DComponent.md) \| *typeof* [`LogicComponent`](LogicComponent.md))[]

Defined in: src/systems/LogicBricksSystem.ts:51

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

Defined in: src/systems/LogicBricksSystem.ts:58

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
