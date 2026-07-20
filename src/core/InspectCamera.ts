import { PerspectiveCamera, Box3, Vector3, type Object3D } from 'three';

/** Alvo do enquadramento: coordenada de mundo explícita ou `'scene'` (bbox da cena). */
export type InspectTarget = [number, number, number] | 'scene';

/** Parâmetros de órbita ao redor de um alvo (ângulos em GRAUS). */
export interface InspectOrbit {
  /** Azimute horizontal (graus). `0` = olhando pelo eixo +Z; cresce no sentido anti-horário visto de cima. Default `30`. */
  yaw?: number;
  /** Elevação (graus). Negativo olha DE CIMA pra baixo (mergulho). Default `-25`. */
  pitch?: number;
  /** Distância da câmera ao alvo (unidades). Omitido = auto (enquadra o alvo pelo bbox). */
  dist?: number;
  /** Ponto observado. Default `'scene'` (centro do bounding box da cena). */
  target?: InspectTarget;
}

/**
 * **Câmera de inspeção** (ADR-0131): uma câmera de perspectiva livre, separada da
 * do jogo e da do editor, que pode ser posicionada/orbitada por código pra "ver"
 * a cena de QUALQUER ângulo sem depender da câmera de gameplay (que segue o
 * player) nem do modo editor (que traz HUD/gizmos/helpers).
 *
 * Quando {@link active}, o {@link Game} renderiza o frame por ela — a gameplay
 * segue rodando (`world.tick`), só a câmera do render muda. Render **cru** (sem
 * pós-processamento), como o do editor, pra uma leitura geométrica limpa da cena.
 *
 * Usada pela tool de playtest do Chat IA (parâmetro `camera`) e exposta em
 * `window.__cortexInspect` no bundle de dev — assim a IA orbita livremente e tira
 * a foto do ângulo que quiser.
 *
 * @example
 * game.inspect.orbit({ yaw: 45, pitch: -30, dist: 20 }) // meia-altura, de lado
 * game.inspect.pose([10, 8, 10], [0, 1, 0])             // pose explícita
 * game.inspect.clear()                                   // volta pra câmera do jogo
 */
export class InspectCamera {
  /** A câmera de perspectiva controlada. Renderiza só a layer 0 (helpers do editor ficam de fora). */
  readonly camera: PerspectiveCamera;
  /** `true` = o {@link Game} deve renderizar por esta câmera. Alternado por `orbit/pose/frame/clear`. */
  active = false;

  private readonly _center = new Vector3();
  private readonly _size = new Vector3();
  private readonly _box = new Box3();

  constructor(fov = 60) {
    // Far grande: mundo de 640m+ (mesma escolha da câmera do editor) não corta.
    this.camera = new PerspectiveCamera(fov, 16 / 9, 0.1, 20000);
  }

  /** Ajusta o aspect ao tamanho lógico do render (chamado pelo Game por frame quando ativa). */
  setAspect(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    if (this.camera.aspect === aspect) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Troca o field of view (graus) e reativa. */
  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.active = true;
  }

  /** Pose explícita: posiciona em `pos` olhando pra `lookAt` (default origem). Ativa a câmera. */
  pose(pos: readonly [number, number, number], lookAt: readonly [number, number, number] = [0, 0, 0]): void {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    this.active = true;
  }

  /**
   * Orbita ao redor de um alvo pelos ângulos `yaw`/`pitch` a uma `dist` (auto se
   * omitida). `scene` é a raiz cujo bbox é usado quando `target === 'scene'` ou
   * pra calcular a distância automática. Ativa a câmera.
   */
  orbit(scene: Object3D, params: InspectOrbit = {}): void {
    const yaw = ((params.yaw ?? 30) * Math.PI) / 180;
    const pitch = ((params.pitch ?? -25) * Math.PI) / 180;
    const { center, autoDist } = this.resolveTarget(scene, params.target ?? 'scene');
    const dist = params.dist ?? autoDist;

    // Direção do alvo → câmera. pitch negativo (mergulho) ⇒ câmera acima (dir.y > 0).
    const cp = Math.cos(pitch);
    const dir = new Vector3(Math.sin(yaw) * cp, Math.sin(-pitch), Math.cos(yaw) * cp);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.lookAt(center);
    this.active = true;
  }

  /** Enquadra a cena inteira do ângulo padrão (atalho de `orbit` sem parâmetros). */
  frame(scene: Object3D): void {
    this.orbit(scene, {});
  }

  /** Desativa — o {@link Game} volta a renderizar pela câmera do jogo/editor. */
  clear(): void {
    this.active = false;
  }

  /** Resolve o centro observado + a distância automática (enquadra o bbox no fov). */
  private resolveTarget(scene: Object3D, target: InspectTarget): { center: Vector3; autoDist: number } {
    if (Array.isArray(target)) {
      const center = new Vector3(target[0], target[1], target[2]);
      // Sem bbox de referência num ponto: usa o da cena só pra dimensionar a distância.
      const size = this.sceneBounds(scene).getSize(this._size);
      return { center, autoDist: this.distFor(Math.max(size.x, size.y, size.z) || 10) };
    }
    const box = this.sceneBounds(scene);
    box.getCenter(this._center);
    box.getSize(this._size);
    const maxDim = Math.max(this._size.x, this._size.y, this._size.z) || 10;
    return { center: this._center.clone(), autoDist: this.distFor(maxDim) };
  }

  /** Distância pra enquadrar um objeto de dimensão `maxDim` no fov atual (com margem). */
  private distFor(maxDim: number): number {
    const fovRad = (this.camera.fov * Math.PI) / 180;
    return (maxDim / (2 * Math.tan(fovRad / 2))) * 1.4;
  }

  /**
   * Bounding box "útil" da cena: só malhas na layer 0 (helpers do editor vivem em
   * outra layer e não contam) e ignorando backdrops gigantes (skybox/cenário de
   * fundo com dimensão > 1000u) pra o auto-enquadramento não recuar ao infinito.
   */
  private sceneBounds(scene: Object3D): Box3 {
    const box = this._box.makeEmpty();
    const itemBox = new Box3();
    scene.traverse((o) => {
      const mesh = o as Object3D & { isMesh?: boolean; geometry?: unknown };
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!o.layers.isEnabled(0)) return; // helper do editor (layer própria) — ignora
      itemBox.setFromObject(o);
      if (itemBox.isEmpty()) return;
      itemBox.getSize(this._size);
      const maxDim = Math.max(this._size.x, this._size.y, this._size.z);
      if (maxDim > 1000) return; // skybox / backdrop — não deixa dominar o enquadramento
      box.union(itemBox);
    });
    if (box.isEmpty()) box.setFromCenterAndSize(new Vector3(0, 1, 0), new Vector3(10, 10, 10));
    return box;
  }
}
