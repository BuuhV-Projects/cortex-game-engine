[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InteractionSystem

# Class: InteractionSystem

Defined in: [src/systems/InteractionSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L33)

**Sistema de interação** (ADR-0080): a cada frame acha o [InteractionComponent](InteractionComponent.md)
**mais próximo** do interator ativo dentro do seu `range`, avisa a HUD via `onPrompt`
e dispara `onInteract` na borda do botão/tecla. Genérico e reusável (carro, NPC,
porta, item) — a posição do interator e o render do prompt são injetados pelo jogo,
então funciona com o player a pé ou o carro (o "player do momento"). `priority = 25`
(depois do controle de 3ª pessoa).

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new InteractionSystem**(`options`, `gamepad?`, `input?`): `InteractionSystem`

Defined in: [src/systems/InteractionSystem.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L40)

#### Parameters

##### options

[`InteractionSystemOptions`](../interfaces/InteractionSystemOptions.md)

##### gamepad?

[`GamepadManager`](GamepadManager.md)

##### input?

[`InputManager`](InputManager.md)

#### Returns

`InteractionSystem`

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

Defined in: [src/systems/InteractionSystem.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L35)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`InteractionComponent`](InteractionComponent.md))[]

Defined in: [src/systems/InteractionSystem.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L34)

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

## Accessors

### active

#### Get Signature

> **get** **active**(): [`InteractionComponent`](InteractionComponent.md) \| `null`

Defined in: [src/systems/InteractionSystem.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L50)

Interação atualmente em alcance (ou `null`) — útil pra HUD externa.

##### Returns

[`InteractionComponent`](InteractionComponent.md) \| `null`

## Methods

### update()

> **update**(`entities`): `void`

Defined in: [src/systems/InteractionSystem.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/InteractionSystem.ts#L54)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
