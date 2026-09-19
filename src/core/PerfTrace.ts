import { Frustum, Matrix4, Vector3, type Camera, type Mesh, type Object3D } from 'three';
import type { FrameProfiler } from './FrameProfiler.js';

/**
 * **Perf trace de gameplay** (SPEC-0198) — com as métricas ativas, grava uma
 * linha JSONL por amostra num arquivo, enquanto se joga: fps, tempo de CPU por
 * seção, draws/triângulos, onde a câmera estava e **quais nós de cena estavam
 * visíveis**.
 *
 * É a ferramenta que responde "por que caiu de 50 pra 32 naquele trecho" sem
 * depender de print de HUD no momento certo — foi o que custou uma rodada
 * inteira de otimização no alvo errado no `kart-racer`.
 *
 * Só escreve no **host nativo**: a ponte é `globalThis.__cortexPerfTrace`, que o
 * host registra apenas quando o jogo roda com métricas (export `--debug`,
 * dev-run ou `CORTEX_VRAM_LOG`). Sem a ponte, {@link PerfTrace.tick} não coleta
 * nada e o custo é zero.
 */

/** Intervalo entre amostras, em ms. */
const SAMPLE_MS = 500;

/** Casas decimais dos tempos (ms) na linha gravada. */
const MS_DECIMALS = 1;

/** Casas decimais das coordenadas de câmera (m). */
const POS_DECIMALS = 1;

/** Um nó de cena visível na amostra. */
export interface VisibleNode {
  /** `node.id` da cena (o `buildScene` grava em `obj.name`). */
  id: string;
  /** Sub-malhas visíveis desse nó no frame. */
  meshes: number;
  /** Triângulos que o nó contribuiu. */
  tris: number;
}

/** Uma amostra do trace, como vai serializada em JSONL. */
export interface PerfSample {
  /** ms desde o boot. */
  t: number;
  fps: number;
  frameMs: number;
  /** ms de CPU por seção do {@link FrameProfiler} (`{ render: 28.1, … }`). */
  cpu: Record<string, number>;
  draws: number;
  tris: number;
  /** Posição da câmera (x, y, z) e direção para onde olha. */
  cam: { x: number; y: number; z: number; dx: number; dy: number; dz: number };
  /** Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos. */
  visible: VisibleNode[];
}

/** A ponte do host: existe só com as métricas ativas. */
type TraceBridge = (line: string) => void;

function bridge(): TraceBridge | undefined {
  const fn = (globalThis as { __cortexPerfTrace?: unknown }).__cortexPerfTrace;
  return typeof fn === 'function' ? (fn as TraceBridge) : undefined;
}

/** Arredonda pra `decimals` casas (evita linha cheia de ruído de ponto flutuante). */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Triângulos que uma malha desenha (indexada ou não). */
function triangleCount(mesh: Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry) return 0;
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  const count = index ? index.count : (position?.count ?? 0);
  return Math.floor(count / 3);
}

/**
 * Sobe a hierarquia até o nó de cena (`userData.cortexSceneNode`) e devolve o
 * `id` dele. Malha fora de um nó de cena (chrome do editor, malha criada por
 * código) cai no nome próprio — o trace registra o que existe, sem inventar.
 */
function sceneNodeIdOf(obj: Object3D): string {
  let current: Object3D | null = obj;
  while (current) {
    if ((current.userData as Record<string, unknown>)['cortexSceneNode'] === true) {
      return current.name || '(sem id)';
    }
    current = current.parent;
  }
  return obj.name || '(avulso)';
}

const _frustum = new Frustum();
const _matrix = new Matrix4();
const _direction = new Vector3();

/**
 * Percorre a cena e agrega, por nó de cena, o que está DENTRO do frustum da
 * câmera. É o traverse mais caro do trace — roda uma vez por amostra, nunca por
 * frame.
 */
export function collectVisible(scene: Object3D, camera: Camera): VisibleNode[] {
  camera.updateMatrixWorld();
  _matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_matrix);

  const byId = new Map<string, VisibleNode>();
  scene.traverse((obj) => {
    const mesh = obj as Mesh & { isMesh?: boolean };
    if (!mesh.isMesh || !mesh.visible) return;
    if (!mesh.geometry) return;
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    if (!_frustum.intersectsObject(mesh)) return;
    const id = sceneNodeIdOf(mesh);
    const entry = byId.get(id) ?? { id, meshes: 0, tris: 0 };
    entry.meshes++;
    entry.tris += triangleCount(mesh);
    byId.set(id, entry);
  });
  return [...byId.values()].sort((a, b) => b.tris - a.tris);
}

/** Dados do frame que a amostra precisa, já lidos pelo chamador. */
export interface SampleInput {
  timeMs: number;
  frameMs: number;
  cpu: Record<string, number>;
  draws: number;
  tris: number;
  camera: Camera;
  visible: VisibleNode[];
}

/** Monta a amostra (função pura — é o que os testes exercitam). */
export function buildSample(input: SampleInput): PerfSample {
  const position = input.camera.position;
  input.camera.getWorldDirection(_direction);
  const cpu: Record<string, number> = {};
  for (const [name, ms] of Object.entries(input.cpu)) cpu[name] = round(ms, MS_DECIMALS);
  return {
    t: Math.round(input.timeMs),
    fps: input.frameMs > 0 ? round(1000 / input.frameMs, MS_DECIMALS) : 0,
    frameMs: round(input.frameMs, MS_DECIMALS),
    cpu,
    draws: input.draws,
    tris: input.tris,
    cam: {
      x: round(position.x, POS_DECIMALS),
      y: round(position.y, POS_DECIMALS),
      z: round(position.z, POS_DECIMALS),
      dx: round(_direction.x, 2),
      dy: round(_direction.y, 2),
      dz: round(_direction.z, 2),
    },
    visible: input.visible,
  };
}

/**
 * Amostrador do trace. O {@link Game} chama {@link tick} a cada frame; ele só
 * faz trabalho quando (a) o host registrou a ponte e (b) passou o intervalo.
 */
export class PerfTrace {
  private _sinceSampleMs = 0;
  private _elapsedMs = 0;
  private readonly _bridge: TraceBridge | undefined = bridge();

  /** `true` quando o host aceita trace (métricas ativas no export nativo). */
  get enabled(): boolean {
    return this._bridge !== undefined;
  }

  /**
   * Avança o relógio e, no intervalo, grava uma amostra.
   *
   * @param deltaMs - Duração do frame.
   * @param scene - Raiz da cena ativa.
   * @param camera - Câmera que renderizou o frame.
   * @param profiler - Fonte do tempo de CPU por seção.
   * @param info - `renderer.info.render` (draws/triângulos do frame).
   */
  tick(
    deltaMs: number,
    scene: Object3D,
    camera: Camera,
    profiler: FrameProfiler,
    info: { drawCalls?: number; triangles?: number } | null,
  ): void {
    if (!this._bridge) return;
    this._elapsedMs += deltaMs;
    this._sinceSampleMs += deltaMs;
    if (this._sinceSampleMs < SAMPLE_MS) return;
    this._sinceSampleMs = 0;

    const cpu: Record<string, number> = {};
    for (const section of profiler.summary()) cpu[section.name] = section.lastMs;
    const sample = buildSample({
      timeMs: this._elapsedMs,
      frameMs: deltaMs,
      cpu,
      draws: info?.drawCalls ?? 0,
      tris: info?.triangles ?? 0,
      camera,
      visible: collectVisible(scene, camera),
    });
    this._bridge(JSON.stringify(sample));
  }
}
