import { PerspectiveCamera, OrthographicCamera } from 'three';
import { Renderer } from './Renderer.js';
import { Scene } from './Scene.js';
import { InputManager } from './InputManager.js';
import { GameLoop } from './GameLoop.js';
import { World } from '../ecs/World.js';

/**
 * Handle do editor injetado no {@link Game} (só existe no bundle de
 * desenvolvimento — ver {@link registerEditorAttacher}). O Game pergunta a câmera
 * ativa a cada frame (editor de voo livre quando ligado, senão `null`) e dá um
 * `update(dt)` pra a reatividade da UI do editor.
 */
export interface GameEditor {
  /** Câmera a usar no render (a livre do editor quando ativo; `null` = usar a do jogo). */
  activeCamera(): PerspectiveCamera | null;
  /** Chamado a cada frame, depois do `world.tick`, pra reatividade dos painéis. */
  update(deltaSeconds: number): void;
  /** `true` quando o editor (F2) está ativo — pra pausar a gameplay. */
  isActive(): boolean;
}

/** Função que liga o editor a um {@link Game}. Registrada pelo bundle de dev. */
export type EditorAttacher = (game: Game) => GameEditor;

let _editorAttacher: EditorAttacher | null = null;

/**
 * Registra a implementação do editor a ser ligada automaticamente em todo
 * {@link Game}. **Chamado só pelo bundle de desenvolvimento do engine**
 * (`index.dev.js`); no bundle de produção (`index.js`) ninguém registra, então o
 * editor simplesmente não existe (zero peso). Ver ADR-0042.
 */
export function registerEditorAttacher(attacher: EditorAttacher): void {
  _editorAttacher = attacher;
}

/** Opções do {@link Game}. */
export interface GameOptions {
  /** Canvas onde o jogo renderiza. */
  canvas: HTMLCanvasElement;
  /** Largura inicial. Default `window.innerWidth`. */
  width?: number;
  /** Altura inicial. Default `window.innerHeight`. */
  height?: number;
  /** Field of view da câmera perspectiva (graus). Default `60`. */
  fov?: number;
  /** Near plane. Default `0.1`. */
  near?: number;
  /** Far plane. Default `1000`. */
  far?: number;
  /**
   * Projeção da câmera do jogo:
   * - `perspective` (default) — 3D / 2.5D com profundidade.
   * - `orthographic` — **2D / pixel art** (sem distorção de perspectiva). Use com
   *   {@link GameOptions.pixelsPerUnit} e sprites (ver `createSprite`).
   */
  projection?: 'perspective' | 'orthographic';
  /**
   * Só pra `orthographic`: **pixels de tela por unidade de mundo** (zoom). Ex.:
   * `100` = 1 unidade ocupa 100px. Um sprite de 16px de altura vira nítido a
   * `1 unidade` com nearest filter. Default `100`.
   */
  pixelsPerUnit?: number;
}

/**
 * Facade de alto nível: cria e conecta o que todo jogo precisa — `Renderer`,
 * `Scene`, câmera, `World` (ECS), `InputManager` e o `GameLoop` — e, **em
 * desenvolvimento**, liga o **modo editor** completo (câmera livre F2, gizmo,
 * hierarquia, inspector, reatividade) automaticamente, sem nenhum boilerplate no
 * jogo. No build de produção o editor não está no bundle (ver ADR-0042), então
 * não pesa.
 *
 * O jogo só precisa: criar o `Game`, popular `game.scene`, registrar a lógica em
 * `game.onUpdate(...)` (e/ou sistemas em `game.world`), e chamar `start()`.
 *
 * @example
 * const game = new Game({ canvas })
 * game.scene.add(meshes…)
 * game.onUpdate((dt) => { /* lógica por frame *\/ })
 * game.start()
 */
export class Game {
  /** Renderer WebGPU (auto-resize). */
  readonly renderer: Renderer;
  /** Cena do jogo. */
  readonly scene: Scene;
  /** Câmera principal do jogo (perspectiva em 3D/2.5D, ortográfica em 2D/pixel). */
  readonly camera: PerspectiveCamera | OrthographicCamera;
  /** Pixels de tela por unidade de mundo (câmera ortográfica). `0` em perspectiva. */
  readonly pixelsPerUnit: number;
  /** Mundo ECS — registre sistemas com `world.addSystem(...)`. */
  readonly world: World;
  /** Gerenciador de input (já anexado ao `document.body`). */
  readonly input: InputManager;
  /** Canvas de render. */
  readonly canvas: HTMLCanvasElement;

  private readonly _loop: GameLoop;
  private readonly _editor: GameEditor | null;
  private _onUpdate: ((deltaSeconds: number) => void) | null = null;
  private _postfx: { render(): void } | null = null;

  constructor(options: GameOptions) {
    const {
      canvas,
      width = typeof window !== 'undefined' ? window.innerWidth : 1280,
      height = typeof window !== 'undefined' ? window.innerHeight : 720,
      fov = 60,
      near = 0.1,
      far = 1000,
      projection = 'perspective',
      pixelsPerUnit = 100,
    } = options;

    this.canvas = canvas;
    this.scene = new Scene();
    this.renderer = new Renderer({ canvas, width, height });

    if (projection === 'orthographic') {
      // 2D / pixel art: ortográfica olhando o plano XY de frente. O frustum é
      // derivado de `pixelsPerUnit` pra mapear unidades de mundo → px de tela.
      this.pixelsPerUnit = pixelsPerUnit;
      const cam = new OrthographicCamera(0, 0, 0, 0, near, far);
      cam.position.set(0, 0, 10);
      cam.lookAt(0, 0, 0);
      this.camera = cam;
      this.applyOrthoFrustum(width, height);
    } else {
      this.pixelsPerUnit = 0;
      const cam = new PerspectiveCamera(fov, width / height, near, far);
      cam.position.set(8, 6, 10);
      cam.lookAt(0, 1, 0);
      this.camera = cam;
    }

    this.world = new World();
    this.input = new InputManager();
    if (typeof document !== 'undefined') this.input.attach(document.body);

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (this.camera instanceof OrthographicCamera) {
          this.applyOrthoFrustum(w, h);
        } else {
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
        }
      });
    }

    // Liga o editor SE houver um attacher registrado (bundle de dev). Em prod
    // ninguém registrou → _editor fica null e o jogo roda sem editor.
    this._editor = _editorAttacher ? _editorAttacher(this) : null;

    this._loop = new GameLoop({ onUpdate: (dtMs) => this._tick(dtMs) });
  }

  /**
   * Registra um callback chamado a cada frame (delta em **segundos**), antes do
   * `world.tick`. É o lugar pra lógica de jogo que não está num System.
   */
  onUpdate(callback: (deltaSeconds: number) => void): void {
    this._onUpdate = callback;
  }

  /** `true` se o editor está ligado (bundle de dev). */
  get hasEditor(): boolean {
    return this._editor !== null;
  }

  /**
   * `true` quando o editor (F2) está ativo. Use pra pausar a gameplay enquanto
   * edita: `system.pauseWhen = () => game.editorActive`. `false` se não há editor
   * (produção) ou está fechado.
   */
  get editorActive(): boolean {
    return this._editor?.isActive() ?? false;
  }

  /**
   * Liga um pipeline de pós-processamento (tipicamente um `PostFX`) usado pra
   * renderizar o JOGO — é o principal lugar pra atmosfera (bloom, vignette, tone
   * mapping, exposição). Construa-o com `game.renderer/scene/camera` e passe aqui:
   * o `Game` chama `postfx.render()` no lugar de `renderer.render(...)`. No modo
   * editor, a renderização volta pra câmera livre crua (sem pós). Passe `null`
   * pra desligar.
   *
   * @example
   * const fx = new PostFX(game.renderer, game.scene, game.camera, { bloom: { strength: 0.8 } })
   * game.setPostFX(fx)
   */
  setPostFX(postfx: { render(): void } | null): void {
    this._postfx = postfx;
  }

  /** Ajusta o frustum da câmera ortográfica pra `width`×`height` (px) via `pixelsPerUnit`. */
  private applyOrthoFrustum(width: number, height: number): void {
    const cam = this.camera as OrthographicCamera;
    const hw = width / (2 * this.pixelsPerUnit);
    const hh = height / (2 * this.pixelsPerUnit);
    cam.left = -hw;
    cam.right = hw;
    cam.top = hh;
    cam.bottom = -hh;
    cam.updateProjectionMatrix();
  }

  private _tick(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this._onUpdate?.(dt);
    this.world.tick(deltaMs);
    this._editor?.update(dt);
    const editorCamera = this._editor?.activeCamera() ?? null;
    if (editorCamera) {
      // No editor: render direto pela câmera livre (cena crua, sem pós).
      this.renderer.render(this.scene.getThreeScene(), editorCamera);
    } else if (this._postfx) {
      // No jogo: pipeline de pós-processamento (mood/bloom/etc.).
      this._postfx.render();
    } else {
      this.renderer.render(this.scene.getThreeScene(), this.camera);
    }
  }

  /** Inicia o loop. */
  start(): void {
    this._loop.start();
  }

  /** Para o loop. */
  stop(): void {
    this._loop.stop();
  }
}
