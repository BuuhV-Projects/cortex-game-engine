[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildSceneOptions

# Interface: BuildSceneOptions

Defined in: [jge-present/src/scene/SceneBuilder.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L94)

## Properties

### camera?

> `optional` **camera?**: `PerspectiveCamera` \| `OrthographicCamera`

Defined in: [jge-present/src/scene/SceneBuilder.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L115)

Câmera do jogo — **necessária** se a cena tem nós `background` (o backdrop
segue a câmera e rola em parallax). Passe `game.camera`.

***

### kit?

> `optional` **kit?**: \{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[]

Defined in: [jge-present/src/scene/SceneBuilder.ts:128](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L128)

Manifesto(s) de kit (`kit.json` parseado com [parseKit](../functions/parseKit.md); ADR-0053) —
habilita o encaixe por socket (`attach` nos nós) e o preset de collider por
`role` do asset (o `collider` do nó/overlay vence o preset).

#### Union Members

##### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

##### assets

> **assets**: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>

Chaves = caminho do asset dentro do kit (ex.: `assets/bridge.glb`).

##### module?

> `optional` **module?**: `number`

Unidade de grid/snap do kit (escala de espaçamento).

##### name

> **name**: `string`

##### theme?

> `optional` **theme?**: `string`

Design tokens de atmosfera (nome do tema).

##### version

> **version**: `1`

***

`object`[]

***

### matte?

> `optional` **matte?**: `boolean`

Defined in: [jge-present/src/scene/SceneBuilder.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L110)

Deixa **todos** os modelos foscos (mata o brilho PBR → look cartoon/desenho).
Um nó pode sobrescrever com `matte: false`. Atalho global do [setMatte](../functions/setMatte.md).

***

### mergeStatic?

> `optional` **mergeStatic?**: `boolean`

Defined in: [jge-present/src/scene/SceneBuilder.ts:136](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L136)

Funde a geometria ESTÁTICA da cena em poucas malhas por material ao final do
build (SPEC-0120, [mergeStaticScene](../functions/mergeStaticScene.md)) — derruba draw calls onde o render
é CPU-bound (host nativo/Hermes). Default: **liga sozinho no host nativo**
(`isNativeHost()`), desligado no browser/Studio (o editor F2 precisa dos
objetos individuais). `true`/`false` força.

***

### onProgress?

> `optional` **onProgress?**: (`progress`) => `void` \| `Promise`\<`void`\>

Defined in: [jge-present/src/scene/SceneBuilder.ts:175](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L175)

**Progresso da montagem** (SPEC-0219) — chamado a cada fatia de ~100 ms e
em cada troca de etapa, pra alimentar uma tela de carregamento.

O retorno é AGUARDADO: devolva a promessa do próximo frame (é o que o
`progress` do [runWithLoadingScreen](../functions/runWithLoadingScreen.md) faz) pra barra andar de verdade
no export. Devolver `void` só atualiza estado — o build cede o frame
sozinho de qualquer jeito (ADR-0218).

Exceção lançada aqui derruba o build: é callback de UI do jogo, o engine
não engole o erro.

#### Parameters

##### progress

[`BuildProgress`](BuildProgress.md)

#### Returns

`void` \| `Promise`\<`void`\>

#### Example

```ts
await buildScene(scene, defs, {
  onProgress: (p) => ui.setProgress(`Montando… ${Math.round(p.fraction * 100)}%`),
})
```

***

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: [jge-present/src/scene/SceneBuilder.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L98)

Overlay do editor (overrides de transform + `data.deleted`/`data.added`).

***

### physicsPaused?

> `optional` **physicsPaused?**: () => `boolean`

Defined in: [jge-present/src/scene/SceneBuilder.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L122)

Predicado pra **pausar a física de Character** (gravidade/pulo) — o
`CharacterPhysicsSystem` que o `buildScene` registra pra nós `character`
recebe isso como `pauseWhen`. Passe `() => game.editorActive` pra o personagem
não cair enquanto você edita a cena no F2. Sem isso, a física roda sempre.

#### Returns

`boolean`

***

### precompile?

> `optional` **precompile?**: `boolean`

Defined in: [jge-present/src/scene/SceneBuilder.ts:155](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L155)

**Pré-aquece os pipelines** ao final do build ([Renderer.precompile](../classes/Renderer.md#precompile),
SPEC-0196) — tira o hitch de compilação da primeira aparição de cada
material. Exige `renderer` e `camera`. Default `true`.

***

### renderBundles?

> `optional` **renderBundles?**: `boolean`

Defined in: [jge-present/src/scene/SceneBuilder.ts:149](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L149)

Envolve a geometria estática FUNDIDA num `BundleGroup` (render bundles do
WebGPU — M-perf-2b/SPEC-0136): o renderer grava os draws uma vez e no replay
vira 1 `executeBundles` por pass, cortando as milhares de travessias NAPI por
frame no host nativo. Só faz efeito com `mergeStatic` (é o estático fundido
que entra). `BundleGroup` assume estrutura estática — reconstrua a cena
(novo `buildScene`) pra mudar.

**Default: DESLIGADO, inclusive no host** (ADR-0215). No bundle os objetos
são desenhados com a matriz de câmera de quando ele foi gravado e ficam
presos na tela. É opt-in explícito (`true`) até isso ser corrigido no host.

***

### renderer?

> `optional` **renderer?**: [`Renderer`](../classes/Renderer.md)

Defined in: [jge-present/src/scene/SceneBuilder.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L96)

Necessário se alguma definição usa o preset `outdoorLighting`.

***

### world?

> `optional` **world?**: [`World`](../classes/World.md)

Defined in: [jge-present/src/scene/SceneBuilder.ts:105](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L105)

Mundo ECS — quando presente, nós com `collider`/`player` viram entidades
(Transform + Object3D + Collider2D [+ PlatformerBody + FollowCameraTarget]),
pra a física de plataforma agir. Registre os sistemas (Object3DSync,
PlatformerPhysics/Input, FollowCamera2D) — ou use `setupPlatformer`.
