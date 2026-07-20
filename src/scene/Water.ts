import {
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Color,
  RepeatWrapping,
  type ColorRepresentation,
  type OrthographicCamera,
  type PerspectiveCamera,
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
   * Intensidade do brilho das cáusticas (`emissiveIntensity`): a textura é usada
   * como `emissiveMap`, então áreas claras dela "acendem" a água puxando-a pro
   * branco. Default `0.35`.
   */
  causticsIntensity?: number;
  /**
   * Velocidade de deslize das cáusticas (offset/seg) em X e Y — dois eixos com
   * velocidades distintas dão um fluxo mais orgânico. `0` = parada. Requer
   * {@link Water.update} no loop. Default `[0.012, 0.007]`.
   */
  flowSpeed?: [number, number];
  /**
   * **Câmera pra seguir** (mar "infinito"): quando presente e {@link WaterOptions.follow}
   * está ligado, o plano re-centra no XZ da câmera a cada {@link Water.update}, então
   * a **borda quadrada** do plano fica sempre à mesma distância (`size / 2`) e some
   * atrás do fog — a água parece infinita mesmo sendo finita. As cáusticas ficam
   * ancoradas ao mundo (não escorregam com o plano). Omita pra uma água fixa.
   */
  camera?: PerspectiveCamera | OrthographicCamera;
  /**
   * Se o plano deve seguir a câmera (requer {@link WaterOptions.camera}). Default
   * `true` quando há câmera. Desligue pra um lago/poça fixo num ponto do mundo.
   */
  follow?: boolean;
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
 *
 * @example
 * // Mar "infinito": passe a câmera e o plano segue o XZ dela, então a borda
 * // quadrada fica sempre a `size / 2` e some atrás do fog.
 * const sea = new Water(scene, { y: -6, camera: game.camera, causticsUrl: '…' })
 */
export class Water {
  /** O `Mesh` do plano de água, já adicionado à cena. */
  readonly mesh: Mesh;

  private readonly material: MeshStandardMaterial;
  private map: Texture | null = null;
  private readonly flowX: number;
  private readonly flowY: number;
  private offsetX = 0;
  private offsetY = 0;
  private readonly camera: PerspectiveCamera | OrthographicCamera | null;
  /** Unidades de mundo cobertas por um tile das cáusticas (`size / repeat`). */
  private readonly tileWorld: number;

  constructor(scene: Scene, options: WaterOptions = {}) {
    const {
      size = 400,
      y = 0,
      color = 0xa8d8f5,
      causticsUrl,
      repeat = 8,
      roughness = 0.35,
      metalness = 0.05,
      causticsIntensity = 0.35,
      flowSpeed = [0.012, 0.007],
      camera,
      follow = true,
    } = options;

    this.flowX = flowSpeed[0];
    this.flowY = flowSpeed[1];
    this.camera = camera && follow ? camera : null;
    this.tileWorld = size / repeat;
    // color = parte escura da água; emissive + emissiveMap = ADICIONA branco
    // onde a textura de cáusticas é clara (áreas brilhantes "acendem" a água).
    this.material = new MeshStandardMaterial({
      color: new Color(color),
      emissive: new Color(0xffffff),
      emissiveIntensity: causticsUrl ? causticsIntensity : 0,
      roughness,
      metalness,
    });

    this.mesh = new Mesh(new PlaneGeometry(size, size), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = y;
    this.mesh.name = 'Water';
    this.mesh.receiveShadow = true; // sombras das peças se projetam na água
    // Marca a água pra outros sistemas (ex.: StaticMerge NÃO pode fundi-la — o
    // update() anima ESTA malha/material; fundida, congelaria).
    this.mesh.userData['cortexWater'] = true;
    scene.add(this.mesh);

    if (causticsUrl) {
      // Carrega as cáusticas em segundo plano; aplica como emissiveMap quando
      // pronta — não bloqueia o resto do setup da cena.
      new AssetLoader()
        .loadTexture(causticsUrl)
        .then((tex) => {
          tex.wrapS = RepeatWrapping;
          tex.wrapT = RepeatWrapping;
          tex.repeat.set(repeat, repeat);
          this.material.emissiveMap = tex;
          this.material.needsUpdate = true;
          this.map = tex;
        })
        .catch((err) => console.warn('[Water] cáusticas não carregaram:', err));
    }
  }

  /**
   * Anima as cáusticas deslizando o offset da textura nos dois eixos. Chame uma
   * vez por frame passando o delta em **segundos** (`deltaTime / 1000`). No-op
   * se não houver textura de cáusticas.
   *
   * @param deltaSeconds - Tempo decorrido desde o último frame, em segundos.
   */
  update(deltaSeconds: number): void {
    // Mar "infinito": re-centra o plano no XZ da câmera a cada frame, então a borda
    // quadrada fica sempre a `size / 2` da câmera e some atrás do fog. O Y não muda.
    if (this.camera) {
      this.mesh.position.x = this.camera.position.x;
      this.mesh.position.z = this.camera.position.z;
    }
    if (!this.map) return;
    // Fluxo animado das cáusticas.
    this.offsetX = (this.offsetX + deltaSeconds * this.flowX) % 1;
    this.offsetY = (this.offsetY + deltaSeconds * this.flowY) % 1;
    // Ancora as cáusticas ao mundo: sem isso, seguir a câmera arrastaria a textura
    // junto com o plano (as cáusticas "grudariam" na tela). A compensação — posição
    // do plano medida em tiles — cancela o deslize na UV. Sinais deduzidos da rotação
    // -PI/2 em X do mesh: world_x ← +local_u, world_z ← -local_v.
    let u = this.offsetX;
    let v = this.offsetY;
    if (this.camera) {
      u += this.mesh.position.x / this.tileWorld;
      v -= this.mesh.position.z / this.tileWorld;
    }
    this.map.offset.set(u, v);
  }
}
