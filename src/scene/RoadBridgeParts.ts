/**
 * **Peças da ponte** (SPEC-0631 §3d, ADR-0649): pista, pilar e guarda-corpo distribuídos
 * ao longo de cada vão (`bridge`) da estrada, no greide que a engine calculou. As peças
 * são filhas da malha da estrada (que fica em coordenadas de mundo) e herdam o
 * `cortexRoad` dela: o guarda-corpo segura o carro, o pilar é obstáculo.
 */
import { Box3, Group, type Mesh, type Object3D } from 'three';
import { debug } from '../core/debug.js';
import type { GradePoint } from '../road/RoadGrade.js';
import type { RoadBridgeParts } from '../road/roadFields.js';
import { instance, loadGLB } from './SceneAssets.js';

/** Nome do grupo das peças, filho da malha da estrada. */
const PARTS_NAME = 'cortexRoadBridgeParts';
/** Chave do pedido em curso em `userData`: um pedido novo descarta o anterior. */
const TOKEN_KEY = 'cortexRoadBridgePartsToken';
const DEFAULT_PILLAR_EVERY = 2;
/** Junta com menos que isso entre a pista e o chão não ganha pilar (m). */
const MIN_PILLAR_HEIGHT = 0.5;
const DEFAULT_ROAD_WIDTH = 8;

/** Um ponto ao longo do vão: posição no greide, rumo (yaw) e rampa (pitch). */
interface SpanPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Trechos contínuos de pontos `bridge` do eixo (cada um é um vão). */
export function bridgeSpans(centerline: readonly GradePoint[]): GradePoint[][] {
  const spans: GradePoint[][] = [];
  let cur: GradePoint[] = [];
  for (const p of centerline) {
    if (p.bridge) cur.push(p);
    else if (cur.length) {
      if (cur.length >= 2) spans.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) spans.push(cur);
  return spans;
}

/** Amostrador por distância horizontal ao longo de um vão. */
function spanSampler(span: readonly GradePoint[]): { length: number; at(d: number): SpanPose } {
  const dist = [0];
  for (let i = 1; i < span.length; i++) dist.push(dist[i - 1]! + Math.hypot(span[i]!.x - span[i - 1]!.x, span[i]!.z - span[i - 1]!.z));
  const length = dist[dist.length - 1]!;
  return {
    length,
    at(d) {
      let i = 1;
      while (i < span.length - 1 && dist[i]! < d) i++;
      const a = span[i - 1]!;
      const b = span[i]!;
      const seg = dist[i]! - dist[i - 1]! || 1;
      const t = Math.min(1, Math.max(0, (d - dist[i - 1]!) / seg));
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
        pitch: Math.atan2(b.y - a.y, seg),
      };
    },
  };
}

/** Caixa do modelo no seu próprio espaço (comprimento = Z, altura = Y). */
function modelBox(model: Object3D): Box3 {
  model.updateMatrixWorld(true);
  return new Box3().setFromObject(model);
}

function place(model: Object3D, pose: SpanPose, offset: number, scale: [number, number, number]): Object3D {
  const o = model.clone();
  o.rotation.order = 'YXZ';
  o.rotation.set(-pose.pitch, pose.yaw, 0);
  o.position.set(pose.x + Math.cos(pose.yaw) * offset, pose.y, pose.z - Math.sin(pose.yaw) * offset);
  o.scale.set(...scale);
  return o;
}

async function load(url: string | undefined): Promise<Object3D | null> {
  if (!url) return null;
  try {
    return instance(await loadGLB(url), { castShadow: true, receiveShadow: true });
  } catch (e) {
    debug('road', 'peça da ponte falhou:', url, e);
    return null;
  }
}

/**
 * Monta (ou refaz) as peças da ponte de `mesh`. Sem `parts` ou sem vão, só remove as
 * antigas. `groundAt(x, z)` = altura do chão (mundo) sob o pilar, ou `null`.
 */
export async function buildBridgeParts(
  mesh: Mesh,
  parts: RoadBridgeParts | undefined,
  centerline: readonly GradePoint[],
  width: number | undefined,
  groundAt: (x: number, z: number) => number | null,
): Promise<void> {
  const ud = mesh.userData as Record<string, unknown>;
  const token = {};
  ud[TOKEN_KEY] = token;
  const spans = parts ? bridgeSpans(centerline) : [];
  const [deck, pillar, rail] = spans.length ? await Promise.all([load(parts!.deck), load(parts!.pillar), load(parts!.rail)]) : [null, null, null];
  if (ud[TOKEN_KEY] !== token) return; // outro pedido chegou enquanto os modelos carregavam
  mesh.getObjectByName(PARTS_NAME)?.removeFromParent();
  if (!spans.length || (!deck && !pillar && !rail)) return;

  const group = new Group();
  group.name = PARTS_NAME;
  const s = parts!.scale ?? 1;
  const every = Math.max(1, parts!.pillarEvery ?? DEFAULT_PILLAR_EVERY);
  const edge = (width ?? DEFAULT_ROAD_WIDTH) / 2;
  const lengthZ = (o: Object3D | null): number => (o ? modelBox(o).max.z - modelBox(o).min.z : 0);
  const deckLen = lengthZ(deck);
  const railLen = lengthZ(rail);
  const pillarBox = pillar ? modelBox(pillar) : null;

  for (const span of spans) {
    const { length, at } = spanSampler(span);
    const n = Math.max(1, Math.round(length / ((deckLen || length) * s)));
    const piece = length / n;
    if (deck && deckLen > 0) {
      for (let k = 0; k < n; k++) group.add(place(deck, at((k + 0.5) * piece), 0, [s, s, piece / deckLen]));
    }
    if (pillar && pillarBox) {
      const h = pillarBox.max.y - pillarBox.min.y;
      for (let k = every; k < n; k += every) {
        const pose = at(k * piece);
        const ground = groundAt(pose.x, pose.z);
        const drop = ground === null ? 0 : pose.y - ground;
        if (drop < MIN_PILLAR_HEIGHT || h <= 0) continue;
        group.add(place(pillar, { ...pose, pitch: 0 }, 0, [s, drop / h, s]));
      }
    }
    if (rail && railLen > 0) {
      const count = Math.max(1, Math.round(length / railLen));
      const step = length / count;
      for (let k = 0; k < count; k++) {
        const pose = at((k + 0.5) * step);
        const sz = step / railLen;
        group.add(place(rail, pose, edge, [1, 1, sz]), place(rail, pose, -edge, [1, 1, sz]));
      }
    }
  }
  mesh.add(group);
  debug('road', `ponte: ${group.children.length} peça(s) em ${spans.length} vão(s)`);
}
