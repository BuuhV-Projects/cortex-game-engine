[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Game

# Class: Game

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L95)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L159)

#### Parameters

##### options

[`GameOptions`](../interfaces/GameOptions.md)

#### Returns

`Game`

## Properties

### actions

> `readonly` **actions**: [`InputActions`](InputActions.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:131](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L131)

**Ações de input remapeáveis** (ADR-0164) — a leitura por NOME (`jump`,
`moveForward`, `uiConfirm`) em vez de tecla crua, com bindings que o
jogador troca na tela de Controles (SPEC-0165) e que persistem no
`config.ini`. Polado 1×/frame no `_tick`, logo depois do `gamepad.poll()`,
então `pressed()` tem borda correta em qualquer System.

O jogo declara as ações DELE com `game.actions.define(...)`; a engine só
traz o mínimo que os sistemas dela consomem.

#### Example

```ts
game.actions.loadFrom(await GameConfig.load());
if (game.actions.pressed('jump')) body.jump();
```

***

### camera

> `readonly` **camera**: `OrthographicCamera` \| `PerspectiveCamera`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L101)

Câmera principal do jogo (perspectiva em 3D/2.5D, ortográfica em 2D/pixel).

***

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L133)

Canvas de render.

***

### gamepad

> `readonly` **gamepad**: [`GamepadManager`](GamepadManager.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L115)

Gamepad (Xbox-first): polado automaticamente 1×/frame no início do `_tick`, antes
dos sistemas/`onUpdate` — então qualquer System lê o estado fresco via
`game.gamepad.getAxis(0, …)` / `isButtonDown(0, …)`. Layout padrão: A=0, B=1, X=2,
Y=3, LB=4, RB=5, LT=6, RT=7; eixos 0/1=stick esquerdo, 2/3=stick direito.

***

### input

> `readonly` **input**: [`InputManager`](InputManager.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L107)

Gerenciador de input (já anexado ao `document.body`).

***

### pixelsPerUnit

> `readonly` **pixelsPerUnit**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:103](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L103)

Pixels de tela por unidade de mundo (câmera ortográfica). `0` em perspectiva.

***

### profiler

> `readonly` **profiler**: `FrameProfiler`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:141](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L141)

**Profiler por-subsistema do frame** (SPEC-0134) — mede `input`/`update`/
`world`/`ui`/`render` a cada tick. Fica ligado só com o HUD de debug ativo
(custo ≈ zero quando desligado). Exposto pra ferramentas/benchmark lerem o
breakdown (`game.profiler.summary()`).

***

### renderer

> `readonly` **renderer**: [`Renderer`](Renderer.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:97](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L97)

Renderer WebGPU (auto-resize).

***

### scene

> `readonly` **scene**: [`Scene`](Scene.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:99](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L99)

Cena do jogo.

***

### world

> `readonly` **world**: [`World`](World.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:105](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L105)

Mundo ECS — registre sistemas com `world.addSystem(...)`.

## Accessors

### editorActive

#### Get Signature

> **get** **editorActive**(): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:287](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L287)

`true` quando o editor (F2) está ativo. Use pra pausar a gameplay enquanto
edita: `system.pauseWhen = () => game.editorActive`. `false` se não há editor
(produção) ou está fechado.

##### Returns

`boolean`

***

### gameplayPaused

#### Get Signature

> **get** **gameplayPaused**(): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:296](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L296)

`true` quando a gameplay está **pausada** durante o play (pause Unity-style,
acionado pelo transport da IDE). Combine com `editorActive` pra pausar
sistemas: `system.pauseWhen = () => game.editorActive || game.gameplayPaused`.

##### Returns

`boolean`

***

### hasEditor

#### Get Signature

> **get** **hasEditor**(): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L278)

`true` se o editor está ligado (bundle de dev).

##### Returns

`boolean`

***

### inspect

#### Get Signature

> **get** **inspect**(): [`InspectCamera`](InspectCamera.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:394](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L394)

**Câmera de inspeção** (SPEC-0131): câmera de perspectiva livre pra "ver" a
cena de qualquer ângulo por código, independente da câmera do jogo (que segue
o player) e do modo editor. Quando ativada (`orbit`/`pose`/`frame`), o render
do frame passa a usá-la (cru, sem pós); `clear()` volta ao normal. Criada sob
demanda. Usada pela tool de playtest do Chat IA e exposta em
`window.__cortexInspect` no bundle de dev.

##### Example

```ts
game.inspect.orbit({ yaw: 45, pitch: -30, dist: 20 }) // de lado, meia-altura
game.inspect.clear()                                   // volta pra câmera do jogo
```

##### Returns

[`InspectCamera`](InspectCamera.md)

***

### sceneDataUrl

#### Get Signature

> **get** **sceneDataUrl**(): `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:251](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L251)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:255](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L255)

##### Parameters

###### url

`string`

##### Returns

`void`

***

### ui

#### Get Signature

> **get** **ui**(): [`UiLayer`](UiLayer.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:368](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L368)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:265](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L265)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:273](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L273)

Registra um callback chamado a cada frame (delta em **segundos**), antes do
`world.tick`. É o lugar pra lógica de jogo que não está num System.

#### Parameters

##### callback

(`deltaSeconds`) => `void`

#### Returns

`void`

***

### reset()

> **reset**(`options?`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:507](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L507)

Reseta o jogo pra **trocar de cena/fase** sem recriar o `Game` (renderer,
câmera e canvas continuam): para o loop, esvazia o world com `dispose` dos
sistemas ([World.clear](World.md#clear) — libera o mundo do Rapier etc.), libera a GPU
da cena ([Scene.disposeAll](Scene.md#disposeall)), limpa a UI e zera o `onUpdate`.

O ESTADO DO JOGO fora do engine (áudio, música, timers próprios) é
responsabilidade do chamador. Depois do reset, re-registre os sistemas e
monte a próxima cena (ex.: `setupThirdPerson` + `buildScene`).

#### Parameters

##### options?

###### releaseAssets?

`boolean`

`true` também **despeja os caches de asset**
  ([clearSceneAssetCaches](../functions/clearSceneAssetCaches.md): GLTF/texturas/áudio/BVH ficam fora da RAM,
  e a próxima cena recarrega do zero). Default `false`: o cache por URL é
  proposital — trocar de fase reusa peças já carregadas. Use `true` nos
  pontos de troca "larga" (voltar ao menu, trocar de mundo). SPEC-0152.

#### Returns

`void`

#### Example

```ts
// "Voltar ao menu" sem recarregar a página (funciona no export nativo):
game.reset({ releaseAssets: true });
const level = await showMainMenu(game, LEVELS);
// ...re-setup + buildScene + game.start()...
```

***

### setActiveScene()

> **setActiveScene**(`scene`, `camera`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:341](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L341)

**Multi-cena:** define a cena + câmera renderizadas a cada frame. Use pra telas
alternativas (criador de personagem, menus, troca de região) sem recriar o `Game`.
Sem argumentos (ou passando `game.scene`/`game.camera`), volta pra cena do jogo.

O `world` (ECS) e o input continuam os mesmos — pause os sistemas de gameplay
(`pauseWhen`) enquanto mostra outra cena. A cena alternativa renderiza **direto**
(sem o PostFX da cena do jogo). Tipicamente combinado com uma tela de loading
([createDomLoadingScreen](../functions/createDomLoadingScreen.md)) na transição. Ver SPEC-0069.

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:457](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L457)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:312](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L312)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:476](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L476)

Inicia o loop.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Game.ts:481](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L481)

Para o loop.

#### Returns

`void`
