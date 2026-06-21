[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueRunner

# Class: DialogueRunner

Defined in: src/dialogue/DialogueRunner.ts:52

**Percorre um grafo de diálogo** (ADR-0070). Lógica **pura** — sem DOM, sem
Three, sem ECS → testável isoladamente (Vitest). A UI (DOM) assina as views; o
runner não conhece a UI.

Efeitos colaterais são determinísticos e aplicados **uma vez** por transição:
ao **entrar** num nó aplica `node.set`/`node.give`; ao **escolher** aplica o
`set`/`give` da escolha **antes** de transicionar.

## Example

```ts
const runner = new DialogueRunner(graph, { story, onClue: (id) => caseState.collectClue(id) });
let view = runner.start();
// ...mostra view; quando o jogador clica a escolha de índice i:
view = runner.choose(i);
if (runner.done) closeUi();
```

## Constructors

### Constructor

> **new DialogueRunner**(`graph`, `options?`): `DialogueRunner`

Defined in: src/dialogue/DialogueRunner.ts:59

#### Parameters

##### graph

###### id

`string` = `...`

Id do diálogo.

###### nodes

`object`[] = `...`

Nós do grafo.

###### start

`string` = `...`

Nó inicial (id).

##### options?

[`DialogueRunnerOptions`](../interfaces/DialogueRunnerOptions.md) = `{}`

#### Returns

`DialogueRunner`

## Accessors

### done

#### Get Signature

> **get** **done**(): `boolean`

Defined in: src/dialogue/DialogueRunner.ts:74

`true` quando o diálogo terminou (não há mais nó atual).

##### Returns

`boolean`

***

### story

#### Get Signature

> **get** **story**(): [`StoryState`](StoryState.md)

Defined in: src/dialogue/DialogueRunner.ts:69

O `StoryState` em uso (próprio ou o injetado).

##### Returns

[`StoryState`](StoryState.md)

## Methods

### advance()

> **advance**(): [`DialogueView`](../interfaces/DialogueView.md)

Defined in: src/dialogue/DialogueRunner.ts:111

Avança uma **linha simples** (nó sem escolhas) pro `next`. Lança se o nó atual
tiver escolhas (use `choose`) ou se já terminou.

#### Returns

[`DialogueView`](../interfaces/DialogueView.md)

***

### choose()

> **choose**(`index`): [`DialogueView`](../interfaces/DialogueView.md)

Defined in: src/dialogue/DialogueRunner.ts:93

Escolhe a opção de índice **original** `index` no nó atual. Aplica
`set`/`give` da escolha e transiciona pro `next` (ou encerra se `next` nulo).

#### Parameters

##### index

`number`

#### Returns

[`DialogueView`](../interfaces/DialogueView.md)

***

### current()

> **current**(): [`DialogueView`](../interfaces/DialogueView.md)

Defined in: src/dialogue/DialogueRunner.ts:84

A view do estado atual. Lança se chamado antes de `start()` ou após `done`.

#### Returns

[`DialogueView`](../interfaces/DialogueView.md)

***

### start()

> **start**(): [`DialogueView`](../interfaces/DialogueView.md)

Defined in: src/dialogue/DialogueRunner.ts:79

Inicia no nó `start`, aplica seus efeitos de entrada e devolve a view.

#### Returns

[`DialogueView`](../interfaces/DialogueView.md)
