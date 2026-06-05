[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ObjectEditSystem

# Class: ObjectEditSystem

Defined in: [src/editor/ObjectEditSystem.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/ObjectEditSystem.ts#L36)

Editor de cena estilo Blender/Unity: clique pra selecionar um objeto dentro
dos `editRoots`, arrasta os eixos do gizmo (TransformControls) pra mover/
rotacionar/escalar. Só roda quando `editorState.active`.

Teclas: click = selecionar; 1/2/3 = translate/rotate/scale; Esc = desselecionar;
K = salvar edições (callback `onSaveEdits`); L = limpar (`onClearEdits`);
F = focar no selecionado (`onFocusRequest`).

Persiste por `Object3D.name` (objetos sem nome são ignorados). O que fazer com
as edições fica a cargo do jogo (callbacks).

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new ObjectEditSystem**(`editorState`, `camera`, `canvas`, `scene`, `editRoots`, `input`, `hud`, `onSaveEdits`, `onClearEdits`, `onTransformChange?`, `onFocusRequest?`, `selection?`): `ObjectEditSystem`

Defined in: [src/editor/ObjectEditSystem.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/ObjectEditSystem.ts#L49)

#### Parameters

##### editorState

[`EditorState`](../interfaces/EditorState.md)

##### camera

`PerspectiveCamera`

##### canvas

`HTMLCanvasElement`

##### scene

[`Scene`](Scene.md)

##### editRoots

`Object3D`\<`Object3DEventMap`\>[]

Roots editáveis (ex.: `[track.root, carContainer]`). O raycast procura
recursivamente e sobe até o filho direto do root correspondente — assim
cliques em meshes internas selecionam o "prop" inteiro.

##### input

[`InputManager`](InputManager.md)

##### hud

[`EditorHud`](../interfaces/EditorHud.md)

##### onSaveEdits

(`edits`) => `void`

##### onClearEdits

() => `void`

##### onTransformChange?

(`obj`) => `void`

Chamado quando a transform do selecionado muda (durante drag) — sync ECS.

##### onFocusRequest?

(`obj`) => `void`

Chamado ao apertar F com algo selecionado — tipicamente liga ao focusOn da câmera.

##### selection?

[`EditorSelection`](../interfaces/EditorSelection.md)

Ponte de seleção observável (opcional). Quando presente, a seleção é
espelhada nela (pra a UI de hierarquia/inspector reagir) e pedidos de
seleção vindos da UI (`requestSelect`) são atendidos. Ver
[EditorSelection](../interfaces/EditorSelection.md).

#### Returns

`ObjectEditSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### priority

> **priority**: `number` = `27`

Defined in: [src/editor/ObjectEditSystem.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/ObjectEditSystem.ts#L38)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: `never`[] = `[]`

Defined in: [src/editor/ObjectEditSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/ObjectEditSystem.ts#L37)

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

### select()

> **select**(`target`): `void`

Defined in: [src/editor/ObjectEditSystem.ts:199](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/ObjectEditSystem.ts#L199)

Seleciona um objeto (ou desseleciona com `null`), atacando/soltando o gizmo
e espelhando na [EditorSelection](../interfaces/EditorSelection.md). Público pra a UI (hierarquia) poder
dirigir a seleção — embora o caminho recomendado pela UI seja
`selection.requestSelect(obj)`, que chega aqui.

#### Parameters

##### target

`Object3D`\<`Object3DEventMap`\> \| `null`

Objeto a selecionar, ou `null` pra desselecionar.

#### Returns

`void`

***

### update()

> **update**(`_entities`): `void`

Defined in: [src/editor/ObjectEditSystem.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/ObjectEditSystem.ts#L115)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### \_entities

[`Entity`](Entity.md)[]

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
