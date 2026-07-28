[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlatformerInputSystem

# Class: PlatformerInputSystem

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/PlatformerInputSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L19)

Mapeia o teclado ([InputManager](InputManager.md)) para a **intenção** dos corpos de
plataforma: ←/A e →/D definem `moveDir`; Espaço/↑/W enfileiram pulo (na borda
de pressão — não enquanto segura). Roda antes do [PlatformerPhysicsSystem](PlatformerPhysicsSystem.md).

Passando um [InputActions](InputActions.md) (tipicamente `game.actions`), lê por AÇÃO
(`moveLeft`/`moveRight`/`jump`) e respeita o que o jogador remapeou na tela
de Controles — inclusive gamepad (ADR-0164). Sem ele, valem as teclas fixas.

Para input alternativo (IA, touch), escreva direto em
`PlatformerBodyComponent.moveDir`/`jumpQueued` em vez deste sistema.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new PlatformerInputSystem**(`input`, `actions?`): `PlatformerInputSystem`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/PlatformerInputSystem.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L25)

#### Parameters

##### input

[`InputManager`](InputManager.md)

##### actions?

[`InputActions`](InputActions.md)

#### Returns

`PlatformerInputSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### keepOnClear

> **keepOnClear**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L51)

Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
— ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
`false` (sistema da cena/jogo, é removido no clear).

#### Inherited from

[`System`](System.md).[`keepOnClear`](System.md#keeponclear)

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L73)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/PlatformerInputSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L21)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: *typeof* [`PlatformerBodyComponent`](PlatformerBodyComponent.md)[]

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/PlatformerInputSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L20)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L90)

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

> **update**(`entities`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/PlatformerInputSystem.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L32)

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
