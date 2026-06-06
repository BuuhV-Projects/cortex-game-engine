[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlatformerInputSystem

# Class: PlatformerInputSystem

Defined in: [src/systems/PlatformerInputSystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L14)

Mapeia o teclado ([InputManager](InputManager.md)) para a **intenção** dos corpos de
plataforma: ←/A e →/D definem `moveDir`; Espaço/↑/W enfileiram pulo (na borda
de pressão — não enquanto segura). Roda antes do [PlatformerPhysicsSystem](PlatformerPhysicsSystem.md).

Para input alternativo (gamepad, IA, touch), escreva direto em
`PlatformerBodyComponent.moveDir`/`jumpQueued` em vez deste sistema.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new PlatformerInputSystem**(`input`): `PlatformerInputSystem`

Defined in: [src/systems/PlatformerInputSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L20)

#### Parameters

##### input

[`InputManager`](InputManager.md)

#### Returns

`PlatformerInputSystem`

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

> **priority**: `number` = `1`

Defined in: [src/systems/PlatformerInputSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L16)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: *typeof* [`PlatformerBodyComponent`](PlatformerBodyComponent.md)[]

Defined in: [src/systems/PlatformerInputSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L15)

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

> **update**(`entities`): `void`

Defined in: [src/systems/PlatformerInputSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L24)

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
