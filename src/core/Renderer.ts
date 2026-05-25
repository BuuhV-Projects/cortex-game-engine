/**
 * Renderer — encapsula THREE.WebGLRenderer com gerenciamento de canvas,
 * redimensionamento automático e câmera padrão.
 *
 * A integração com Three.js fica confinada a `src/core/` (ADR-0001); partes
 * externas do motor importam `PerspectiveCamera` daqui em vez de importar
 * Three.js diretamente.
 *
 * Referência: ADR-0001 (Renderizador baseado em Three.js)
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

// ─── Re-exportação de câmera ───────────────────────────────────────────────────

/**
 * Câmera perspectiva padrão do motor.
 * Re-exportada aqui para que o restante do engine não precise importar
 * Three.js diretamente, mantendo o isolamento definido em ADR-0001.
 */
export { PerspectiveCamera } from 'three';

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
   */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this._renderer.render(scene, camera);
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
