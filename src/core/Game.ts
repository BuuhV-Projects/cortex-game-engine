import { PerspectiveCamera, OrthographicCamera } from 'three';
import { Renderer } from './Renderer.js';
import { Scene } from './Scene.js';
import { InputManager } from './InputManager.js';
import { GamepadManager } from './GamepadManager.js';
import { GameLoop } from './GameLoop.js';
import { World } from '../ecs/World.js';
import { UiLayer } from '../ui/runtime/UiLayer.js';
import { createUiLayer } from '../ui/runtime/createUiLayer.js';
import { DebugHud, debugHudRequested } from '../ui/DebugHud.js';
import { FrameProfiler } from './FrameProfiler.js';
import { InspectCamera } from './InspectCamera.js';

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
  /** `true` quando a gameplay está PAUSADA durante o play (Unity-style pause). */
  isPaused(): boolean;
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

  /**
   * Gamepad (Xbox-first): polado automaticamente 1×/frame no início do `_tick`, antes
   * dos sistemas/`onUpdate` — então qualquer System lê o estado fresco via
   * `game.gamepad.getAxis(0, …)` / `isButtonDown(0, …)`. Layout padrão: A=0, B=1, X=2,
   * Y=3, LB=4, RB=5, LT=6, RT=7; eixos 0/1=stick esquerdo, 2/3=stick direito.
   */
  readonly gamepad: GamepadManager;
  /** Canvas de render. */
  readonly canvas: HTMLCanvasElement;

  /**
   * **Profiler por-subsistema do frame** (SPEC-0134) — mede `input`/`update`/
   * `world`/`ui`/`render` a cada tick. Fica ligado só com o HUD de debug ativo
   * (custo ≈ zero quando desligado). Exposto pra ferramentas/benchmark lerem o
   * breakdown (`game.profiler.summary()`).
   */
  readonly profiler: FrameProfiler;

  private _sceneDataUrl = 'assets/scene-data.json';
  private readonly _sceneDataUrlListeners: Array<(url: string) => void> = [];

  private readonly _loop: GameLoop;
  private readonly _editor: GameEditor | null;
  private _onUpdate: ((deltaSeconds: number) => void) | null = null;
  /** HUD de métricas (modo debug). `undefined` = ainda não decidido; `null` = off. */
  private _debugHud: DebugHud | null | undefined = undefined;
  private _postfx: { render(): void } | null = null;
  private _ui: UiLayer | null = null;
  private _inspect: InspectCamera | null = null;
  /** Cena/câmera renderizadas a cada frame. Por padrão são as do jogo; troque com
   * {@link setActiveScene} pra multi-cena (criador de personagem, menus, regiões). */
  private _activeScene: Scene;
  private _activeCamera: PerspectiveCamera | OrthographicCamera;

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
    this.gamepad = new GamepadManager();
    // Já liga junto se o modo debug foi pedido (export --debug / ?cortexHud=1),
    // pra medir desde o 1º frame; o toggle do Studio liga/desliga em runtime.
    this.profiler = new FrameProfiler({ enabled: debugHudRequested() });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w <= 0 || h <= 0) return; // janela/painel 0×0: não mexe na câmera (aspect NaN/∞)
        if (this.camera instanceof OrthographicCamera) {
          this.applyOrthoFrustum(w, h);
        } else {
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
        }
      });
    }

    // Toggle do HUD de métricas vindo de fora (menu do Studio via ponte do
    // editor, ou o próprio jogo): evento DOM desacoplado — quem dispara não
    // precisa da referência do Game.
    if (typeof document !== 'undefined') {
      document.addEventListener('cortex:debug-hud', (e) => {
        const on = (e as CustomEvent<{ on?: boolean }>).detail?.on;
        this.setDebugHud(on);
      });
    }

    // Liga o editor SE houver um attacher registrado (bundle de dev). Em prod
    // ninguém registrou → _editor fica null e o jogo roda sem editor.
    this._editor = _editorAttacher ? _editorAttacher(this) : null;

    this._activeScene = this.scene;
    this._activeCamera = this.camera;
    this._loop = new GameLoop({ onUpdate: (dtMs) => this._tick(dtMs) });
  }

  /**
   * Caminho do **overlay de cena** (scene-data) da fase/cena ATUAL — é de onde o
   * editor carrega e pra onde salva as edições (transform, física, scripts,
   * added/deleted…). Default `assets/scene-data.json`.
   *
   * Jogos com **mais de uma fase** devem dar um arquivo POR FASE (senão objetos
   * adicionados numa fase vazam pra outra e o auto-save de uma sobrescreve as
   * edições da outra). Defina **logo depois de escolher a fase, antes do
   * `buildScene`** — o editor recarrega o overlay do caminho novo (edições
   * feitas antes da troca não são migradas). Use o MESMO caminho no
   * `SceneLoader.loadSceneFile(...)` que alimenta o `buildScene`.
   *
   * @example
   * const level = await showMenu(LEVELS)
   * game.sceneDataUrl = level.overlayUrl // ex.: 'assets/scene-data-fase2.json'
   * const overlay = await new SceneLoader().loadSceneFile(level.overlayUrl)
   */
  get sceneDataUrl(): string {
    return this._sceneDataUrl;
  }

  set sceneDataUrl(url: string) {
    if (url === this._sceneDataUrl) return;
    this._sceneDataUrl = url;
    for (const cb of this._sceneDataUrlListeners) cb(url);
  }

  /**
   * Registra um callback pra mudança do {@link sceneDataUrl} (o editor usa pra
   * recarregar o overlay quando o jogo troca de fase).
   */
  onSceneDataUrlChange(callback: (url: string) => void): void {
    this._sceneDataUrlListeners.push(callback);
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
   * `true` quando a gameplay está **pausada** durante o play (pause Unity-style,
   * acionado pelo transport da IDE). Combine com `editorActive` pra pausar
   * sistemas: `system.pauseWhen = () => game.editorActive || game.gameplayPaused`.
   */
  get gameplayPaused(): boolean {
    return this._editor?.isPaused() ?? false;
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

  /**
   * **Multi-cena:** define a cena + câmera renderizadas a cada frame. Use pra telas
   * alternativas (criador de personagem, menus, troca de região) sem recriar o `Game`.
   * Sem argumentos (ou passando `game.scene`/`game.camera`), volta pra cena do jogo.
   *
   * O `world` (ECS) e o input continuam os mesmos — pause os sistemas de gameplay
   * (`pauseWhen`) enquanto mostra outra cena. A cena alternativa renderiza **direto**
   * (sem o PostFX da cena do jogo). Tipicamente combinado com uma tela de loading
   * ({@link createDomLoadingScreen}) na transição. Ver SPEC-0069.
   *
   * @example
   * game.setActiveScene(creatorScene, creatorCamera) // mostra o criador
   * // ...ao confirmar:
   * game.setActiveScene(game.scene, game.camera)      // volta pro jogo
   */
  setActiveScene(scene: Scene, camera: PerspectiveCamera | OrthographicCamera): void {
    this._activeScene = scene;
    this._activeCamera = camera;
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

  /**
   * **UI de runtime** (ADR-0102): HUD/menus/diálogos que funcionam idênticos
   * no Studio (DOM) e no CortexNative/console (renderer) com navegação por
   * gamepad embutida. Criada sob demanda; o `Game` atualiza e desenha por
   * frame automaticamente.
   *
   * @example
   * const coins = game.ui.add(new UiLabel({ anchor: 'top-left', x: 16, y: 12, text: 'x0' }));
   * coins.set({ text: 'x7' });
   */
  get ui(): UiLayer {
    if (!this._ui) {
      // Viewport da UI em pixels LÓGICOS (CSS), não no backing do canvas. Com
      // devicePixelRatio > 1 (ex.: monitor HiDPI, ou o SSAA do host nativo que
      // usa dpr=renderScale) `canvas.width` = lógico × dpr — usar ele encolheria
      // a UI. `renderer.width/height` é o tamanho lógico (getSize, sem o dpr).
      this._ui = createUiLayer(this.renderer, () => ({
        width: this.renderer.width,
        height: this.renderer.height,
      }));
    }
    return this._ui;
  }

  /**
   * **Câmera de inspeção** (SPEC-0131): câmera de perspectiva livre pra "ver" a
   * cena de qualquer ângulo por código, independente da câmera do jogo (que segue
   * o player) e do modo editor. Quando ativada (`orbit`/`pose`/`frame`), o render
   * do frame passa a usá-la (cru, sem pós); `clear()` volta ao normal. Criada sob
   * demanda. Usada pela tool de playtest do Chat IA e exposta em
   * `window.__cortexInspect` no bundle de dev.
   *
   * @example
   * game.inspect.orbit({ yaw: 45, pitch: -30, dist: 20 }) // de lado, meia-altura
   * game.inspect.clear()                                   // volta pra câmera do jogo
   */
  get inspect(): InspectCamera {
    if (!this._inspect) this._inspect = new InspectCamera();
    return this._inspect;
  }

  private _tick(deltaMs: number): void {
    const dt = deltaMs / 1000;
    const p = this.profiler; // no-op quando o HUD de debug está desligado
    p.begin('input');
    this.gamepad.poll(); // estado fresco do gamepad antes dos sistemas/onUpdate (Xbox-first)
    p.end('input');
    p.begin('update');
    this._onUpdate?.(dt);
    p.end('update');
    p.begin('world');
    this.world.tick(deltaMs);
    p.end('world');
    p.begin('ui');
    this._ui?.update(dt); // navegação/sync da UI de runtime (ADR-0102)
    p.end('ui');
    p.begin('editor');
    this._editor?.update(dt);
    p.end('editor');
    // Câmera de inspeção (SPEC-0131): quando ativa VENCE tudo — render cru por ela,
    // de qualquer ângulo, com a gameplay seguindo (só o render muda). Usada pelo
    // playtest do Chat IA pra inspecionar a cena livremente.
    const inspectCamera = this._inspect?.active ? this._inspect : null;
    const editorCamera = this._editor?.activeCamera() ?? null;
    p.begin('render');
    if (inspectCamera) {
      inspectCamera.setAspect(this.renderer.width, this.renderer.height);
      this.renderer.render(this._activeScene.getThreeScene(), inspectCamera.camera);
    } else if (editorCamera) {
      // No editor: render direto pela câmera livre (cena crua, sem pós).
      this.renderer.render(this._activeScene.getThreeScene(), editorCamera);
    } else if (this._postfx && this._activeScene === this.scene) {
      // No jogo: pipeline de pós-processamento (mood/bloom/etc.). Só na cena do jogo —
      // cenas alternativas (criador/menu) renderizam direto.
      this._postfx.render();
    } else {
      this.renderer.render(this._activeScene.getThreeScene(), this._activeCamera);
    }
    p.end('render');
    p.begin('ui');
    this._ui?.render(); // UI por cima do frame (backend renderer; DOM é no-op)
    p.end('ui');
    p.commitFrame(); // fecha o frame do profiler (joga os acumuladores nos rings)

    // HUD de métricas do modo debug (export --debug, ?cortexHud=1 ou o toggle
    // do menu do Studio): criado preguiçosamente e alimentado com o delta CRU.
    if (this._debugHud === undefined) {
      this._debugHud = debugHudRequested() ? this.createDebugHud() : null;
    }
    this._debugHud?.frame(deltaMs);
  }

  /**
   * Liga/desliga o **HUD de métricas** (FPS/frame ms, CPU, memória, GPU) em
   * runtime — é o que o menu **View › HUD de métricas** do Studio aciona (via
   * ponte do editor) e que o export `--debug` liga por padrão. Sem argumento,
   * alterna o estado atual.
   */
  setDebugHud(enabled?: boolean): void {
    const on = enabled ?? !(this._debugHud instanceof DebugHud && this._debugHud.visible);
    if (on) {
      if (!this._debugHud) this._debugHud = this.createDebugHud();
      this._debugHud.setVisible(true);
    } else {
      this._debugHud?.setVisible(false);
      if (this._debugHud === undefined) this._debugHud = null; // decisão tomada
      this.profiler.setEnabled(false); // sem HUD, para de medir (custo ≈ zero)
      this.profiler.reset();
    }
  }

  private createDebugHud(): DebugHud {
    this.profiler.setEnabled(true); // o HUD é o consumidor do breakdown
    return new DebugHud(this.ui, () => (this.renderer.threeRenderer as { info?: { render?: { drawCalls?: number; triangles?: number } } }).info ?? null, this.profiler);
  }

  /** Inicia o loop. */
  start(): void {
    this._loop.start();
  }

  /** Para o loop. */
  stop(): void {
    this._loop.stop();
  }

  /**
   * Reseta o jogo pra **trocar de cena/fase** sem recriar o `Game` (renderer,
   * câmera e canvas continuam): para o loop, esvazia o world com `dispose` dos
   * sistemas ({@link World.clear} — libera o mundo do Rapier etc.), libera a GPU
   * da cena ({@link Scene.disposeAll}), limpa a UI e zera o `onUpdate`.
   *
   * O ESTADO DO JOGO fora do engine (áudio, música, timers próprios) é
   * responsabilidade do chamador. Depois do reset, re-registre os sistemas e
   * monte a próxima cena (ex.: `setupThirdPerson` + `buildScene`).
   *
   * @example
   * // "Voltar ao menu" sem recarregar a página (funciona no export nativo):
   * game.reset();
   * const level = await showMainMenu(game, LEVELS);
   * // ...re-setup + buildScene + game.start()...
   */
  reset(): void {
    this.stop();
    this.world.clear();
    this.scene.disposeAll();
    // O HUD de métricas ancora seus widgets na UI; `ui.clear()` os remove. Sem
    // recriá-lo, o objeto sobrevive ao reset segurando widgets órfãos e o HUD
    // some da 2ª fase em diante (só a 1ª, onde foi montado, mostrava métricas).
    const hudWasVisible = this._debugHud instanceof DebugHud && this._debugHud.visible;
    this._ui?.clear();
    this._onUpdate = null;
    if (this._debugHud instanceof DebugHud) {
      this._debugHud = this.createDebugHud();
      this._debugHud.setVisible(hudWasVisible);
    }
  }
}
