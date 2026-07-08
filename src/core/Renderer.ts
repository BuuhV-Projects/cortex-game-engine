/**
 * Renderer — encapsula o `WebGPURenderer` do three com gerenciamento de canvas,
 * redimensionamento automático e câmera padrão.
 *
 * Usa **WebGPU** como backend **obrigatório** (ADR-0032): se WebGPU não estiver
 * disponível no ambiente, o construtor lança — não cai silenciosamente pra WebGL.
 * A opção `forceWebGL` é um escape hatch explícito (ex.: futuro suporte a 2D).
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001).
 *
 * O `WebGPURenderer` exige `await init()` antes do primeiro `render()`. Pra não
 * forçar todo projeto a virar async, o construtor dispara o init em background e
 * `render`/`clear`/`renderViewport` viram no-op até o backend ficar pronto
 * (poucos ms, normalmente escondidos por uma tela de loading). Quem quiser
 * determinismo pode `await renderer.init()` antes de iniciar o loop.
 *
 * Suporta split-screen (múltiplas viewports no mesmo canvas) via `clear()` +
 * `renderViewport()` — ver ADR-0023.
 *
 * Referência: ADR-0001 (Three.js), ADR-0032 (WebGPU), ADR-0023 (split-screen)
 */

import * as THREE from 'three';
// Importado explicitamente de `three/webgpu` (e não via THREE.*) pra facilitar o
// mock nos testes. No bundle, um alias `three` → `three/webgpu` unifica tudo numa
// só instância do three (evita o bug de dual-instance). Ver vite.engine.config.ts.
import { WebGPURenderer } from 'three/webgpu';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface RendererOptions {
  /** Elemento `<canvas>` onde a cena será renderizada. */
  canvas: HTMLCanvasElement;
  /** Largura inicial em pixels. */
  width: number;
  /** Altura inicial em pixels. */
  height: number;
  /**
   * Habilita anti-aliasing.
   * @default true
   */
  antialias?: boolean;
  /**
   * Escape hatch: usa o backend WebGL2 em vez de WebGPU. Por padrão o engine
   * **exige** WebGPU e lança se ele não estiver disponível (sem fallback
   * silencioso). Reservado para casos específicos (ex.: futuro suporte a 2D).
   * @default false
   */
  forceWebGL?: boolean;
}

/**
 * Retângulo de viewport em pixels (origem no canto inferior-esquerdo do
 * canvas, seguindo a convenção do WebGL).
 */
export interface Viewport {
  /** Coordenada X do canto inferior-esquerdo, em pixels. */
  x: number;
  /** Coordenada Y do canto inferior-esquerdo, em pixels. */
  y: number;
  /** Largura em pixels. */
  width: number;
  /** Altura em pixels. */
  height: number;
}

// ─── Re-exportação de câmera ───────────────────────────────────────────────────

/**
 * Câmera perspectiva padrão do motor.
 * Re-exportada aqui para que o restante do engine não precise importar
 * Three.js diretamente, mantendo o isolamento definido em ADR-0001.
 *
 * `Camera` é a classe base — útil para tipagem de variáveis que podem
 * receber `PerspectiveCamera` (gameplay) ou `OrthographicCamera`/câmera
 * de editor (ADR-0026, SceneEditor).
 */
export { Camera, PerspectiveCamera, OrthographicCamera } from 'three';

// ─── Classe Renderer ───────────────────────────────────────────────────────────

export class Renderer {
  private readonly _renderer: WebGPURenderer;
  /** Handler de resize mantido para remoção no dispose(). */
  private readonly _resizeHandler: () => void;

  private _width: number;
  private _height: number;

  /**
   * RenderTarget própria da UI de runtime no host nativo (ADR-0105). A UI é
   * desenhada aqui (em LINEAR, sem OETF — RenderTarget própria não passa pelo
   * output color space do three) e o host compõe sobre o jogo EM GAMA, casando
   * o blend translúcido com o DOM/CSS. Criada sob demanda em `renderUiLayer`.
   */
  private _uiTarget: THREE.RenderTarget | null = null;

  /** `true` quando o backend (WebGPU ou fallback WebGL2) terminou o init. */
  private _initialized = false;
  /** Promessa do init do backend — resolvida quando `render()` pode ser chamado. */
  private readonly _ready: Promise<void>;

  /**
   * Cria o renderer, dispara o init assíncrono do backend em background e
   * registra o listener de redimensionamento automático quando em browser.
   */
  constructor({ canvas, width, height, antialias = true, forceWebGL = false }: RendererOptions) {
    this._width = width;
    this._height = height;

    // WebGPU é obrigatório: se o ambiente não expõe `navigator.gpu`, abortamos
    // em vez de deixar o WebGPURenderer cair silenciosamente pro WebGL2 (o
    // fallback interno dele não é desligável por opção). `forceWebGL` ignora.
    if (
      !forceWebGL &&
      typeof navigator !== 'undefined' &&
      !(navigator as Navigator & { gpu?: unknown }).gpu
    ) {
      throw new Error(
        'Renderer: WebGPU não está disponível neste ambiente e é obrigatório. ' +
          'Atualize o navegador/WebView para um com suporte a WebGPU.',
      );
    }

    this._renderer = new WebGPURenderer({ canvas, antialias, forceWebGL });
    this._renderer.setSize(width, height);

    // Split-screen exige autoClear=false para que renders sucessivos de
    // viewports não apaguem os anteriores. O chamador deve usar `clear()`
    // uma vez por frame antes do primeiro `render*()`. Para o caso mais
    // comum (1 câmera por frame), `render()` chama `clear()` internamente.
    this._renderer.autoClear = false;

    if (typeof window !== 'undefined') {
      this._renderer.setPixelRatio(window.devicePixelRatio);
    }

    // Init assíncrono do backend (WebGPU → fallback WebGL2). Até resolver, os
    // métodos de render são no-op. Erros são logados (não derrubam o jogo).
    this._ready = this._renderer
      .init()
      .then(() => {
        this._initialized = true;
      })
      .catch((err: unknown) => {
        console.error('Renderer: falha ao inicializar o backend WebGPU/WebGL2:', err);
      });

    // Redimensiona para as dimensões internas da janela a cada resize.
    this._resizeHandler = (): void => {
      if (typeof window !== 'undefined') {
        this.resize(window.innerWidth, window.innerHeight);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this._resizeHandler);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Promessa resolvida quando o backend terminou de inicializar. Opcional —
   * `render()` já pula frames até estar pronto. Útil pra aguardar antes de
   * esconder uma tela de loading.
   */
  init(): Promise<void> {
    return this._ready;
  }

  /** `true` quando o backend está pronto e `render()` efetivamente desenha. */
  get isReady(): boolean {
    return this._initialized;
  }

  /**
   * Renderiza a `scene` usando a `camera` fornecida.
   * Deve ser chamado a cada frame pelo `GameLoop`. No-op enquanto o backend
   * ainda não inicializou.
   *
   * Limpa o canvas antes de renderizar — mantém o comportamento "1 câmera
   * por frame". Para split-screen, use `clear()` + `renderViewport()`.
   */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this._initialized || this._width <= 0 || this._height <= 0) return; // canvas 0×0 → WebGPU recusa
    this._renderer.clear();
    this._renderer.render(scene, camera);
  }

  /**
   * Limpa o canvas inteiro (color, depth e stencil buffers). No-op antes do init.
   *
   * Deve ser chamado uma vez por frame **antes do primeiro `renderViewport()`**
   * quando se usa split-screen.
   */
  clear(): void {
    if (!this._initialized || this._width <= 0 || this._height <= 0) return;
    this._renderer.clear();
  }

  /**
   * Renderiza `scene` com `camera` em uma região retangular do canvas
   * (sem limpar — use `clear()` antes do primeiro chamado do frame). No-op
   * antes do init.
   *
   * @example
   * // Split-screen horizontal de 2 jogadores:
   * renderer.clear();
   * renderer.renderViewport(scene, p1Camera, { x: 0,     y: 0, width: w / 2, height: h });
   * renderer.renderViewport(scene, p2Camera, { x: w / 2, y: 0, width: w / 2, height: h });
   */
  renderViewport(scene: THREE.Scene, camera: THREE.Camera, viewport: Viewport): void {
    if (!this._initialized || this._width <= 0 || this._height <= 0) return;
    const { x, y, width, height } = viewport;
    this._renderer.setViewport(x, y, width, height);
    this._renderer.setScissor(x, y, width, height);
    this._renderer.setScissorTest(true);
    this._renderer.render(scene, camera);
    this._renderer.setScissorTest(false);
  }

  /**
   * Renderiza `scene` (a UI de runtime) numa **RenderTarget própria** e devolve o
   * objeto GPUTexture do backend, pro host nativo compor sobre o jogo EM GAMA
   * (ADR-0105). Diferente de `renderViewport` (que desenha por cima do frame e
   * blenda no buffer LINEAR interno do three → lavado), uma RenderTarget própria:
   * - escreve **LINEAR premultiplicado, sem OETF** (o three só aplica o output
   *   color space no caminho do canvas, não numa RT própria); e
   * - **não toca estado global** do renderer (`outputColorSpace`/`toneMapping`).
   *
   * O host desembrulha a textura e compõe `out = game_srgb·(1−a) + OETF(ui/a)·a`
   * (blend em gama = igual ao CSS). Devolve `null` se o backend ainda não iniciou
   * ou se não der pra obter a textura (o chamador cai no caminho antigo).
   *
   * As cores de UI **não** precisam de tratamento especial: saem lineares aqui e o
   * `OETF(ui/a)` do host recupera a cor sRGB autorada (opaco fica bit-exato).
   */
  renderUiLayer(
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
  ): unknown {
    if (!this._initialized || width <= 0 || height <= 0) return null;
    if (!this._uiTarget || this._uiTarget.width !== width || this._uiTarget.height !== height) {
      this._uiTarget?.dispose();
      this._uiTarget = new THREE.RenderTarget(width, height, {
        type: THREE.HalfFloatType, // linear em 16f: sem banding nos tons escuros do scrim
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    }
    // Clear transparente do alvo da UI (autoClear é false globalmente → explícito).
    // Salva/restaura a cor de clear global pra não vazar pro render do jogo.
    const prevColor = new THREE.Color();
    // getClearColor do WebGPURenderer tipa `Color4` (com `.a`); em runtime aceita
    // um `Color` (só preenche r/g/b). O alpha vem do getClearAlpha à parte.
    (this._renderer.getClearColor as unknown as (t: THREE.Color) => void)(prevColor);
    const prevAlpha = this._renderer.getClearAlpha();
    this._renderer.setRenderTarget(this._uiTarget);
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.clear(true, false, false);
    this._renderer.render(scene, camera);
    this._renderer.setRenderTarget(null);
    this._renderer.setClearColor(prevColor, prevAlpha);
    // Handle da GPUTexture do backend (o host embrulha as texturas com wrapHandle,
    // então este mesmo objeto desembrulha pro WGPUTexture no passe de composição).
    const backend = (
      this._renderer as unknown as {
        backend?: { get(t: unknown): { texture?: unknown } | undefined };
      }
    ).backend;
    return backend?.get(this._uiTarget.texture)?.texture ?? null;
  }

  /**
   * Redimensiona o canvas e o viewport do renderer.
   * Chamado automaticamente pelo listener de `window.resize`; também pode ser
   * chamado manualmente quando o canvas não ocupa a janela inteira.
   */
  resize(width: number, height: number): void {
    // WebGPU não cria swapchain/depth buffer de tamanho 0 (canvas oculto, painel recolhido
    // ou resize transitório pra 0×0) → invalidaria o device com "texture of size 0". Ignora
    // dimensões inválidas; mantém o último tamanho bom.
    if (!(width > 0) || !(height > 0)) return;
    this._width = width;
    this._height = height;
    this._renderer.setSize(width, height);
  }

  /**
   * Remove o listener de resize e libera os recursos GPU do renderer.
   * Deve ser chamado ao destruir a cena para evitar vazamentos de memória.
   */
  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._resizeHandler);
    }
    this._uiTarget?.dispose();
    this._uiTarget = null;
    this._renderer.dispose();
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  /** Largura atual do canvas em pixels. */
  get width(): number {
    return this._width;
  }

  /** Altura atual do canvas em pixels. */
  get height(): number {
    return this._height;
  }

  /** Elemento `<canvas>` onde o renderer desenha. */
  get domElement(): HTMLCanvasElement {
    return this._renderer.domElement;
  }

  /**
   * Instância interna do `WebGPURenderer`.
   * Exposta para casos avançados: pós-processamento (passar pra `PostProcessing`
   * de `three/webgpu`) e geração de environment maps. Prefira os métodos
   * públicos da classe sempre que possível.
   */
  get threeRenderer(): WebGPURenderer {
    return this._renderer;
  }
}
