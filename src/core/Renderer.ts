/**
 * Renderer — encapsula THREE.WebGLRenderer com gerenciamento de canvas,
 * redimensionamento automático e câmera padrão.
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001); partes
 * externas do motor importam `PerspectiveCamera` daqui em vez de importar
 * Three.js diretamente.
 *
 * Suporta também split-screen (múltiplas viewports no mesmo canvas) via
 * `clear()` + `renderViewport()` — ver ADR-0023.
 *
 * Referência: ADR-0001 (Renderizador baseado em Three.js),
 *             ADR-0023 (Split-screen e gamepad no engine)
 */

import * as THREE from 'three';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface RendererOptions {
  /** Elemento `<canvas>` onde a cena será renderizada. */
  canvas: HTMLCanvasElement;
  /** Largura inicial em pixels. */
  width: number;
  /** Altura inicial em pixels. */
  height: number;
  /**
   * Habilita anti-aliasing no WebGLRenderer.
   * @default true
   */
  antialias?: boolean;
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
  private readonly _renderer: THREE.WebGLRenderer;
  /** Handler de resize mantido para remoção no dispose(). */
  private readonly _resizeHandler: () => void;

  private _width: number;
  private _height: number;

  /**
   * Cria o renderer e registra o listener de redimensionamento automático
   * quando executando em ambiente browser (`window` disponível).
   */
  constructor({ canvas, width, height, antialias = true }: RendererOptions) {
    this._width = width;
    this._height = height;

    this._renderer = new THREE.WebGLRenderer({ canvas, antialias });
    this._renderer.setSize(width, height);

    // Split-screen exige autoClear=false para que renders sucessivos de
    // viewports não apaguem os anteriores. O chamador deve usar `clear()`
    // uma vez por frame antes do primeiro `render*()`. Para o caso mais
    // comum (1 câmera por frame), `render()` chama `clear()` internamente.
    this._renderer.autoClear = false;

    if (typeof window !== 'undefined') {
      this._renderer.setPixelRatio(window.devicePixelRatio);
    }

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
   * Renderiza a `scene` usando a `camera` fornecida.
   * Deve ser chamado a cada frame pelo `GameLoop`.
   *
   * Limpa o canvas antes de renderizar — mantém o comportamento "1 câmera
   * por frame" sem que o chamador precise se preocupar com viewports.
   * Para split-screen, use `clear()` + `renderViewport()` em vez deste.
   */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this._renderer.clear();
    this._renderer.render(scene, camera);
  }

  /**
   * Limpa o canvas inteiro (color, depth e stencil buffers).
   *
   * Deve ser chamado uma vez por frame **antes do primeiro `renderViewport()`**
   * quando se usa split-screen. Sem isso, o frame anterior fica visível
   * fora das áreas cobertas pelas viewports.
   */
  clear(): void {
    this._renderer.clear();
  }

  /**
   * Renderiza `scene` com `camera` em uma região retangular do canvas
   * (sem limpar — use `clear()` antes do primeiro chamado do frame).
   *
   * Internamente liga o scissor test para evitar que pixels fora da
   * viewport sejam tocados e o desliga ao final.
   *
   * @example
   * // Split-screen horizontal de 2 jogadores:
   * renderer.clear();
   * renderer.renderViewport(scene, p1Camera, { x: 0,           y: 0, width: w / 2, height: h });
   * renderer.renderViewport(scene, p2Camera, { x: w / 2,       y: 0, width: w / 2, height: h });
   */
  renderViewport(scene: THREE.Scene, camera: THREE.Camera, viewport: Viewport): void {
    const { x, y, width, height } = viewport;
    this._renderer.setViewport(x, y, width, height);
    this._renderer.setScissor(x, y, width, height);
    this._renderer.setScissorTest(true);
    this._renderer.render(scene, camera);
    this._renderer.setScissorTest(false);
  }

  /**
   * Redimensiona o canvas e o viewport do renderer.
   * Chamado automaticamente pelo listener de `window.resize`; também pode ser
   * chamado manualmente quando o canvas não ocupa a janela inteira.
   */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._renderer.setSize(width, height);
  }

  /**
   * Remove o listener de resize e libera recursos WebGL do renderer.
   * Deve ser chamado ao destruir a cena para evitar vazamentos de memória.
   */
  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this._resizeHandler);
    }
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

  /**
   * Instância interna do `THREE.WebGLRenderer`.
   * Exposta apenas para casos avançados (ex: pós-processamento).
   * Prefira sempre os métodos públicos da classe.
   */
  get domElement(): HTMLCanvasElement {
    return this._renderer.domElement;
  }
}
