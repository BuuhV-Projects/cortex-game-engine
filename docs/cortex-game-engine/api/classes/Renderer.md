[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Renderer

# Class: Renderer

Defined in: [src/core/Renderer.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L81)

## Constructors

### Constructor

> **new Renderer**(`__namedParameters`): `Renderer`

Defined in: [src/core/Renderer.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L114)

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

Defined in: [src/core/Renderer.ts:384](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L384)

Elemento `<canvas>` onde o renderer desenha.

##### Returns

`HTMLCanvasElement`

***

### height

#### Get Signature

> **get** **height**(): `number`

Defined in: [src/core/Renderer.ts:379](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L379)

Altura atual do canvas em pixels.

##### Returns

`number`

***

### isReady

#### Get Signature

> **get** **isReady**(): `boolean`

Defined in: [src/core/Renderer.ts:180](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L180)

`true` quando o backend está pronto e `render()` efetivamente desenha.

##### Returns

`boolean`

***

### threeRenderer

#### Get Signature

> **get** **threeRenderer**(): `WebGPURenderer`

Defined in: [src/core/Renderer.ts:394](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L394)

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

Defined in: [src/core/Renderer.ts:374](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L374)

Largura atual do canvas em pixels.

##### Returns

`number`

## Methods

### clear()

> **clear**(): `void`

Defined in: [src/core/Renderer.ts:204](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L204)

Limpa o canvas inteiro (color, depth e stencil buffers). No-op antes do init.

Deve ser chamado uma vez por frame **antes do primeiro `renderViewport()`**
quando se usa split-screen.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/core/Renderer.ts:360](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L360)

Remove o listener de resize e libera os recursos GPU do renderer.
Deve ser chamado ao destruir a cena para evitar vazamentos de memória.

#### Returns

`void`

***

### init()

> **init**(): `Promise`\<`void`\>

Defined in: [src/core/Renderer.ts:175](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L175)

Promessa resolvida quando o backend terminou de inicializar. Opcional —
`render()` já pula frames até estar pronto. Útil pra aguardar antes de
esconder uma tela de loading.

#### Returns

`Promise`\<`void`\>

***

### render()

> **render**(`scene`, `camera`): `void`

Defined in: [src/core/Renderer.ts:192](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L192)

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

Defined in: [src/core/Renderer.ts:301](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L301)

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

Defined in: [src/core/Renderer.ts:246](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L246)

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

Defined in: [src/core/Renderer.ts:220](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L220)

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

Defined in: [src/core/Renderer.ts:346](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Renderer.ts#L346)

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
