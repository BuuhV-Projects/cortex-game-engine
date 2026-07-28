[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Scene

# Class: Scene

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L17)

## Constructors

### Constructor

> **new Scene**(): `Scene`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L24)

#### Returns

`Scene`

## Methods

### add()

> **add**(...`objects`): `this`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L77)

Adiciona um ou mais objetos Three.js à cena.
Equivale a `THREE.Scene.add()`; o objeto passado deve ser uma instância
de `THREE.Object3D` (Mesh, Light, Group, etc.).

#### Parameters

##### objects

...`Object3D`\<`Object3DEventMap`\>[]

#### Returns

`this`

***

### clear()

> **clear**(): `this`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L95)

Remove todos os objetos filhos da cena de uma vez.
Equivale a `THREE.Scene.clear()`.

#### Returns

`this`

***

### disposeAll()

> **disposeAll**(): `this`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L114)

Remove TODOS os filhos E libera os recursos de GPU deles (geometrias,
materiais e texturas). Diferente de [clear](#clear) (que só desanexa e deixa
a GPU vazar): use ao **trocar de cena/fase** pra não acumular memória de
vídeo. Também limpa `background`/`environment`.

**Exceção:** PRESERVA (não remove nem dispõe) os overlays do editor — filhos
marcados `userData.editorInternal` (gizmo de seleção/eixos, contornos de
collider, anel de pincel) ou `userData.cortexKeep` (helpers de luz/câmera, a
câmera livre). São chrome de edição que sobrevive à troca de fase junto dos
sistemas `keepOnClear`; dispô-los deixava os eixos sumirem ao voltar ao menu
e entrar noutra fase. Ver attachEditor / World.clear. Em produção não há
editor (esses objetos não existem), então dispõe tudo normalmente.

#### Returns

`this`

***

### getThreeScene()

> **getThreeScene**(): `Scene`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:203](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L203)

Retorna a instância interna do `THREE.Scene`.
Necessário para passar ao `Renderer.render(scene, camera)`.
Prefira sempre os métodos desta classe para manipular a cena.

#### Returns

`Scene`

***

### remove()

> **remove**(...`objects`): `this`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L86)

Remove um ou mais objetos Three.js da cena.
Equivale a `THREE.Scene.remove()`.

#### Parameters

##### objects

...`Object3D`\<`Object3DEventMap`\>[]

#### Returns

`this`

***

### setEnvironment()

> **setEnvironment**(`renderer`, `texture`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Scene.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L43)

Define o **environment** (IBL) a partir de uma textura equiretangular,
com o PMREM gerado e **possuído pelo engine** (SPEC-0152).

Atribuir a textura crua a `scene.environment` deixa o three gerar o PMREM
por dentro (PMREMNode) — e os RenderTargets dele (2× 3072×4096 half-float,
~190 MB) ficam presos em caches internos SEM caminho de dispose: cada troca
de fase somava um PMREM novo na VRAM (medido no soak do export). Gerando
aqui, o three recebe a textura JÁ em CubeUV (pula o caminho interno) e o
[disposeAll](#disposeall) devolve a RT na troca.

Passe `null` pra limpar (dispõe a RT atual). A textura-fonte continua sua:
dispose dela é com o chamador (ou com o `disposeAll`, se ela também for o
`background`).

#### Parameters

##### renderer

###### threeRenderer

`unknown`

##### texture

`Texture`\<`unknown`, `TextureEventMap`\> \| `null`

#### Returns

`void`
