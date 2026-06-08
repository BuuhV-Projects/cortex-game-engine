import {
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  TextureLoader,
  RepeatWrapping,
  SRGBColorSpace,
  type PerspectiveCamera,
  type OrthographicCamera,
} from 'three';
import { Scene } from '../core/Scene.js';

/** Opções de {@link Background}. */
export interface BackgroundOptions {
  /** URL da imagem (jpg/png) — o backdrop. Tileável na horizontal pra scroll sem emenda. */
  url: string;
  /**
   * Fator de **parallax** (0–1): quão rápido o cenário acompanha a câmera.
   * `0` = travado na tela (infinitamente longe); `1` = anda junto com o mundo
   * (mesma profundidade do gameplay). Default `0.3` (fundo distante). */
  parallax?: number;
  /** Distância no Z **atrás** da câmera. Default `40`. */
  distance?: number;
  /** Altura do backdrop em unidades de mundo (cobre a vista vertical). Default `30`. */
  height?: number;
  /** Largura em múltiplos da altura (cobre a vista horizontal; tiles quadrados). Default `2.6`. */
  widthFactor?: number;
}

/**
 * **Backdrop 2D com parallax** — um quad unlit, atrás de tudo, que segue a câmera
 * pra sempre preencher a vista e faz a imagem rolar em **parallax** conforme a
 * câmera anda (estilo plataforma). A imagem deve ser tileável na horizontal
 * (`RepeatWrapping`) pra rolar sem emenda. Não recebe luz/sombra/fog (é fundo).
 *
 * Chame {@link Background.update} no loop (o {@link buildScene} já faz isso pelos
 * nós `background`). Use uma imagem por **tema/mood** (céu/cidade/floresta).
 *
 * @example
 * const bg = new Background(game.scene, game.camera, { url: 'assets/bg/adventure.jpg', parallax: 0.3 })
 * // no loop: bg.update()
 */
export class Background {
  /** O mesh do backdrop (já adicionado à cena). */
  readonly mesh: Mesh;
  private readonly camera: PerspectiveCamera | OrthographicCamera;
  private readonly parallax: number;
  private readonly distance: number;
  private readonly tileWorld: number;

  constructor(scene: Scene, camera: PerspectiveCamera | OrthographicCamera, options: BackgroundOptions) {
    const { url, parallax = 0.3, distance = 40, height = 30, widthFactor = 2.6 } = options;
    this.camera = camera;
    this.parallax = parallax;
    this.distance = distance;
    this.tileWorld = height; // um tile (quadrado) cobre `height` unidades

    const tex = new TextureLoader().load(url);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace;
    tex.repeat.set(widthFactor, 1); // tiles quadrados (imagem 1:1) varrendo a largura

    const mat = new MeshBasicMaterial({ map: tex, depthWrite: false, fog: false, toneMapped: false });
    this.mesh = new Mesh(new PlaneGeometry(height * widthFactor, height), mat);
    this.mesh.renderOrder = -1000; // desenha primeiro (atrás de tudo)
    this.mesh.frustumCulled = false;
    this.mesh.name = 'background';
    scene.getThreeScene().add(this.mesh);
    this.update();
  }

  /** Reposiciona o backdrop atrás da câmera e rola a UV em parallax. Chame no loop. */
  update(): void {
    const cam = this.camera;
    this.mesh.position.set(cam.position.x, cam.position.y, cam.position.z - this.distance);
    const map = (this.mesh.material as MeshBasicMaterial).map;
    // offset em UV: 1.0 = um tile = `tileWorld` unidades. parallax escala o quanto
    // o cenário "anda" relativo à câmera.
    if (map) map.offset.x = (cam.position.x * this.parallax) / this.tileWorld;
  }
}
