[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Scene

# Class: Scene

Defined in: [src/core/Scene.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L16)

## Constructors

### Constructor

> **new Scene**(): `Scene`

Defined in: [src/core/Scene.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L19)

#### Returns

`Scene`

## Methods

### add()

> **add**(...`objects`): `this`

Defined in: [src/core/Scene.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L30)

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

Defined in: [src/core/Scene.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L48)

Remove todos os objetos filhos da cena de uma vez.
Equivale a `THREE.Scene.clear()`.

#### Returns

`this`

***

### disposeAll()

> **disposeAll**(): `this`

Defined in: [src/core/Scene.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L67)

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

Defined in: [src/core/Scene.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L102)

Retorna a instância interna do `THREE.Scene`.
Necessário para passar ao `Renderer.render(scene, camera)`.
Prefira sempre os métodos desta classe para manipular a cena.

#### Returns

`Scene`

***

### remove()

> **remove**(...`objects`): `this`

Defined in: [src/core/Scene.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Scene.ts#L39)

Remove um ou mais objetos Three.js da cena.
Equivale a `THREE.Scene.remove()`.

#### Parameters

##### objects

...`Object3D`\<`Object3DEventMap`\>[]

#### Returns

`this`
