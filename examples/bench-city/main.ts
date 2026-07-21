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
import { Game, buildScene, CellStreamingSystem } from '../../src/index-runtime.js';
import { Mesh, BoxGeometry, MeshStandardMaterial, LOD } from 'three';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import { generateCityScene, DEFAULT_BENCH_CITY, type BenchCityParams } from './generate.js';
import { partitionCells, buildCellLod, type BuildingNode } from './cells.js';
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
// ── Streaming de células + LOD (M-perf-4) ────────────────────────────────────
const CELL_SIZE = 90; // lado da célula (m)
// Câmera BAIXA (traverse) → a distância 3D é ~a horizontal, então o LOD fica
// intuitivo: perto = full (textura), longe = proxy. Raio de full pequeno
// (qualidade perto), raio de stream maior (o entorno carregado), unload além.
const STREAM_RADIUS = 190; // carrega (full OU proxy) dentro deste raio
const STREAM_HYSTERESIS = 40; // descarrega só além de raio+histerese (anti-thrash)
const STREAM_BUDGET = 3; // células adicionadas por frame (add de pré-montada é barato)
const LOD_DISTANCE = 120; // até aqui: célula full (textura); além: proxy de caixas
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

const params = readParams();
const cityExtent = params.rows * params.spacing;

const canvas =
  (document.getElementById('canvas') as HTMLCanvasElement | null) ??
  (document.body.appendChild(document.createElement('canvas')) as HTMLCanvasElement);

const game = new Game({ canvas });

const sceneDef = generateCityScene(params);
const three = game.scene.getThreeScene();

// Split: prédios (streamados em células) vs base (chão + luz/fog/céu, sempre residente).
const buildingNodes = sceneDef.nodes.filter((n) => n.type === 'model') as unknown as BuildingNode[];
const baseNodes = sceneDef.nodes.filter((n) => n.type !== 'model');

const scene = await buildScene(game.scene, [{ ...sceneDef, nodes: baseNodes }] as unknown as SceneDefinition[], {
  renderer: game.renderer,
  world: game.world,
  camera: game.camera,
  mergeStatic: mergeStaticEnabled(),
  renderBundles: renderBundlesEnabled(),
});

// ── Células + LOD (M-perf-4): carga SOB DEMANDA. Particiona (barato), monta cada
// célula só quando entra no raio (onLoad async, via buildCellLod). O boot NÃO
// monta a cidade toda — só pré-aquece os pipelines com poucas células.
const { cells, byKey } = partitionCells(buildingNodes, CELL_SIZE);
const cellOpts = {
  cellSize: CELL_SIZE,
  lodDistance: LOD_DISTANCE,
  mergeStatic: mergeStaticEnabled(),
  renderBundles: renderBundlesEnabled(),
  renderer: game.renderer,
};
// PRÉ-MONTA as células no boot (a splash da engine cobre esse tempo). Montar
// sob demanda durante o jogo trava (o de-interleave+merge+bundle de uma célula é
// pesado na thread JS) — então pré-monta e o streaming só ADICIONA/REMOVE
// (barato). O `[loading]` é o feedback que o dev usa pra a tela de carregamento.
const lodCache = new Map<string, LOD>();
let builtCount = 0;
for (const c of cells) {
  lodCache.set(c.key, await buildCellLod(byKey.get(c.key)!, cellOpts));
  emit(`[loading] montando cidade ${++builtCount}/${cells.length}`);
}

// Pré-aquece os pipelines (compileAsync) — mata o hitch de compile no 1º add.
const threeRenderer = game.renderer.threeRenderer as {
  compileAsync?: (scene: unknown, camera: unknown) => Promise<unknown>;
};
for (const lod of lodCache.values()) three.add(lod);
if (typeof threeRenderer.compileAsync === 'function') {
  await threeRenderer.compileAsync(three, game.camera);
}
for (const lod of lodCache.values()) three.remove(lod); // o streaming re-adiciona por distância

const streaming = new CellStreamingSystem(cells, {
  radius: STREAM_RADIUS,
  hysteresis: STREAM_HYSTERESIS,
  budgetPerFrame: STREAM_BUDGET,
  getCameraXZ: () => ({ x: game.camera.position.x, z: game.camera.position.z }),
  onLoad: (key) => { three.add(lodCache.get(key)!); }, // pré-montada → add barato
  onUnload: (key) => { three.remove(lodCache.get(key)!); },
});

if (streamingEnabled()) {
  game.world.addSystem(streaming); // roda no world.tick (após o rail mover a câmera)
} else {
  for (const lod of lodCache.values()) three.add(lod); // baseline: tudo residente
}

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

game.start();
