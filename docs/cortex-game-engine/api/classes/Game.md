[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Game

# Class: Game

Defined in: [src/core/Game.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L90)

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

Defined in: [src/core/Game.ts:129](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L129)

#### Parameters

##### options

[`GameOptions`](../interfaces/GameOptions.md)

#### Returns

`Game`

## Properties

### camera

> `readonly` **camera**: `OrthographicCamera` \| `PerspectiveCamera`

Defined in: [src/core/Game.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L96)

Câmera principal do jogo (perspectiva em 3D/2.5D, ortográfica em 2D/pixel).

***

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L112)

Canvas de render.

***

### gamepad

> `readonly` **gamepad**: [`GamepadManager`](GamepadManager.md)

Defined in: [src/core/Game.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L110)

Gamepad (Xbox-first): polado automaticamente 1×/frame no início do `_tick`, antes
dos sistemas/`onUpdate` — então qualquer System lê o estado fresco via
`game.gamepad.getAxis(0, …)` / `isButtonDown(0, …)`. Layout padrão: A=0, B=1, X=2,
Y=3, LB=4, RB=5, LT=6, RT=7; eixos 0/1=stick esquerdo, 2/3=stick direito.

***

### input

> `readonly` **input**: [`InputManager`](InputManager.md)

Defined in: [src/core/Game.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L102)

Gerenciador de input (já anexado ao `document.body`).

***

### pixelsPerUnit

> `readonly` **pixelsPerUnit**: `number`

Defined in: [src/core/Game.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L98)

Pixels de tela por unidade de mundo (câmera ortográfica). `0` em perspectiva.

***

### renderer

> `readonly` **renderer**: [`Renderer`](Renderer.md)

Defined in: [src/core/Game.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L92)

Renderer WebGPU (auto-resize).

***

### scene

> `readonly` **scene**: [`Scene`](Scene.md)

Defined in: [src/core/Game.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L94)

Cena do jogo.

***

### world

> `readonly` **world**: [`World`](World.md)

Defined in: [src/core/Game.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L100)

Mundo ECS — registre sistemas com `world.addSystem(...)`.

## Accessors

### editorActive

#### Get Signature

> **get** **editorActive**(): `boolean`

Defined in: [src/core/Game.ts:253](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L253)

`true` quando o editor (F2) está ativo. Use pra pausar a gameplay enquanto
edita: `system.pauseWhen = () => game.editorActive`. `false` se não há editor
(produção) ou está fechado.

##### Returns

`boolean`

***

### gameplayPaused

#### Get Signature

> **get** **gameplayPaused**(): `boolean`

Defined in: [src/core/Game.ts:262](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L262)

`true` quando a gameplay está **pausada** durante o play (pause Unity-style,
acionado pelo transport da IDE). Combine com `editorActive` pra pausar
sistemas: `system.pauseWhen = () => game.editorActive || game.gameplayPaused`.

##### Returns

`boolean`

***

### hasEditor

#### Get Signature

> **get** **hasEditor**(): `boolean`

Defined in: [src/core/Game.ts:244](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L244)

`true` se o editor está ligado (bundle de dev).

##### Returns

`boolean`

***

### sceneDataUrl

#### Get Signature

> **get** **sceneDataUrl**(): `string`

Defined in: [src/core/Game.ts:217](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L217)

Caminho do **overlay de cena** (scene-data) da fase/cena ATUAL — é de onde o
editor carrega e pra onde salva as edições (transform, física, scripts,
added/deleted…). Default `assets/scene-data.json`.

Jogos com **mais de uma fase** devem dar um arquivo POR FASE (senão objetos
adicionados numa fase vazam pra outra e o auto-save de uma sobrescreve as
edições da outra). Defina **logo depois de escolher a fase, antes do
`buildScene`** — o editor recarrega o overlay do caminho novo (edições
feitas antes da troca não são migradas). Use o MESMO caminho no
`SceneLoader.loadSceneFile(...)` que alimenta o `buildScene`.

##### Example

```ts
const level = await showMenu(LEVELS)
game.sceneDataUrl = level.overlayUrl // ex.: 'assets/scene-data-fase2.json'
const overlay = await new SceneLoader().loadSceneFile(level.overlayUrl)
```

##### Returns

`string`

#### Set Signature

> **set** **sceneDataUrl**(`url`): `void`

Defined in: [src/core/Game.ts:221](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L221)

##### Parameters

###### url

`string`

##### Returns

`void`

***

### ui

#### Get Signature

> **get** **ui**(): [`UiLayer`](UiLayer.md)

Defined in: [src/core/Game.ts:324](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L324)

**UI de runtime** (ADR-0102): HUD/menus/diálogos que funcionam idênticos
no Studio (DOM) e no CortexNative/console (renderer) com navegação por
gamepad embutida. Criada sob demanda; o `Game` atualiza e desenha por
frame automaticamente.

##### Example

```ts
const coins = game.ui.add(new UiLabel({ anchor: 'top-left', x: 16, y: 12, text: 'x0' }));
coins.set({ text: 'x7' });
```

##### Returns

[`UiLayer`](UiLayer.md)

## Methods

### onSceneDataUrlChange()

> **onSceneDataUrlChange**(`callback`): `void`

Defined in: [src/core/Game.ts:231](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L231)

Registra um callback pra mudança do [sceneDataUrl](#scenedataurl) (o editor usa pra
recarregar o overlay quando o jogo troca de fase).

#### Parameters

##### callback

(`url`) => `void`

#### Returns

`void`

***

### onUpdate()

> **onUpdate**(`callback`): `void`

Defined in: [src/core/Game.ts:239](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L239)

Registra um callback chamado a cada frame (delta em **segundos**), antes do
`world.tick`. É o lugar pra lógica de jogo que não está num System.

#### Parameters

##### callback

(`deltaSeconds`) => `void`

#### Returns

`void`

***

### reset()

> **reset**(): `void`

Defined in: [src/core/Game.ts:413](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L413)

Reseta o jogo pra **trocar de cena/fase** sem recriar o `Game` (renderer,
câmera e canvas continuam): para o loop, esvazia o world com `dispose` dos
sistemas ([World.clear](World.md#clear) — libera o mundo do Rapier etc.), libera a GPU
da cena ([Scene.disposeAll](Scene.md#disposeall)), limpa a UI e zera o `onUpdate`.

O ESTADO DO JOGO fora do engine (áudio, música, timers próprios) é
responsabilidade do chamador. Depois do reset, re-registre os sistemas e
monte a próxima cena (ex.: `setupThirdPerson` + `buildScene`).

#### Returns

`void`

#### Example

```ts
// "Voltar ao menu" sem recarregar a página (funciona no export nativo):
game.reset();
const level = await showMainMenu(game, LEVELS);
// ...re-setup + buildScene + game.start()...
```

***

### setActiveScene()

> **setActiveScene**(`scene`, `camera`): `void`

Defined in: [src/core/Game.ts:297](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L297)

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

`OrthographicCamera` \| `PerspectiveCamera`

#### Returns

`void`

#### Example

```ts
game.setActiveScene(creatorScene, creatorCamera) // mostra o criador
// ...ao confirmar:
game.setActiveScene(game.scene, game.camera)      // volta pro jogo
```

***

### setDebugHud()

> **setDebugHud**(`enabled?`): `void`

Defined in: [src/core/Game.ts:372](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L372)

Liga/desliga o **HUD de métricas** (FPS/frame ms, CPU, memória, GPU) em
runtime — é o que o menu **View › HUD de métricas** do Studio aciona (via
ponte do editor) e que o export `--debug` liga por padrão. Sem argumento,
alterna o estado atual.

#### Parameters

##### enabled?

`boolean`

#### Returns

`void`

***

### setPostFX()

> **setPostFX**(`postfx`): `void`

Defined in: [src/core/Game.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L278)

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

Defined in: [src/core/Game.ts:388](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L388)

Inicia o loop.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/core/Game.ts:393](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L393)

Para o loop.

#### Returns

`void`
