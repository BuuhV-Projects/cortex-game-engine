[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlatformerInputSystem

# Class: PlatformerInputSystem

Defined in: [src/systems/PlatformerInputSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L19)

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

Defined in: [src/systems/PlatformerInputSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L26)

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

Defined in: [src/ecs/System.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L80)

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

Defined in: [src/systems/PlatformerInputSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L22)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### profileLabel

> `readonly` **profileLabel**: `"PlatformerInputSystem"` = `'PlatformerInputSystem'`

Defined in: [src/systems/PlatformerInputSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L20)

Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
`DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).

#### Overrides

[`System`](System.md).[`profileLabel`](System.md#profilelabel)

***

### requiredComponents

> `static` **requiredComponents**: *typeof* [`PlatformerBodyComponent`](PlatformerBodyComponent.md)[]

Defined in: [src/systems/PlatformerInputSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L21)

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

Defined in: [src/ecs/System.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L100)

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

Defined in: [src/systems/PlatformerInputSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerInputSystem.ts#L33)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`. O array é
                   compartilhado com outros sistemas e reaproveitado entre
                   quadros enquanto a estrutura do ECS não muda (ADR-0676):
                   leia, guarde a referência se quiser, mas **não mute**.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
