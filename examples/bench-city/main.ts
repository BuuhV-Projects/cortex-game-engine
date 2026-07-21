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
import { Game, buildScene } from '../../src/index-runtime.js';
import { Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import { generateCityScene, DEFAULT_BENCH_CITY, type BenchCityParams } from './generate.js';
import { BenchRunner, type BenchReport } from './BenchRunner.js';

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
const scene = await buildScene(game.scene, [sceneDef] as unknown as SceneDefinition[], {
  renderer: game.renderer,
  world: game.world,
  camera: game.camera,
  mergeStatic: mergeStaticEnabled(),
  renderBundles: renderBundlesEnabled(),
});

// ── Tráfego dinâmico: caixas girando (fora do bundle — representam veículos) ──
const three = game.scene.getThreeScene();
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

const runner = new BenchRunner(game.camera, game.profiler, {
  params,
  warmupFrames: WARMUP_FRAMES,
  measureFrames: MEASURE_FRAMES,
  rail: {
    radius: cityExtent * RAIL_RADIUS_FACTOR,
    height: cityExtent * RAIL_HEIGHT_FACTOR,
    angularSpeed: RAIL_ANGULAR_SPEED,
    lookAtHeight: RAIL_LOOK_AT_HEIGHT,
  },
  onReport: (report: BenchReport) => {
    emit('[bench]' + JSON.stringify(report));
    (globalThis as { __cortexQuit?: () => void }).__cortexQuit?.();
  },
});

game.onUpdate((dt) => {
  scene.update(dt);
  moveTraffic(dt);
  runner.tick(dt);
});

game.start();
