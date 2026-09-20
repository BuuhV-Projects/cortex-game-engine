[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Renderer

# Class: Renderer

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L81)

## Constructors

### Constructor

> **new Renderer**(`__namedParameters`): `Renderer`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L114)

Cria o renderer, dispara o init assíncrono do backend em background e
registra o listener de redimensionamento automático quando em browser.

#### Parameters

##### \_\_namedParameters

[`RendererOptions`](../interfaces/RendererOptions.md)

#### Returns

`Renderer`

## Accessors

### domElement

#### Get Signature

> **get** **domElement**(): `HTMLCanvasElement`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:410](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L410)

Elemento `<canvas>` onde o renderer desenha.

##### Returns

`HTMLCanvasElement`

***

### height

#### Get Signature

> **get** **height**(): `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:405](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L405)

Altura atual do canvas em pixels.

##### Returns

`number`

***

### isReady

#### Get Signature

> **get** **isReady**(): `boolean`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:180](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L180)

`true` quando o backend está pronto e `render()` efetivamente desenha.

##### Returns

`boolean`

***

### threeRenderer

#### Get Signature

> **get** **threeRenderer**(): `WebGPURenderer`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:420](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L420)

Instância interna do `WebGPURenderer`.
Exposta para casos avançados: pós-processamento (passar pra `PostProcessing`
de `three/webgpu`) e geração de environment maps. Prefira os métodos
públicos da classe sempre que possível.

##### Returns

`WebGPURenderer`

***

### width

#### Get Signature

> **get** **width**(): `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:400](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L400)

Largura atual do canvas em pixels.

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:230](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L230)

Limpa o canvas inteiro (color, depth e stencil buffers). No-op antes do init.

Deve ser chamado uma vez por frame **antes do primeiro `renderViewport()`**
quando se usa split-screen.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:386](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L386)

Remove o listener de resize e libera os recursos GPU do renderer.
Deve ser chamado ao destruir a cena para evitar vazamentos de memória.

#### Returns

`void`

***

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:175](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L175)

Promessa resolvida quando o backend terminou de inicializar. Opcional —
`render()` já pula frames até estar pronto. Útil pra aguardar antes de
esconder uma tela de loading.

#### Returns

`Promise`\<`void`\>

***

### precompile()

> **precompile**(`scene`, `camera`): `Promise`\<`void`\>

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:201](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L201)

**Pré-aquece os pipelines** da cena (SPEC-0196) — compila shaders e cria os
pipelines ANTES do primeiro frame em que cada objeto aparece.

Sem isto, o three compila na primeira aparição: quando a corrida começa e os
carros entram em tela de uma vez, as compilações caem todas no mesmo frame e
o jogo trava por alguns quadros. Aqui o custo sai do gameplay e vai pro load
(onde já existe tela de carregamento).

Aguarda o init do backend; no-op onde o renderer não expõe `compileAsync`
(mocks de teste). Chame de novo ao criar objetos novos — o three só compila
o que ainda não tem pipeline.

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

#### Returns

`Promise`\<`void`\>

#### Example

```ts
await buildScene(...)
await game.renderer.precompile(game.scene.getThreeScene(), game.camera)
```

***

### render()

> **render**(`scene`, `camera`): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:218](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L218)

Renderiza a `scene` usando a `camera` fornecida.
Deve ser chamado a cada frame pelo `GameLoop`. No-op enquanto o backend
ainda não inicializou.

Limpa o canvas antes de renderizar — mantém o comportamento "1 câmera
por frame". Para split-screen, use `clear()` + `renderViewport()`.

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

#### Returns

`void`

***

### renderSceneHDR()

> **renderSceneHDR**(`scene`, `camera`): `unknown`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:327](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L327)

Renderiza a `scene` numa **RenderTarget HDR própria** (linear, sem tone
mapping) e devolve o handle da GPUTexture do backend, pro host nativo fazer
bloom + tone mapping em HDR (ADR-0149). É o que dá **paridade com o Studio**:
o bloom do três roda em HDR (valores emissivos acima de 1.0 brilham forte),
enquanto o bloom nativo LDR (sobre a imagem já tonemapeada) saía mais fraco.

A RT tem **depth buffer** (cena 3D) e formato HalfFloat. O tone mapping fica
DESLIGADO aqui de propósito — quem aplica ACES é o composite do host, depois
do bloom precisar dos valores HDR. `width`/`height` são o tamanho SS (o host
faz o downscale no composite).

Devolve `null` se o backend não iniciou (o chamador cai no caminho antigo).

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

#### Returns

`unknown`

***

### renderUiLayer()

> **renderUiLayer**(`scene`, `camera`, `width`, `height`): `unknown`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:272](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L272)

Renderiza `scene` (a UI de runtime) numa **RenderTarget própria** e devolve o
objeto GPUTexture do backend, pro host nativo compor sobre o jogo EM GAMA
(ADR-0105). Diferente de `renderViewport` (que desenha por cima do frame e
blenda no buffer LINEAR interno do three → lavado), uma RenderTarget própria:
- escreve **LINEAR premultiplicado, sem OETF** (o three só aplica o output
  color space no caminho do canvas, não numa RT própria); e
- **não toca estado global** do renderer (`outputColorSpace`/`toneMapping`).

O host desembrulha a textura e compõe `out = game_srgb·(1−a) + OETF(ui/a)·a`
(blend em gama = igual ao CSS). Devolve `null` se o backend ainda não iniciou
ou se não der pra obter a textura (o chamador cai no caminho antigo).

As cores de UI **não** precisam de tratamento especial: saem lineares aqui e o
`OETF(ui/a)` do host recupera a cor sRGB autorada (opaco fica bit-exato).

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

##### width

`number`

##### height

`number`

#### Returns

`unknown`

***

### renderViewport()

> **renderViewport**(`scene`, `camera`, `viewport`): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:246](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L246)

Renderiza `scene` com `camera` em uma região retangular do canvas
(sem limpar — use `clear()` antes do primeiro chamado do frame). No-op
antes do init.

#### Parameters

##### scene

`Scene`

##### camera

`Camera`

##### viewport

[`Viewport`](../interfaces/Viewport.md)

#### Returns

`void`

#### Example

```ts
// Split-screen horizontal de 2 jogadores:
renderer.clear();
renderer.renderViewport(scene, p1Camera, { x: 0,     y: 0, width: w / 2, height: h });
renderer.renderViewport(scene, p2Camera, { x: w / 2, y: 0, width: w / 2, height: h });
```

***

### resize()

> **resize**(`width`, `height`): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Renderer.ts:372](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L372)

Redimensiona o canvas e o viewport do renderer.
Chamado automaticamente pelo listener de `window.resize`; também pode ser
chamado manualmente quando o canvas não ocupa a janela inteira.

#### Parameters

##### width

`number`

##### height

`number`

#### Returns

`void`
