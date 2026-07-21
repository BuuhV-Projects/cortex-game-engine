/**
 * **Benchmark de cidade sintética** (M-perf-1 / ADR-0135) — entry que monta a
 * cena de estresse ({@link generateCityScene}), adiciona objetos dinâmicos
 * ("tráfego", fora do merge estático), roda o {@link BenchRunner} e emite a
 * linha `[bench]{…}` que o `native/scripts/bench.mjs` coleta. É um "jogo" real
 * pro pipeline de export (só `main.ts`, sem assets) — mede o host de verdade.
 *
 * Overrides opcionais (browser: defina antes de carregar; default no host):
 * - `globalThis.__cortexBenchParams` — {@link BenchCityParams} parcial.
 * - `globalThis.__cortexBenchMergeStatic` — liga/desliga o merge (default true).
 */
import { Game, buildScene, CellStreamingSystem, runWithLoadingScreen, UiPanel, UiLabel, loadGLB, instance } from '../../src/index-runtime.js';
import { Mesh, BoxGeometry, MeshStandardMaterial, type Material, type Object3D } from 'three';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import { generateCityScene, DEFAULT_BENCH_CITY, type BenchCityParams } from './generate.js';
import { wrapBakedCell } from './cells.js';
import type { StreamingCell } from '../../src/scene/Streaming.js';
import { BenchRunner, type BenchReport, type BenchRail } from './BenchRunner.js';

// ── Constantes do bench (sem números mágicos) ────────────────────────────────
const WARMUP_FRAMES = 60;
const MEASURE_FRAMES = 600;
const RAIL_RADIUS_FACTOR = 0.45;
const RAIL_HEIGHT_FACTOR = 0.22;
const RAIL_ANGULAR_SPEED = 0.25; // rad/s
const RAIL_LOOK_AT_HEIGHT = 20;
const TRAFFIC_SIZE: [number, number, number] = [2, 2, 4];
const TRAFFIC_HEIGHT = 1;
const TRAFFIC_RADIUS_JITTER = 0.4;
const TRAFFIC_SPEED_MIN = 0.3;
const TRAFFIC_SPEED_MAX = 1.1;
// ── Streaming de células (M-perf-4) ──────────────────────────────────────────
// (o lado da célula é definido no bake — `bake-city.mjs` CELL_SIZE — e chega em
// runtime pelo manifesto `city-cells.json`.) Sem LOD de geometria: os modelos já
// são low-poly; perf de longe = culling + streaming + bundles.
const STREAM_RADIUS = 230; // carrega células dentro deste raio
const STREAM_HYSTERESIS = 50; // descarrega só além de raio+histerese (anti-thrash)
const STREAM_BUDGET = 3; // células adicionadas por frame (add de pré-montada é barato)
const TRAVERSE_HEIGHT = 14; // altura da câmera andando (m)
const TRAVERSE_SPEED = 45; // m/s
const TRAVERSE_LOOK_HEIGHT = 12;

function readParams(): BenchCityParams {
  const override = (globalThis as { __cortexBenchParams?: Partial<BenchCityParams> }).__cortexBenchParams;
  return { ...DEFAULT_BENCH_CITY, ...(override ?? {}) };
}

function mergeStaticEnabled(): boolean {
  const flag = (globalThis as { __cortexBenchMergeStatic?: boolean }).__cortexBenchMergeStatic;
  return flag ?? true;
}

function renderBundlesEnabled(): boolean {
  const flag = (globalThis as { __cortexBenchBundles?: boolean }).__cortexBenchBundles;
  return flag ?? true;
}

function streamingEnabled(): boolean {
  const flag = (globalThis as { __cortexBenchStreaming?: boolean }).__cortexBenchStreaming;
  return flag ?? true;
}

/** Imprime a linha `[bench]` (native: `print`; browser: `console.log`). */
function emit(line: string): void {
  const p = (globalThis as { print?: (s: string) => void }).print;
  if (typeof p === 'function') p(line);
  else console.log(line);
}

/** Frames que o menu fica no ar antes de auto-iniciar (o bench não tem humano). */
const MENU_AUTO_FRAMES = 90;

/** Próximo frame (rAF) como Promise. */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Espera a SPLASH nativa da engine terminar. Enquanto ela cobre a tela, os game
 * frames são descartados — se o jogo carregasse agora, a tela de loading só
 * apareceria no fim. Aqui o jogo só monta a cidade DEPOIS da splash (ADR-0138).
 */
async function waitForSplash(): Promise<void> {
  const active = (globalThis as { __cortexSplashActive?: () => boolean }).__cortexSplashActive;
  if (typeof active !== 'function') return;
  while (active()) await nextFrame();
}

/**
 * MENU (aparece DEPOIS da splash nativa da engine): mostra um título e espera
 * "Jogar" (gamepad A ou timeout no bench). Dirige o próprio loop de render
 * (`requestAnimationFrame`) — a cidade só começa a ser montada quando o jogador
 * inicia. Retorna quando o jogador "clica em jogar".
 */
async function showMenu(game: Game): Promise<void> {
  const ui = game.ui;
  const bg = ui.add(new UiPanel({ anchor: 'top-left', width: 16384, height: 16384, background: '#0b0e14' }));
  const title = ui.add(new UiLabel({ anchor: 'center', y: -28, text: 'BENCH CITY', fontSize: 30, color: '#4ec9b0' }));
  const hint = ui.add(new UiLabel({ anchor: 'center', y: 22, text: 'A / clique pra jogar', fontSize: 15, color: '#e8e8e8' }));
  await new Promise<void>((resolve) => {
    let frames = 0;
    const frame = (): void => {
      frames++;
      game.gamepad.poll();
      ui.update(0);
      ui.render();
      if (game.gamepad.isButtonDown(0, 0) || frames >= MENU_AUTO_FRAMES) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (const w of [bg, title, hint]) ui.remove(w);
}

const params = readParams();
const cityExtent = params.rows * params.spacing;

const canvas =
  (document.getElementById('canvas') as HTMLCanvasElement | null) ??
  (document.body.appendChild(document.createElement('canvas')) as HTMLCanvasElement);

const game = new Game({ canvas });

const sceneDef = generateCityScene(params);
const three = game.scene.getThreeScene();

// Base (chão + luz/fog/céu, sempre residente). Os PRÉDIOS não vêm mais do
// gerador em runtime — vêm PRÉ-FUNDIDOS do `city.glb` (bake offline, M-perf-4).
const baseNodes = sceneDef.nodes.filter((n) => n.type !== 'model');

const scene = await buildScene(game.scene, [{ ...sceneDef, nodes: baseNodes }] as unknown as SceneDefinition[], {
  renderer: game.renderer,
  world: game.world,
  camera: game.camera,
  mergeStatic: mergeStaticEnabled(),
  renderBundles: renderBundlesEnabled(),
});

// ── Streaming de BYTES por célula (M-perf-4 bake): o boot carrega só os materiais
// (`city-mats.glb`, 1×) + 1 célula pra pré-aquecer o pipeline; cada `cells/
// cell-<key>.glb` (geometria PURA) é carregado SOB DEMANDA quando entra no raio
// (onLoad async). O material é reatribuído por NOME do cache compartilhado (as
// texturas sobem 1× só). Boot de ~9s vira ~2s. Manifesto = chaves + centros. ──
interface CityManifest {
  cellSize: number;
  cells: StreamingCell[];
}
const manifest = (await (await fetch('assets/city-cells.json')).json()) as CityManifest;
const cells: StreamingCell[] = manifest.cells;

const matMap = new Map<string, Material>(); // nome do material → material real (com textura)
const cellCache = new Map<string, Object3D>(); // célula já carregada+envolvida (revisita = grátis)
const threeRenderer = game.renderer.threeRenderer as {
  compileAsync?: (scene: unknown, camera: unknown) => Promise<unknown>;
};

/** Carrega o `.glb` de UMA célula (geometria pura), reatribui os materiais
 *  compartilhados por nome, e envolve num BundleGroup. Cacheado. */
async function loadAndWrapCell(key: string): Promise<Object3D> {
  const cached = cellCache.get(key);
  if (cached) return cached;
  const gltf = await loadGLB(`assets/cells/cell-${key}.glb`);
  const obj = instance(gltf, { castShadow: true, receiveShadow: true });
  obj.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const shared = matMap.get((mesh.material as Material).name);
    if (shared) mesh.material = shared; // textura compartilhada (subiu 1× no city-mats)
  });
  const node = (obj.getObjectByName(`cell-${key}`) ?? obj) as Object3D;
  const wrapped = wrapBakedCell(node, renderBundlesEnabled());
  cellCache.set(key, wrapped);
  return wrapped;
}

async function loadCity(progress: (label: string, fraction: number) => void): Promise<void> {
  const t0 = performance.now();
  progress('Carregando materiais…', 0.15);
  const matsGltf = await loadGLB('assets/city-mats.glb');
  matsGltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as Material;
      if (mat?.name) matMap.set(mat.name, mat);
    }
  });
  emit(`[loading] materiais: ${matMap.size} em ${(performance.now() - t0).toFixed(0)}ms`);

  // Pré-aquece o pipeline: 1 célula (materiais compartilhados → compila pra todas).
  progress('Compilando shaders…', 0.5);
  const warm = await loadAndWrapCell(cells[0].key);
  three.add(warm);
  if (typeof threeRenderer.compileAsync === 'function') {
    await threeRenderer.compileAsync(three, game.camera);
  }
  three.remove(warm); // o streaming re-adiciona por distância
  emit(`[loading] pronto (mats + 1 célula) em ${(performance.now() - t0).toFixed(0)}ms`);
}

const streaming: CellStreamingSystem = new CellStreamingSystem(cells, {
  radius: STREAM_RADIUS,
  hysteresis: STREAM_HYSTERESIS,
  budgetPerFrame: STREAM_BUDGET,
  getCameraXZ: () => ({ x: game.camera.position.x, z: game.camera.position.z }),
  onLoad: async (key) => {
    const w = await loadAndWrapCell(key); // carrega o .glb da célula sob demanda
    if (streaming.isResident(key)) three.add(w); // pode ter saído do raio no meio-tempo
  },
  onUnload: (key) => {
    const w = cellCache.get(key);
    if (w) three.remove(w); // cacheada — revisita não recarrega
  },
});

// ── Tráfego dinâmico: caixas girando (fora do bundle — representam veículos) ──
const traffic: Array<{ mesh: Mesh; radius: number; speed: number; phase: number }> = [];
for (let i = 0; i < params.traffic; i++) {
  const mat = new MeshStandardMaterial({ color: 0xdd4422 });
  const mesh = new Mesh(new BoxGeometry(...TRAFFIC_SIZE), mat);
  const radius = (0.1 + (i / params.traffic) * RAIL_RADIUS_FACTOR) * cityExtent * (1 + TRAFFIC_RADIUS_JITTER);
  const speed = TRAFFIC_SPEED_MIN + (i % 7) / 7 * (TRAFFIC_SPEED_MAX - TRAFFIC_SPEED_MIN);
  const phase = (i / params.traffic) * Math.PI * 2;
  mesh.position.set(Math.cos(phase) * radius, TRAFFIC_HEIGHT, Math.sin(phase) * radius);
  three.add(mesh);
  traffic.push({ mesh, radius, speed, phase });
}

let trafficTime = 0;
function moveTraffic(dt: number): void {
  trafficTime += dt;
  for (const car of traffic) {
    const a = car.phase + trafficTime * car.speed;
    car.mesh.position.set(Math.cos(a) * car.radius, TRAFFIC_HEIGHT, Math.sin(a) * car.radius);
    car.mesh.rotation.y = -a;
  }
}

// Dois testes (ambos válidos num GTA): ORBIT = sobrevoo (avião, vê a cidade toda,
// o LOD faz os distantes virarem proxy) e TRAVERSE = anda pela rua (exercita o
// streaming: células entram/saem do raio). Rodam em sequência num run só.
const ORBIT_RAIL = {
  mode: 'orbit' as const,
  radius: cityExtent * RAIL_RADIUS_FACTOR,
  height: cityExtent * RAIL_HEIGHT_FACTOR,
  angularSpeed: RAIL_ANGULAR_SPEED,
  lookAtHeight: RAIL_LOOK_AT_HEIGHT,
};
const TRAVERSE_RAIL = {
  mode: 'traverse' as const,
  radius: cityExtent * 0.48,
  height: TRAVERSE_HEIGHT,
  angularSpeed: 0,
  speed: TRAVERSE_SPEED,
  lookAtHeight: TRAVERSE_LOOK_HEIGHT,
};

const quit = (): void => (globalThis as { __cortexQuit?: () => void }).__cortexQuit?.();

function phaseRunner(label: string, rail: BenchRail, onDone: () => void, alsoPlain = false): BenchRunner {
  return new BenchRunner(game.camera, game.profiler, {
    params,
    warmupFrames: WARMUP_FRAMES,
    measureFrames: MEASURE_FRAMES,
    rail,
    onReport: (report: BenchReport) => {
      emit(`[stream:${label}] residentes=${streaming.residentCount}/${cells.length}`);
      emit(`[bench:${label}]` + JSON.stringify(report));
      if (alsoPlain) emit('[bench]' + JSON.stringify(report)); // compat bench.mjs
      onDone();
    },
  });
}

// Roda os dois em sequência: orbit (avião) → traverse (andando).
let active: BenchRunner;
const traverseRunner = phaseRunner('traverse', TRAVERSE_RAIL, quit, /*alsoPlain*/ true);
const orbitRunner = phaseRunner('orbit', ORBIT_RAIL, () => {
  game.profiler.reset();
  active = traverseRunner;
});
active = orbitRunner;

// Sonda de IO (M-perf-3): mede o BLOQUEIO da thread pra ler um asset de ~40 MB
// síncrono (__cortexReadFile) vs assíncrono (__cortexReadFileAsync — leitura no
// worker, a chamada não bloqueia). Roda 1× no warmup (fora da janela medida).
const IO_PROBE_FRAME = 5;
const IO_PROBE_ASSET = 'assets/models/Building_Large_2.glb';
function ioProbe(): void {
  const g = globalThis as {
    __cortexReadFile?: (u: string) => ArrayBuffer | null;
    __cortexReadFileAsync?: (u: string) => Promise<ArrayBuffer | null>;
  };
  const now = (): number => performance.now();
  let t = now();
  const sync = g.__cortexReadFile?.(IO_PROBE_ASSET) ?? null;
  const syncBlock = now() - t;
  if (typeof g.__cortexReadFileAsync !== 'function') {
    emit(`[io] sync-block=${syncBlock.toFixed(1)}ms async=indisponível`);
    return;
  }
  t = now();
  const p = g.__cortexReadFileAsync(IO_PROBE_ASSET);
  const asyncCall = now() - t;
  const tStart = now();
  void p.then((buf) => {
    emit(
      `[io] sync-block=${syncBlock.toFixed(1)}ms · async-call=${asyncCall.toFixed(2)}ms · async-latency=${(now() - tStart).toFixed(1)}ms · bytes sync=${sync?.byteLength ?? 0} async=${buf?.byteLength ?? 0}`,
    );
  });
}

let frameCount = 0;
game.onUpdate((dt) => {
  scene.update(dt);
  moveTraffic(dt);
  if (++frameCount === IO_PROBE_FRAME) ioProbe();
  active.tick(dt); // orbit primeiro, depois traverse (encadeados)
});

// Sequência de boot (o que o usuário pediu): splash nativa (host, cobre o boot)
// → ESPERA a splash terminar → MENU → tela de LOADING montando a cidade → JOGO.
// A cidade só é gerada quando o jogador inicia pelo menu; assim a tela de loading
// aparece VISÍVEL primeiro e a barra enche durante a montagem (não "atrás" da splash).
await waitForSplash();
await showMenu(game);
await runWithLoadingScreen(game.ui, loadCity, { message: 'Carregando cidade…' });
if (streamingEnabled()) game.world.addSystem(streaming);
else for (const c of cells) three.add(await loadAndWrapCell(c.key)); // sem streaming: carrega tudo
game.start();
