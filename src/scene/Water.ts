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
  type Object3D,
} from 'three';
import { Scene } from '../core/Scene.js';
import { AssetLoader } from '../core/AssetLoader.js';
import { CartoonWaterMaterial, CARTOON_WATER_DEFAULTS } from './CartoonWaterMaterial.js';
import { debug } from '../core/debug.js';

/** Opções de {@link Water}. Todas opcionais — os defaults dão uma água cartoon. */
export interface WaterOptions {
  /** `simple` preserva o material original; `cartoon` ativa ondas e espuma na GPU. */
  style?: 'simple' | 'cartoon';
  /** Amplitude máxima das ondas em metros, de 0 a 2. Default `0.18`. */
  waveHeight?: number;
  /** Comprimento da onda principal em metros, maior que zero. Default `16`. */
  waveLength?: number;
  /** Multiplicador de velocidade das ondas, de 0 a 10. Default `1`. */
  waveSpeed?: number;
  /** Intensidade da espuma nas margens e impactos, de 0 a 1. Default `0.7`. */
  foamStrength?: number;
  /** Alcance da espuma a partir do contato, em metros, maior que 0 até 5. Default `0.8`. */
  foamWidth?: number;
  /** Subdivisões por lado no modo cartoon, inteiro de 16 a 256. Default `128`. */
  segments?: number;
  /** Lado do plano (quadrado), em unidades. Default `400`. */
  size?: number;
  /** Altura (Y) da superfície. Default `0`. */
  y?: number;
  /** Cor base: `0xa8d8f5` no modo simples e `0x079dc2` no cartoon. */
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
 * O modo `style: 'cartoon'` usa ondas analíticas e espuma de contato na GPU,
 * com perturbações locais via {@link Water.addRipple}. Não simula volume nem
 * refração; o brilho do céu é uma aproximação estilizada, sem passe de reflexão.
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

  private readonly material: MeshStandardMaterial | CartoonWaterMaterial['material'];
  private readonly cartoon: CartoonWaterMaterial | null;
  private readonly shorelineRoot: Object3D;
  private map: Texture | null = null;
  private readonly flowX: number;
  private readonly flowY: number;
  private offsetX = 0;
  private offsetY = 0;
  private readonly camera: PerspectiveCamera | OrthographicCamera | null;
  /** Unidades de mundo cobertas por um tile das cáusticas (`size / repeat`). */
  private readonly tileWorld: number;

  constructor(scene: Scene, options: WaterOptions = {}) {
    this.shorelineRoot = scene.getThreeScene();
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
    this.cartoon = options.style === 'cartoon' ? new CartoonWaterMaterial(options) : null;
    this.material = this.cartoon?.material ?? new MeshStandardMaterial({
      color: new Color(color),
      emissive: new Color(0xffffff),
      emissiveIntensity: causticsUrl ? causticsIntensity : 0,
      roughness,
      metalness,
    });

    const segments = this.cartoon ? options.segments ?? CARTOON_WATER_DEFAULTS.segments : 1;
    const geometry = new PlaneGeometry(size, size, segments, segments);
    if (this.cartoon) geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, this.material);
    if (!this.cartoon) this.mesh.rotation.x = -Math.PI / 2;
    if (this.cartoon) {
      const height = options.waveHeight ?? CARTOON_WATER_DEFAULTS.waveHeight;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometry.boundingBox!.min.y -= height;
      geometry.boundingBox!.max.y += height;
      geometry.boundingSphere!.radius += height;
    }
    this.mesh.position.y = y;
    this.mesh.name = 'Water';
    this.mesh.receiveShadow = true; // sombras das peças se projetam na água
    // Marca a água pra outros sistemas (ex.: StaticMerge NÃO pode fundi-la — o
    // update() anima ESTA malha/material; fundida, congelaria).
    this.mesh.userData['cortexWater'] = true;
    scene.add(this.mesh);

    if (causticsUrl && !this.cartoon) {
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
        .catch((err) => debug('water', 'Cáusticas não carregaram:', err));
    }
  }

  /**
   * Atualiza ondas, perturbações ou cáusticas e acompanha a câmera configurada.
   * Chame uma vez por quadro passando o delta em **segundos** (`deltaTime / 1000`).
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
    this.cartoon?.update(deltaSeconds);
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

  /**
   * Cria uma ondulação local em coordenadas do mundo, sem alocar malhas.
   * O pool guarda até oito impactos; um novo substitui o mais antigo.
   * @returns `false` no modo simples, que não oferece perturbações.
   */
  addRipple(position: { x: number; z: number }, strength = 1): boolean {
    if (!this.cartoon) return false;
    this.cartoon.ripples.add(position.x, position.z, strength);
    return true;
  }

  /**
   * Reconstrói a máscara de espuma onde a geometria visível cruza o nível médio.
   * Chame após carregar ou mover terreno; `buildScene` chama no carregamento.
   * Não acompanha objetos móveis automaticamente. No modo simples não faz nada.
   */
  refreshShoreline(): void {
    this.cartoon?.refreshShoreline(this.shorelineRoot, this.mesh.position.y);
  }

  /** Remove a superfície e libera a geometria, o material e a textura carregada. */
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    if (this.cartoon) this.cartoon.dispose();
    else this.material.dispose();
    this.map?.dispose();
  }
}
