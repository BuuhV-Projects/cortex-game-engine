[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptHostSystem

# Class: ScriptHostSystem

Defined in: [src/systems/ScriptHostSystem.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L40)

**Roda os scripts** ([ScriptBehavior](ScriptBehavior.md)) anexados via [ScriptComponent](ScriptComponent.md) — ADR-0085.
Instancia cada slot pelo nome (registro), injeta `entity`/`object3d`/`ctx`, aplica os campos,
chama `onStart` (uma vez) e `onUpdate(dt)` (todo frame, `dt` em segundos). Um script que
lança exceção é logado via `debug('script', …)` e não derruba os demais.

**Pausa no editor** (passe `isEditing`): scripts só rodam no Play, como na Unity. O jogo
adiciona este sistema no boot com o contexto (input/gamepad/scene/camera).

**Play → Stop DESTRÓI as instâncias** (`restoreRaycasts` + `onDestroy`), e o Play
seguinte cria de novo — ciclo estilo Unity. Sem isso os efeitos colaterais do
`onStart` vazavam pro modo edição: quem desliga o `raycast` (lâmina, moeda, poça)
deixava o objeto **inselecionável no editor**, porque o picking também é raycast,
e só um reload da IDE devolvia o clique. Ver ADR-0143.

Por isso este sistema **não usa `pauseWhen`**: ele precisa rodar no modo edição pra
enxergar a transição. Não sete `pauseWhen` nele por fora — o gate é o `isEditing`
do construtor.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new ScriptHostSystem**(`ctx`, `isEditing?`): `ScriptHostSystem`

Defined in: [src/systems/ScriptHostSystem.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L51)

#### Parameters

##### ctx

[`ScriptContext`](../interfaces/ScriptContext.md)

##### isEditing?

() => `boolean`

Quando `true`, os scripts não rodam (modo edição).

#### Returns

`ScriptHostSystem`

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

> **priority**: `number` = `50`

Defined in: [src/systems/ScriptHostSystem.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L42)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: *typeof* [`ScriptComponent`](ScriptComponent.md)[]

Defined in: [src/systems/ScriptHostSystem.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L41)

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

Defined in: [src/systems/ScriptHostSystem.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L108)

Teardown na TROCA DE FASE (`World.clear` chama) — o buraco que vazava a
fase inteira (SPEC-0152): sem isto, o `onDestroy` dos scripts NUNCA rodava
fora do editor, e cada listener de `document` registrado por um script
(moeda/checkpoint/chegada escutam `rush:restart`) ficava vivo retendo
entity → object3d → a CENA COMPLETA da fase anterior, uma por troca.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`dispose`](System.md#dispose)

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/ScriptHostSystem.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ScriptHostSystem.ts#L60)

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
