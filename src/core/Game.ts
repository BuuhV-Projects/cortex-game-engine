import { PerspectiveCamera, OrthographicCamera, Scene as ThreeScene, Color } from 'three';
import { Renderer } from './Renderer.js';
import { Scene } from './Scene.js';
import { resetNativePostFX } from './nativePostFX.js';
import { isSceneBuilding } from '../scene/SceneBuilder.js';
import { beginLoadingScope, endLoadingScope, isSplashActive } from './frameYield.js';
import { InputManager } from './InputManager.js';
import { GamepadManager } from './GamepadManager.js';
import { InputActions } from '../input/InputActions.js';
import { GameLoop } from './GameLoop.js';
import { World } from '../ecs/World.js';
import { clearSceneAssetCaches } from '../scene/SceneAssets.js';
import { UiLayer } from '../ui/runtime/UiLayer.js';
import { createUiLayer } from '../ui/runtime/createUiLayer.js';
import { DebugHud, debugHudRequested } from '../ui/DebugHud.js';
import { debug } from './debug.js';
import { cullOutlines, DEFAULT_OUTLINE_MIN_RATIO } from '../scene/OutlineCulling.js';

/**
 * Frames entre passadas do corte de contorno. O mesmo ritmo do culling de
 * sombra: o resultado muda devagar com a câmera, e varrer todo frame custaria
 * mais que o erro de alguns frames de atraso.
 */
const OUTLINE_CULL_INTERVAL = 10;
import { NativeSceneMirror, nativeSceneMirrorAvailable } from './NativeSceneMirror.js';
import { PerfTrace } from './PerfTrace.js';
import { FrameProfiler } from './FrameProfiler.js';
import {
  RenderPhaseProbe,
  renderPhasesRequested,
  matrixFreezeRequested,
  matrixComposeFreezeRequested,
  systemProfileRequested,
} from './RenderPhaseProbe.js';
import { InspectCamera } from './InspectCamera.js';

/**
 * Uma fase que o Studio pode abrir direto pelo seletor do viewport (ADR-0186).
 * O jogo declara a lista em {@link Game.editorLevels}.
 */
export interface EditorLevel {
  /** Id da fase — vai em `?level=<id>`, então tem que ser o que o jogo entende. */
  readonly id: string;
  /** Nome legível. Sem ele, o seletor mostra o `id`. */
  readonly label?: string;
  /** Agrupador opcional (mundo, capítulo) — vira separador na lista. */
  readonly group?: string;
}

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
  /**
   * **Fases que o Studio pode abrir direto** (ADR-0186), na ordem em que devem
   * aparecer. Declare no bootstrap:
   *
   * ```ts
   * game.editorLevels = LEVELS.map((l) => ({ id: l.id, label: nome(l), group: 'Mundo 1' }))
   * ```
   *
   * O Studio mostra um seletor no viewport e recarrega com `?level=<id>` — o
   * mesmo caminho que o jogo já usa para pular menu e hub. Sem isto o seletor
   * não aparece; a lista é a única coisa que o Studio não tem como descobrir
   * sozinho.
   *
   * Fora do Studio (jogo standalone, build de produção) fica inerte.
   */
  editorLevels?: readonly EditorLevel[];

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

  /**
   * **Ações de input remapeáveis** (ADR-0164) — a leitura por NOME (`jump`,
   * `moveForward`, `uiConfirm`) em vez de tecla crua, com bindings que o
   * jogador troca na tela de Controles (SPEC-0165) e que persistem no
   * `config.ini`. Polado 1×/frame no `_tick`, logo depois do `gamepad.poll()`,
   * então `pressed()` tem borda correta em qualquer System.
   *
   * O jogo declara as ações DELE com `game.actions.define(...)`; a engine só
   * traz o mínimo que os sistemas dela consomem.
   *
   * @example
   * game.actions.loadFrom(await GameConfig.load());
   * if (game.actions.pressed('jump')) body.jump();
   */
  readonly actions: InputActions;
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
  /** Amostrador do perf trace (SPEC-0198). Inerte sem a ponte do host nativo. */
  private readonly _perfTrace = new PerfTrace();
  /**
   * Sonda de fases do render (SPEC-0227) — só embrulha o renderer quando pedida
   * por `?renderPhases=<nivel>`; desligada, é um objeto inerte.
   */
  private readonly _renderPhases = new RenderPhaseProbe(renderPhasesRequested());
  /**
   * Experimento de teto da poda de travessia (SPEC-0227): depois de N frames,
   * congela a atualização de matriz da cena. Só faz sentido com a cena parada
   * (`?bench&hold`), onde a imagem sai idêntica e a diferença de `cpu.render` é
   * o que a fase de matriz custava. 0 = desligado.
   */
  /**
   * Espelho de cena no host (SPEC-0234): a travessia de matriz sai do JS. Só
   * existe no export nativo; no browser e no Studio é inerte.
   */
  /** Perfil por sistema do ECS (SPEC-0236), ligado por ?systemProfile=1. */
  private _systemProfile: Map<string, number> | null = null;
  private readonly _sceneMirror = new NativeSceneMirror();
  private _sceneMirrorTried = false;
  /** DIAGNOSTICO TEMPORARIO (SPEC-0241). */
  private _ramoRelatado: string | null = null;
  private readonly _matrixFreezeAt = matrixFreezeRequested();
  /**
   * Variante do experimento que congela só a RECOMPOSIÇÃO da matriz local,
   * mantendo a descida na árvore (SPEC-0227). Separa as duas metades do
   * `updateMatrixWorld` para saber qual delas carrega o custo.
   */
  private readonly _matrixComposeFreezeAt = matrixComposeFreezeRequested();
  private _framesRendered = 0;
  private _postfx: { render(): void } | null = null;
  /**
   * Cena vazia desenhada enquanto a cena ativa está em montagem (SPEC-0219):
   * limpa o quadro pra tela de carregamento aparecer, sem tocar no cenário
   * meio construído.
   */
  private readonly _loadingScene = (() => {
    const scene = new ThreeScene();
    // Fundo PRETO explícito: sem background o quadro não é limpo e o resíduo do
    // buffer anterior (o logo da splash) reaparece como fantasma. Preto sólido
    // também é a cortina certa entre a marca e a tela de carregamento do jogo.
    scene.background = new Color(0x000000);
    return scene;
  })();
  private _loading = false;
  private _ui: UiLayer | null = null;
  private _inspect: InspectCamera | null = null;
  /** Cena/câmera renderizadas a cada frame. Por padrão são as do jogo; troque com
   * {@link setActiveScene} pra multi-cena (criador de personagem, menus, regiões). */
  /**
   * Limiar `raio/distância` do corte da casca de contorno (ADR-0251). `0`
   * desliga o filtro e devolve a autoria. É público porque é uma escolha de
   * ESTILO do jogo, não da engine: quem autora sabe a que distância o contorno
   * dele deixa de ler.
   */
  outlineMinRatio = DEFAULT_OUTLINE_MIN_RATIO;

  /**
   * Teto de quadros por segundo (ADR-0257). `0` = sem teto (padrão). É escolha
   * do JOGO: frame time constante lê como mais fluido que uma taxa maior que
   * oscila.
   *
   * Com vsync, só divisores do refresh do monitor dão frames de duração igual —
   * use {@link refreshHz} para escolher. Com `debug('loop')` ligado, um teto que
   * não divide o refresh é avisado no log.
   *
   * @example
   * game.maxFps = 60;
   */
  get maxFps(): number {
    return this._loop.maxFps;
  }

  set maxFps(fps: number) {
    this._loop.maxFps = fps;
  }

  /** Refresh do monitor estimado nos primeiros frames (Hz), ou `null` até lá. */
  get refreshHz(): number | null {
    return this._loop.refreshHz;
  }
  /** Frames desde a última passada do {@link cullOutlines}. */
  private _sinceOutlineCull = 0;
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
    this._renderPhases.install(this.renderer.threeRenderer);

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
    if (systemProfileRequested()) this._systemProfile = this.world.enableSystemProfile();
    this.input = new InputManager();
    if (typeof document !== 'undefined') this.input.attach(document.body);
    this.gamepad = new GamepadManager();
    this.actions = new InputActions(this.input, this.gamepad);
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
   * Declara que o jogo está **carregando** (SPEC-0219).
   *
   * Enquanto ligado, o `Game` desenha uma cena VAZIA no lugar do cenário — a
   * tela de carregamento do jogo aparece por cima, e o carregamento pode ceder
   * o frame barato (renderizar a cena inteira a cada frame cedido custava 626 ms
   * por frame no kart-racer). O `buildScene` já liga isso sozinho enquanto
   * monta; use quando a SUA carga continua depois dele (criar personagens,
   * carros, sistemas).
   *
   * @example
   * ```ts
   * game.setLoading(true)
   * try {
   *   const scene = await buildScene(...)   // cede frames sozinho
   *   await criaOsCarros(scene)             // suas cargas também cedem
   * } finally {
   *   game.setLoading(false)                // volta a desenhar o jogo
   * }
   * ```
   */
  setLoading(active: boolean): void {
    if (active === this._loading) return;
    this._loading = active;
    if (active) beginLoadingScope();
    else endLoadingScope();
  }

  /** O jogo está em carregamento declarado? Ver {@link setLoading}. */
  get isLoading(): boolean {
    return this._loading;
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
    // O pipeline ANTERIOR morre com a troca (SPEC-0152): no browser ele segura
    // RenderTargets (pirâmide do bloom, composer) que vazavam a cada fase — o
    // jogo típico faz `new PostFX(...)` por fase e larga o antigo sem referência.
    if (this._postfx && this._postfx !== postfx) {
      (this._postfx as { dispose?: () => void }).dispose?.();
    }
    // No host nativo o pós-FX vive em C++ (ADR-0147) e sobreviveria à troca de
    // fase: `null` precisa desligá-lo explicitamente, senão a fase seguinte
    // herda bloom/HDR que ela não pediu.
    if (!postfx) resetNativePostFX();
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
    this.actions.poll(); // bordas das ações DEPOIS do gamepad (ADR-0164)
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
    // Corte da casca de contorno por tamanho na tela (ADR-0251). Periódico, e
    // não todo frame, pelo mesmo motivo do culling de sombra: o resultado muda
    // devagar com a câmera, e a varredura custa mais que o erro de alguns
    // frames de atraso.
    if (++this._sinceOutlineCull >= OUTLINE_CULL_INTERVAL) {
      this._sinceOutlineCull = 0;
      // Seção própria no profiler: esta varredura roda EM RAJADA a cada N
      // frames e, sem medi-la, o custo dela cairia no frameMs sem aparecer em
      // contador nenhum — que é exatamente o tipo de buraco que já custou caro
      // nesta campanha.
      p.begin('cull');
      const stats = cullOutlines(
        this._activeScene.getThreeScene(),
        this._activeCamera.position,
        this.outlineMinRatio,
      );
      p.end('cull');
      debug('scene', `outlineCull: ${stats.culled}/${stats.evaluated} cascas escondidas`);
    }
    const inspectCamera = this._inspect?.active ? this._inspect : null;
    const editorCamera = this._editor?.activeCamera() ?? null;
    // Espelho de cena no host (SPEC-0234): instalado no primeiro frame em que a
    // cena já existe — instalar antes pegaria a árvore vazia, e ela não cresce
    // depois do build (o JS passa a segurar ponteiros para a memória do C++).
    if (
      !this._sceneMirrorTried &&
      !this._loading &&
      !isSceneBuilding(this._activeScene) &&
      nativeSceneMirrorAvailable()
    ) {
      this._sceneMirrorTried = true;
      this._sceneMirror.install(this._activeScene.getThreeScene());
    }
    p.begin('render');
    // DIAGNOSTICO TEMPORARIO (SPEC-0241, passo 0) — remover.
    {
      const ramo = isSplashActive()
        ? 'splash'
        : this._loading || isSceneBuilding(this._activeScene)
          ? 'loading'
          : this._inspect?.active
            ? 'inspect'
            : (this._editor?.activeCamera() ?? null)
              ? 'editor'
              : this._postfx && this._activeScene === this.scene
                ? 'postfx'
                : 'render-direto';
      if (ramo !== this._ramoRelatado) {
        this._ramoRelatado = ramo;
        debug('spike-m5', `ramo de render do Game = ${ramo}`);
      }
    }
    if (this._sceneMirror.installed) this._sceneMirror.update(this._activeCamera);
    if (isSplashActive()) {
      // Splash da engine no ar (ADR-0109): o host descarta o frame do jogo, só
      // ela apresenta. Desenhar aqui é puro desperdício — e durante a carga são
      // dezenas de frames cedidos pra splash animar.
    } else if (this._loading || isSceneBuilding(this._activeScene)) {
      // Cena em MONTAGEM (SPEC-0219): desenha uma cena VAZIA no lugar do
      // cenário pela metade. O build cede frames pra splash/tela de
      // carregamento andarem, e renderizar a cena a cada frame cedido subiria
      // buffers e compilaria pipeline do que acabou de nascer — no kart-racer
      // isso custava 626 ms POR FRAME e quadruplicava a montagem.
      //
      // Tem que desenhar ALGO: sem um frame, a UI logo abaixo não tem o que
      // compor e a tela fica congelada no último quadro (o logo da splash), em
      // vez de mostrar a tela de carregamento do jogo. A cena vazia custa um
      // clear.
      this.renderer.render(this._loadingScene, this._activeCamera);
    } else if (inspectCamera) {
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
    if (!isSplashActive()) this._ui?.render(); // UI por cima do frame (DOM é no-op)
    p.end('ui');
    p.commitFrame(); // fecha o frame do profiler (joga os acumuladores nos rings)
    this._renderPhases.commitFrame(); // idem para as fases do render (SPEC-0227)
    this._framesRendered++;
    if (this._matrixFreezeAt > 0 && this._framesRendered === this._matrixFreezeAt) {
      // As matrizes já foram calculadas nos frames anteriores; daqui em diante
      // o three não percorre mais a árvore para recompô-las.
      this._activeScene.getThreeScene().matrixWorldAutoUpdate = false;
      debug('perf', `[matrixFreeze] travessia de matriz congelada no frame ${this._framesRendered}`);
    }
    if (this._matrixComposeFreezeAt > 0 && this._framesRendered === this._matrixComposeFreezeAt) {
      // Só o compose: a árvore continua sendo percorrida e o `matrixWorld` de
      // quem tem pai em movimento continua certo.
      let nos = 0;
      this._activeScene.getThreeScene().traverse((obj) => {
        obj.matrixAutoUpdate = false;
        nos++;
      });
      debug('perf', `[matrixComposeFreeze] compose desligado em ${nos} nos`);
    }

    // HUD de métricas do modo debug (export --debug, ?cortexHud=1 ou o toggle
    // do menu do Studio): criado preguiçosamente e alimentado com o delta CRU.
    if (this._debugHud === undefined) {
      this._debugHud = debugHudRequested() ? this.createDebugHud() : null;
    }
    this._debugHud?.frame(deltaMs);

    // Perf trace (SPEC-0198): com as métricas ativas no host nativo, grava uma
    // amostra periódica (fps/CPU/draws/câmera/visíveis) em perf-trace.jsonl.
    // Sem a ponte do host, é no-op — nem coleta. Quais pipelines nascem
    // (SPEC-0261) vem junto; instalar é idempotente e barato.
    this._perfTrace.watchPipelines(
      (this.renderer.threeRenderer as { backend?: unknown }).backend,
      () => this._activeCamera,
    );
    this._perfTrace.tick(
      deltaMs,
      this._activeScene.getThreeScene(),
      this._activeCamera,
      this.profiler,
      (this.renderer.threeRenderer as { info?: { render?: { drawCalls?: number; triangles?: number } } }).info?.render ?? null,
      this._renderPhases,
      this._systemProfile,
    );
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

  /**
   * **Pré-aquece os pipelines** da cena ativa (SPEC-0196) — compila os shaders
   * agora em vez de no primeiro frame em que cada objeto aparece, que é o que
   * causa o travadinho ao começar uma corrida/fase.
   *
   * O `buildScene` já faz isso com o que ele monta; chame aqui pra o que o JOGO
   * cria DEPOIS (carros montados por código, efeitos, UI de runtime) —
   * idealmente ainda sob a tela de carregamento.
   *
   * @example
   * const player = await createCar(game, golf, golfRig)
   * await game.precompile()
   * game.start()
   */
  precompile(): Promise<void> {
    return this.renderer.precompile(this._activeScene.getThreeScene(), this._activeCamera);
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
   * @param options.releaseAssets - `true` também **despeja os caches de asset**
   *   ({@link clearSceneAssetCaches}: GLTF/texturas/áudio/BVH ficam fora da RAM,
   *   e a próxima cena recarrega do zero). Default `false`: o cache por URL é
   *   proposital — trocar de fase reusa peças já carregadas. Use `true` nos
   *   pontos de troca "larga" (voltar ao menu, trocar de mundo). SPEC-0152.
   *
   * @example
   * // "Voltar ao menu" sem recarregar a página (funciona no export nativo):
   * game.reset({ releaseAssets: true });
   * const level = await showMainMenu(game, LEVELS);
   * // ...re-setup + buildScene + game.start()...
   */
  reset(options: { releaseAssets?: boolean } = {}): void {
    this.stop();
    this.world.clear();
    this.scene.disposeAll();
    // PostFX da fase morre junto (dispõe pipeline/render targets e desliga o
    // pós-FX nativo) — antes ele sobrevivia ao reset segurando GPU (SPEC-0152).
    this.setPostFX(null);
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
    if (options.releaseAssets) clearSceneAssetCaches();
    // Caches INTERNOS do renderer (three, SPEC-0152): PMREMNode/ShadowNode e
    // seus RenderTargets (PMREM do environment = 2× 3072×4096 half-float,
    // ~190 MB!) ficam pinados numa teia de caches (nós, render lists/contexts,
    // bindings com bind groups → views → texturas) que NÃO é alcançada pelo
    // teardown da cena — cada fase somava um PMREM + shadow map novos (medido
    // no soak do export). Descarta os mesmos gerenciadores que o
    // `renderer.dispose()` descarta, MENOS backend/info (o device continua
    // vivo) — o próximo frame reconstrói tudo lazy, como no design do three.
    // (API interna — o optional chaining protege contra upgrades.)
    {
      const three = this.renderer.threeRenderer as unknown as Record<string, { dispose?: () => void } | undefined>;
      for (const cache of ['_objects', '_nodes', '_bindings', '_renderLists', '_renderContexts']) {
        three[cache]?.dispose?.();
      }
    }
    // Host nativo (ADR-0153): o GC do Hermes não sente a pressão dos wrappers de
    // GPU (objetos JS minúsculos segurando MBs nativos) e podia nunca coletar —
    // a fase anterior ficava inteira na VRAM. O nudge roda a coleta AGORA, atrás
    // da tela de loading da troca: finalizers → `wgpu*Release` → memória de
    // volta. No browser o global não existe e o optional chaining é no-op.
    (globalThis as { __cortexGC?: () => void }).__cortexGC?.();
  }
}
