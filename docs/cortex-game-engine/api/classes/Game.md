[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Game

# Class: Game

Defined in: [src/core/Game.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L86)

Facade de alto nível: cria e conecta o que todo jogo precisa — `Renderer`,
`Scene`, câmera, `World` (ECS), `InputManager` e o `GameLoop` — e, **em
desenvolvimento**, liga o **modo editor** completo (câmera livre F2, gizmo,
hierarquia, inspector, reatividade) automaticamente, sem nenhum boilerplate no
jogo. No build de produção o editor não está no bundle (ver ADR-0042), então
não pesa.

O jogo só precisa: criar o `Game`, popular `game.scene`, registrar a lógica em
`game.onUpdate(...)` (e/ou sistemas em `game.world`), e chamar `start()`.

## Example

```ts
const game = new Game({ canvas })
game.scene.add(meshes…)
game.onUpdate((dt) => { /* lógica por frame */ })
game.start()
```

## Constructors

### Constructor

> **new Game**(`options`): `Game`

Defined in: [src/core/Game.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L111)

#### Parameters

##### options

[`GameOptions`](../interfaces/GameOptions.md)

#### Returns

`Game`

## Properties

### camera

> `readonly` **camera**: `PerspectiveCamera` \| `OrthographicCamera`

Defined in: [src/core/Game.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L92)

Câmera principal do jogo (perspectiva em 3D/2.5D, ortográfica em 2D/pixel).

***

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L100)

Canvas de render.

***

### input

> `readonly` **input**: [`InputManager`](InputManager.md)

Defined in: [src/core/Game.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L98)

Gerenciador de input (já anexado ao `document.body`).

***

### pixelsPerUnit

> `readonly` **pixelsPerUnit**: `number`

Defined in: [src/core/Game.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L94)

Pixels de tela por unidade de mundo (câmera ortográfica). `0` em perspectiva.

***

### renderer

> `readonly` **renderer**: [`Renderer`](Renderer.md)

Defined in: [src/core/Game.ts:88](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L88)

Renderer WebGPU (auto-resize).

***

### scene

> `readonly` **scene**: [`Scene`](Scene.md)

Defined in: [src/core/Game.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L90)

Cena do jogo.

***

### world

> `readonly` **world**: [`World`](World.md)

Defined in: [src/core/Game.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L96)

Mundo ECS — registre sistemas com `world.addSystem(...)`.

## Accessors

### editorActive

#### Get Signature

> **get** **editorActive**(): `boolean`

Defined in: [src/core/Game.ts:188](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L188)

`true` quando o editor (F2) está ativo. Use pra pausar a gameplay enquanto
edita: `system.pauseWhen = () => game.editorActive`. `false` se não há editor
(produção) ou está fechado.

##### Returns

`boolean`

***

### gameplayPaused

#### Get Signature

> **get** **gameplayPaused**(): `boolean`

Defined in: [src/core/Game.ts:197](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L197)

`true` quando a gameplay está **pausada** durante o play (pause Unity-style,
acionado pelo transport da IDE). Combine com `editorActive` pra pausar
sistemas: `system.pauseWhen = () => game.editorActive || game.gameplayPaused`.

##### Returns

`boolean`

***

### hasEditor

#### Get Signature

> **get** **hasEditor**(): `boolean`

Defined in: [src/core/Game.ts:179](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L179)

`true` se o editor está ligado (bundle de dev).

##### Returns

`boolean`

## Methods

### onUpdate()

> **onUpdate**(`callback`): `void`

Defined in: [src/core/Game.ts:174](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L174)

Registra um callback chamado a cada frame (delta em **segundos**), antes do
`world.tick`. É o lugar pra lógica de jogo que não está num System.

#### Parameters

##### callback

(`deltaSeconds`) => `void`

#### Returns

`void`

***

### setActiveScene()

> **setActiveScene**(`scene`, `camera`): `void`

Defined in: [src/core/Game.ts:232](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L232)

**Multi-cena:** define a cena + câmera renderizadas a cada frame. Use pra telas
alternativas (criador de personagem, menus, troca de região) sem recriar o `Game`.
Sem argumentos (ou passando `game.scene`/`game.camera`), volta pra cena do jogo.

O `world` (ECS) e o input continuam os mesmos — pause os sistemas de gameplay
(`pauseWhen`) enquanto mostra outra cena. A cena alternativa renderiza **direto**
(sem o PostFX da cena do jogo). Tipicamente combinado com uma tela de loading
([createDomLoadingScreen](../functions/createDomLoadingScreen.md)) na transição. Ver ADR-0069.

#### Parameters

##### scene

[`Scene`](Scene.md)

##### camera

`PerspectiveCamera` \| `OrthographicCamera`

#### Returns

`void`

#### Example

```ts
game.setActiveScene(creatorScene, creatorCamera) // mostra o criador
// ...ao confirmar:
game.setActiveScene(game.scene, game.camera)      // volta pro jogo
```

***

### setPostFX()

> **setPostFX**(`postfx`): `void`

Defined in: [src/core/Game.ts:213](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L213)

Liga um pipeline de pós-processamento (tipicamente um `PostFX`) usado pra
renderizar o JOGO — é o principal lugar pra atmosfera (bloom, vignette, tone
mapping, exposição). Construa-o com `game.renderer/scene/camera` e passe aqui:
o `Game` chama `postfx.render()` no lugar de `renderer.render(...)`. No modo
editor, a renderização volta pra câmera livre crua (sem pós). Passe `null`
pra desligar.

#### Parameters

##### postfx

\{ `render`: `void`; \} \| `null`

#### Returns

`void`

#### Example

```ts
const fx = new PostFX(game.renderer, game.scene, game.camera, { bloom: { strength: 0.8 } })
game.setPostFX(fx)
```

***

### start()

> **start**(): `void`

Defined in: [src/core/Game.ts:268](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L268)

Inicia o loop.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/core/Game.ts:273](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L273)

Para o loop.

#### Returns

`void`
