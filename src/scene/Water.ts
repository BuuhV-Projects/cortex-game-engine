import {
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Color,
  RepeatWrapping,
  type ColorRepresentation,
  type Texture,
} from 'three';
import { Scene } from '../core/Scene.js';
import { AssetLoader } from '../core/AssetLoader.js';

/** Opções de {@link Water}. Todas opcionais — os defaults dão uma água cartoon. */
export interface WaterOptions {
  /** Lado do plano (quadrado), em unidades. Default `400`. */
  size?: number;
  /** Altura (Y) da superfície. Default `0`. */
  y?: number;
  /** Cor base da água. Default azul-céu pastel (`0xa8d8f5`). */
  color?: ColorRepresentation;
  /**
   * URL (relativa à raiz do projeto) de uma textura de cáusticas — o brilho
   * cintilante da luz no fundo da água. Carregada de forma assíncrona e aplicada
   * como `map` tiled quando pronta. Omita pra uma água lisa só com a cor base.
   */
  causticsUrl?: string;
  /** Repetições (tiling) da textura de cáusticas em cada eixo. Default `8`. */
  repeat?: number;
  /** Rugosidade PBR (0 = espelho, 1 = fosco). Default `0.35`. */
  roughness?: number;
  /** Metalicidade PBR. Default `0.05`. */
  metalness?: number;
  /**
   * Velocidade de deslize da textura de cáusticas (offset/seg), pra dar sensação
   * de movimento. `0` = parada. Requer chamar {@link Water.update} no loop.
   * Default `0.015`.
   */
  flowSpeed?: number;
}

/**
 * Água simples (experimental) pra cenários de ilhas/plataforma: um plano
 * horizontal grande com material PBR cartoon e, opcionalmente, uma textura de
 * **cáusticas** tiled e animada (offset deslizante) pra simular o brilho da luz
 * na superfície.
 *
 * Não é um shader de água físico (sem reflexão/refração/foam/ondas reais) — é
 * uma aproximação visual barata, boa pra protótipos e cenas low-poly. Pra um
 * mar realista, um shader custom WebGPU (TSL) seria necessário.
 *
 * @example
 * // Água parada lisa:
 * new Water(scene, { y: -1.5, color: 0x3b6e8f })
 *
 * @example
 * // Água com cáusticas animadas (chame update no loop):
 * const water = new Water(scene, { y: -1.5, causticsUrl: 'assets/textures/caustics.png' })
 * // no GameLoop.onUpdate:
 * water.update(deltaTime / 1000)
 */
export class Water {
  /** O `Mesh` do plano de água, já adicionado à cena. */
  readonly mesh: Mesh;

  private readonly material: MeshStandardMaterial;
  private map: Texture | null = null;
  private readonly flowSpeed: number;
  private offset = 0;

  constructor(scene: Scene, options: WaterOptions = {}) {
    const {
      size = 400,
      y = 0,
      color = 0xa8d8f5,
      causticsUrl,
      repeat = 8,
      roughness = 0.35,
      metalness = 0.05,
      flowSpeed = 0.015,
    } = options;

    this.flowSpeed = flowSpeed;
    this.material = new MeshStandardMaterial({ color: new Color(color), roughness, metalness });

    this.mesh = new Mesh(new PlaneGeometry(size, size), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = y;
    this.mesh.name = 'Water';
    scene.add(this.mesh);

    if (causticsUrl) {
      // Carrega as cáusticas em segundo plano; aplica como map quando pronta —
      // não bloqueia o resto do setup da cena.
      new AssetLoader()
        .loadTexture(causticsUrl)
        .then((tex) => {
          tex.wrapS = RepeatWrapping;
          tex.wrapT = RepeatWrapping;
          tex.repeat.set(repeat, repeat);
          this.material.map = tex;
          this.material.needsUpdate = true;
          this.map = tex;
        })
        .catch((err) => console.warn('[Water] cáusticas não carregaram:', err));
    }
  }

  /**
   * Anima as cáusticas deslizando o offset da textura. Chame uma vez por frame
   * passando o delta em **segundos** (`deltaTime / 1000`). No-op se não houver
   * textura de cáusticas ou se `flowSpeed` for `0`.
   *
   * @param deltaSeconds - Tempo decorrido desde o último frame, em segundos.
   */
  update(deltaSeconds: number): void {
    if (!this.map || this.flowSpeed === 0) return;
    this.offset = (this.offset + deltaSeconds * this.flowSpeed) % 1;
    this.map.offset.set(this.offset, this.offset);
  }
}
