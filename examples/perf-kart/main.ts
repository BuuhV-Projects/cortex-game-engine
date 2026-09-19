/**
 * **Harness de medição da cena do kart-racer** (SPEC-0196) — monta o
 * `scenes/level.json` do jogo com o `buildScene` desta árvore e reporta os
 * números que decidem perf de render: materiais distintos, draw calls,
 * triângulos e fps.
 *
 * É um juiz determinístico pro antes/depois do cache de preset de material: os
 * contadores de cena (materiais/draws) não dependem da máquina; o fps é a
 * confirmação. Os assets vêm do projeto do jogo via `publicDir`
 * (`vite.perf-kart.config.ts`) — nada é copiado nem alterado lá.
 *
 * Uso: `yarn dev:perf-kart` e leia o `[perf-kart]{…}` no console.
 */
import { Game, buildScene, parseSceneDefinition } from '../../src/index-runtime.js';
import type { Material, Mesh, Texture } from 'three';

/** Quadros descartados antes de medir (compila pipeline, aquece cache). */
const WARMUP_FRAMES = 90;
/** Quadros medidos para a média de fps. */
const MEASURE_FRAMES = 240;
/** Distância da câmera de medição ao alvo, em metros. */
const CAMERA_DISTANCE = 120;
/** Altura da câmera de medição, em metros. */
const CAMERA_HEIGHT = 45;

interface SceneCounts {
  meshes: number;
  materials: number;
  gradientMaps: number;
  geometries: number;
}

/** Conta recursos DISTINTOS na cena montada (por identidade, não por nó). */
function countScene(root: { traverse(cb: (o: unknown) => void): void }): SceneCounts {
  const materials = new Set<Material>();
  const gradients = new Set<Texture>();
  const geometries = new Set<unknown>();
  let meshes = 0;
  root.traverse((obj) => {
    const mesh = obj as Partial<Mesh> & { isMesh?: boolean };
    if (!mesh.isMesh) return;
    meshes++;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      materials.add(m);
      const ramp = (m as Partial<{ gradientMap: Texture | null }>).gradientMap;
      if (ramp) gradients.add(ramp);
    }
  });
  return { meshes, materials: materials.size, gradientMaps: gradients.size, geometries: geometries.size };
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const out = document.getElementById('out') as HTMLDivElement;
const game = new Game({ canvas, far: 1000 });

const level = await (await fetch('/scenes/level.json')).json();
const definition = parseSceneDefinition(level);
if (!definition) throw new Error('level.json inválido');

const buildStart = performance.now();
await buildScene(game.scene, definition, {
  renderer: game.renderer,
  world: game.world,
  camera: game.camera,
  matte: true,
});
const buildMs = performance.now() - buildStart;

const counts = countScene(game.scene.getThreeScene());

game.camera.position.set(CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_DISTANCE);
game.camera.lookAt(0, 0, 0);

let frames = 0;
let measureStart = 0;
/** `info` do three — lido NA HORA do report: antes do init do backend ele é outro objeto. */
const renderInfo = (): { drawCalls?: number; triangles?: number } =>
  (game.renderer.threeRenderer as { info?: { render?: { drawCalls?: number; triangles?: number } } }).info?.render ?? {};

game.onUpdate(() => {
  frames++;
  if (frames === WARMUP_FRAMES) measureStart = performance.now();
  if (frames !== WARMUP_FRAMES + MEASURE_FRAMES) return;
  const fps = (MEASURE_FRAMES * 1000) / (performance.now() - measureStart);
  // O `info` do three é zerado no início de cada `render()`; lido DENTRO do tick
  // ele vem vazio. O `setTimeout` sai do frame e lê os contadores preenchidos.
  setTimeout(() => {
    const report = {
      // Sem backend pronto o `render()` é no-op: o fps seria de um loop VAZIO.
      rendering: game.renderer.isReady,
      fps: +fps.toFixed(1),
      drawCalls: renderInfo().drawCalls ?? 0,
      triangles: renderInfo().triangles ?? 0,
      buildMs: +buildMs.toFixed(0),
      ...counts,
    };
    // eslint-disable-next-line no-console -- o harness EXISTE pra imprimir isto
    console.log(`[perf-kart]${JSON.stringify(report)}`);
    out.textContent = Object.entries(report).map(([k, v]) => `${k}: ${v}`).join('\n');
    (globalThis as { __perfKart?: unknown }).__perfKart = report;
  }, 0);
});

// Exposto pro probe do medidor inspecionar o renderer de fora (harness, não engine).
(globalThis as { __perfKartGame?: unknown }).__perfKartGame = game;

game.start();
