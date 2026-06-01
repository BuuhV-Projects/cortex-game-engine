[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorCameraSystem

# Class: EditorCameraSystem

Defined in: [src/editor/EditorCameraSystem.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorCameraSystem.ts#L34)

Câmera de voo livre + ações de edição do alvo. Roda em todos os frames; usa
`state.active` pra decidir se intervém.

Quando ativo: WASD/QE move (Shift = correr), botão direito + mouse rotaciona.
Teleporta o alvo (entidade com `EditableTargetComponent`) com T, fazendo snap
pro chão via raycast. `focusOn(obj)` enquadra um objeto estilo Blender.

Não cuida de persistência — só câmera/navegação/teleporte. Salvar a cena
(incluindo a pose do alvo) é responsabilidade do [ObjectEditSystem](ObjectEditSystem.md)
(uma única tecla) + o jogo.

O `yaw`/`pitch` internos são estado de ferramenta (input acumulado), não de
simulação.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new EditorCameraSystem**(`state`, `camera`, `gameCamera`, `input`, `ground`, `hud`, `moveSpeed?`, `runMultiplier?`, `mouseSensitivity?`): `EditorCameraSystem`

Defined in: [src/editor/EditorCameraSystem.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorCameraSystem.ts#L48)

#### Parameters

##### state

[`EditorState`](../interfaces/EditorState.md)

##### camera

`PerspectiveCamera`

Câmera de voo livre — manipulada por este sistema.

##### gameCamera

`PerspectiveCamera`

Câmera do jogo — copiada pra `camera` ao ativar o editor (continuidade visual).

##### input

[`InputManager`](InputManager.md)

##### ground

`Object3D`

##### hud

[`EditorHud`](../interfaces/EditorHud.md)

##### moveSpeed?

`number` = `30`

##### runMultiplier?

`number` = `4`

##### mouseSensitivity?

`number` = `0.0035`

#### Returns

`EditorCameraSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### priority

> **priority**: `number` = `25`

Defined in: [src/editor/EditorCameraSystem.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorCameraSystem.ts#L36)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`EditableTargetComponent`](EditableTargetComponent.md))[]

Defined in: [src/editor/EditorCameraSystem.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorCameraSystem.ts#L35)

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

### focusOn()

> **focusOn**(`target`): `void`

Defined in: [src/editor/EditorCameraSystem.ts:177](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorCameraSystem.ts#L177)

Enquadra um objeto: posiciona a câmera a uma distância proporcional ao bbox
(com margem) preservando a direção de visão atual e atualiza yaw/pitch.
Estilo `F` do Blender/Unity.

#### Parameters

##### target

`Object3D`

#### Returns

`void`

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/editor/EditorCameraSystem.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorCameraSystem.ts#L64)

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
