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
import { Mesh, BoxGeometry, MeshStandardMaterial, type Object3D } from 'three';
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

// ── Cidade PRÉ-FUNDIDA (M-perf-4 bake): carrega o `city.glb` UMA vez (geometria
// já fundida por célula, offline) e ENVOLVE cada nó `cell-<key>` num BundleGroup.
// Sem buildScene/merge por prédio em runtime → load de segundos vira ms. O
// manifesto (`city-cells.json`) traz as chaves + centros das células. ──
interface CityManifest {
  cellSize: number;
  cells: StreamingCell[];
}
const manifest = (await (await fetch('assets/city-cells.json')).json()) as CityManifest;
const cells: StreamingCell[] = manifest.cells;

const cellCache = new Map<string, Object3D>();
const threeRenderer = game.renderer.threeRenderer as {
  compileAsync?: (scene: unknown, camera: unknown) => Promise<unknown>;
};

async function loadCity(progress: (label: string, fraction: number) => void): Promise<void> {
  const t0 = performance.now();
  progress('Carregando cidade…', 0.05);
  const gltf = await loadGLB('assets/city.glb');
  const cityObj = instance(gltf, { castShadow: true, receiveShadow: true });
  emit(`[loading] city.glb carregado em ${(performance.now() - t0).toFixed(0)}ms`);
  await nextFrame();

  // Envolve cada célula pré-fundida num BundleGroup (barato — sem merge). O
  // streaming adiciona/remove por distância.
  let i = 0;
  for (const c of cells) {
    const full = cityObj.getObjectByName(`cell-${c.key}`) as Object3D | undefined;
    if (full) cellCache.set(c.key, wrapBakedCell(full, renderBundlesEnabled()));
    i++;
    progress(`Preparando cidade ${i}/${cells.length}`, 0.1 + 0.6 * (i / cells.length));
    await nextFrame();
  }

  // Pré-aquece os pipelines (compileAsync) — mata o hitch de compile no 1º add.
  for (const cell of cellCache.values()) three.add(cell);
  if (typeof threeRenderer.compileAsync === 'function') {
    progress('Compilando shaders…', 0.85);
    await threeRenderer.compileAsync(three, game.camera);
  }
  for (const cell of cellCache.values()) three.remove(cell); // o streaming re-adiciona por distância
  emit(`[loading] cidade pronta (${cellCache.size} células) em ${(performance.now() - t0).toFixed(0)}ms`);
}

const streaming = new CellStreamingSystem(cells, {
  radius: STREAM_RADIUS,
  hysteresis: STREAM_HYSTERESIS,
  budgetPerFrame: STREAM_BUDGET,
  getCameraXZ: () => ({ x: game.camera.position.x, z: game.camera.position.z }),
  onLoad: (key) => { three.add(cellCache.get(key)!); }, // pré-montada → add barato
  onUnload: (key) => { three.remove(cellCache.get(key)!); },
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
else for (const cell of cellCache.values()) three.add(cell);
game.start();
