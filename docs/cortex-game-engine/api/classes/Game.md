[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Game

# Class: Game

Defined in: [src/core/Game.ts:129](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L129)

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

Defined in: [src/core/Game.ts:291](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L291)

#### Parameters

##### options

[`GameOptions`](../interfaces/GameOptions.md)

#### Returns

`Game`

## Properties

### actions

> `readonly` **actions**: [`InputActions`](InputActions.md)

Defined in: [src/core/Game.ts:182](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L182)

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

> `readonly` **camera**: `PerspectiveCamera` \| `OrthographicCamera`

Defined in: [src/core/Game.ts:152](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L152)

Câmera principal do jogo (perspectiva em 3D/2.5D, ortográfica em 2D/pixel).

***

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:184](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L184)

Canvas de render.

***

### editorLevels?

> `optional` **editorLevels?**: readonly [`EditorLevel`](../interfaces/EditorLevel.md)[]

Defined in: [src/core/Game.ts:145](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L145)

**Fases que o Studio pode abrir direto** (ADR-0186), na ordem em que devem
aparecer. Declare no bootstrap:

```ts
game.editorLevels = LEVELS.map((l) => ({ id: l.id, label: nome(l), group: 'Mundo 1' }))
```

O Studio mostra um seletor no viewport e recarrega com `?level=<id>` — o
mesmo caminho que o jogo já usa para pular menu e hub. Sem isto o seletor
não aparece; a lista é a única coisa que o Studio não tem como descobrir
sozinho.

Fora do Studio (jogo standalone, build de produção) fica inerte.

***

### gamepad

> `readonly` **gamepad**: [`GamepadManager`](GamepadManager.md)

Defined in: [src/core/Game.ts:166](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L166)

Gamepad (Xbox-first): polado automaticamente 1×/frame no início do `_tick`, antes
dos sistemas/`onUpdate` — então qualquer System lê o estado fresco via
`game.gamepad.getAxis(0, …)` / `isButtonDown(0, …)`. Layout padrão: A=0, B=1, X=2,
Y=3, LB=4, RB=5, LT=6, RT=7; eixos 0/1=stick esquerdo, 2/3=stick direito.

***

### input

> `readonly` **input**: [`InputManager`](InputManager.md)

Defined in: [src/core/Game.ts:158](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L158)

Gerenciador de input (já anexado ao `document.body`).

***

### outlineMinRatio

> **outlineMinRatio**: `number` = `DEFAULT_OUTLINE_MIN_RATIO`

Defined in: [src/core/Game.ts:260](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L260)

Limiar `raio/distância` do corte da casca de contorno (ADR-0251). `0`
desliga o filtro e devolve a autoria. É público porque é uma escolha de
ESTILO do jogo, não da engine: quem autora sabe a que distância o contorno
dele deixa de ler.

***

### pixelsPerUnit

> `readonly` **pixelsPerUnit**: `number`

Defined in: [src/core/Game.ts:154](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L154)

Pixels de tela por unidade de mundo (câmera ortográfica). `0` em perspectiva.

***

### profiler

> `readonly` **profiler**: `FrameProfiler`

Defined in: [src/core/Game.ts:192](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L192)

**Profiler por-subsistema do frame** (SPEC-0134) — mede `input`/`update`/
`world`/`ui`/`render` a cada tick. Fica ligado só com o HUD de debug ativo
(custo ≈ zero quando desligado). Exposto pra ferramentas/benchmark lerem o
breakdown (`game.profiler.summary()`).

***

### renderer

> `readonly` **renderer**: [`Renderer`](Renderer.md)

Defined in: [src/core/Game.ts:148](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L148)

Renderer WebGPU (auto-resize).

***

### scene

> `readonly` **scene**: [`Scene`](Scene.md)

Defined in: [src/core/Game.ts:150](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L150)

Cena do jogo.

***

### world

> `readonly` **world**: [`World`](World.md)

Defined in: [src/core/Game.ts:156](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L156)

Mundo ECS — registre sistemas com `world.addSystem(...)`.

## Accessors

### editorActive

#### Get Signature

> **get** **editorActive**(): `boolean`

Defined in: [src/core/Game.ts:421](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L421)

`true` quando o editor (F2) está ativo. Use pra pausar a gameplay enquanto
edita: `system.pauseWhen = () => game.editorActive`. `false` se não há editor
(produção) ou está fechado.

##### Returns

`boolean`

***

### gameplayPaused

#### Get Signature

> **get** **gameplayPaused**(): `boolean`

Defined in: [src/core/Game.ts:430](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L430)

`true` quando a gameplay está **pausada** durante o play (pause Unity-style,
acionado pelo transport da IDE). Combine com `editorActive` pra pausar
sistemas: `system.pauseWhen = () => game.editorActive || game.gameplayPaused`.

##### Returns

`boolean`

***

### hasEditor

#### Get Signature

> **get** **hasEditor**(): `boolean`

Defined in: [src/core/Game.ts:412](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L412)

`true` se o editor está ligado (bundle de dev).

##### Returns

`boolean`

***

### inspect

#### Get Signature

> **get** **inspect**(): [`InspectCamera`](InspectCamera.md)

Defined in: [src/core/Game.ts:561](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L561)

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

### isLoading

#### Get Signature

> **get** **isLoading**(): `boolean`

Defined in: [src/core/Game.ts:463](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L463)

O jogo está em carregamento declarado? Ver [setLoading](#setloading).

##### Returns

`boolean`

***

### maxFps

#### Get Signature

> **get** **maxFps**(): `number`

Defined in: [src/core/Game.ts:274](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L274)

Teto de quadros por segundo (ADR-0257). `0` = sem teto (padrão). É escolha
do JOGO: frame time constante lê como mais fluido que uma taxa maior que
oscila.

Com vsync, só divisores do refresh do monitor dão frames de duração igual —
use [refreshHz](#refreshhz) para escolher. Com `debug('loop')` ligado, um teto que
não divide o refresh é avisado no log.

##### Example

```ts
game.maxFps = 60;
```

##### Returns

`number`

#### Set Signature

> **set** **maxFps**(`fps`): `void`

Defined in: [src/core/Game.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L278)

##### Parameters

###### fps

`number`

##### Returns

`void`

***

### refreshHz

#### Get Signature

> **get** **refreshHz**(): `number` \| `null`

Defined in: [src/core/Game.ts:283](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L283)

Refresh do monitor estimado nos primeiros frames (Hz), ou `null` até lá.

##### Returns

`number` \| `null`

***

### sceneDataUrl

#### Get Signature

> **get** **sceneDataUrl**(): `string`

Defined in: [src/core/Game.ts:385](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L385)

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

Defined in: [src/core/Game.ts:389](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L389)

##### Parameters

###### url

`string`

##### Returns

`void`

***

### ui

#### Get Signature

> **get** **ui**(): [`UiLayer`](UiLayer.md)

Defined in: [src/core/Game.ts:535](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L535)

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

Defined in: [src/core/Game.ts:399](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L399)

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

Defined in: [src/core/Game.ts:407](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L407)

Registra um callback chamado a cada frame (delta em **segundos**), antes do
`world.tick`. É o lugar pra lógica de jogo que não está num System.

#### Parameters

##### callback

(`deltaSeconds`) => `void`

#### Returns

`void`

***

### precompile()

> **precompile**(): `Promise`\<`void`\>

Defined in: [src/core/Game.ts:772](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L772)

**Pré-aquece os pipelines** da cena ativa (SPEC-0196) — compila os shaders
agora em vez de no primeiro frame em que cada objeto aparece, que é o que
causa o travadinho ao começar uma corrida/fase.

Desenha UM quadro de verdade (ADR-0262) com a cena inteira visível e sem
culling, pelo mesmo caminho do jogo (o `setPostFX` registrado, senão o
render direto), e restaura. Um render real gera as mesmas chaves de
pipeline que o jogo vai pedir — inclusive os dois passes do transparente
de duas faces, que o `compileAsync` errava.

Chame sob uma tela de carregamento OPACA: o quadro é apresentado. Crie antes
tudo o que o jogo só cria no uso (efeitos, projéteis) — objeto criado depois
compila na hora. Se o `setPostFX` do jogo escolhe caminhos diferentes
conforme o estado (um efeito que só liga em alta velocidade), force cada
caminho e chame de novo.

#### Returns

`Promise`\<`void`\>

#### Example

```ts
const player = await createCar(game, golf, golfRig)
await game.precompile()
game.start()
```

***

### reset()

> **reset**(`options?`): `void`

Defined in: [src/core/Game.ts:846](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L846)

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

Defined in: [src/core/Game.ts:508](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L508)

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

### setDebugHud()

> **setDebugHud**(`enabled?`): `void`

Defined in: [src/core/Game.ts:732](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L732)

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

### setLoading()

> **setLoading**(`active`): `void`

Defined in: [src/core/Game.ts:455](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L455)

Declara que o jogo está **carregando** (SPEC-0219).

Enquanto ligado, o `Game` desenha uma cena VAZIA no lugar do cenário — a
tela de carregamento do jogo aparece por cima, e o carregamento pode ceder
o frame barato (renderizar a cena inteira a cada frame cedido custava 626 ms
por frame no kart-racer). O `buildScene` já liga isso sozinho enquanto
monta; use quando a SUA carga continua depois dele (criar personagens,
carros, sistemas).

#### Parameters

##### active

`boolean`

#### Returns

`void`

#### Example

```ts
game.setLoading(true)
try {
  const scene = await buildScene(...)   // cede frames sozinho
  await criaOsCarros(scene)             // suas cargas também cedem
} finally {
  game.setLoading(false)                // volta a desenhar o jogo
}
```

***

### setPostFX()

> **setPostFX**(`postfx`): `void`

Defined in: [src/core/Game.ts:479](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L479)

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

Defined in: [src/core/Game.ts:815](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L815)

Inicia o loop.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/core/Game.ts:820](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L820)

Para o loop.

#### Returns

`void`
