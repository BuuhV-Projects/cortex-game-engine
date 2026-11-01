/**
 * **Estrada na cena** (ADR-0630, SPEC-0631): do nó `road` (+ overlay do editor) à malha
 * da pista e ao corte/aterro nos terrenos. Separado do `SceneBuilder` (que só cria a
 * malha vazia e chama {@link buildRoads} depois de todos os nós no lugar).
 *
 * Fluxo: {@link makeRoad} (malha vazia, guarda o nó efetivo) → {@link buildRoads} =
 * {@link applyRoad} em cada estrada (greide sobre a BASE dos terrenos) + {@link moldTerrainToRoads}.
 */
import {
  Box3,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import { debug } from '../core/debug.js';
import { sampleSpline, ROAD_DEFAULT_CURVE_DENSITY, type RoadSample, type RoadVec3 } from '../road/RoadSpline.js';
import { roadRibbon, ribbonToGeometry, ROAD_DEFAULT_TILE_METERS } from '../road/RoadMesh.js';
import {
  smoothGrade,
  moldHeightfield,
  mergeDeltas,
  ROAD_DEFAULT_MAX_SLOPE,
  ROAD_DEFAULT_SMOOTH_METERS,
  type GradePoint,
} from '../road/RoadGrade.js';
import { roadOverlaySchema, ROAD_DEFAULT_CLEARANCE, ROAD_DEFAULT_TALUDE, ROAD_DEFAULT_WIDTH, type RoadOverlay } from '../road/roadFields.js';
import { RoadCorridor } from '../road/RoadCorridor.js';
import { buildBridgeParts } from './RoadBridgeParts.js';
import { FLOATS_PER_INSTANCE, type Vegetation } from './Vegetation.js';
import { loadTexture } from './SceneAssets.js';
import type { SceneFileV1 } from './SceneFile.js';
import type { RoadNode } from './SceneDefinition.js';
import type { Terrain } from './Terrain.js';

/** A pista fica tanto acima do platô moldado (evita briga de profundidade). */
export const ROAD_LIFT = 0.05;
/** Cor da pista sem textura (asfalto). */
const ROAD_DEFAULT_COLOR = 0x4a4a4a;
const ROAD_TEXTURED_COLOR = 0xffffff;
const ROAD_ROUGHNESS = 0.95;
/** Nitidez da textura em ângulo rasante. */
const ROAD_ANISOTROPY = 8;
/** Folga (em células da grade) no teste de caixa estrada × terreno — cobre o acostamento. */
const SHOULDER_CELLS_REACH = 2;

/** Chave do nó efetivo (nó + overlay) em `userData` — o editor lê/escreve por ela. */
export const ROAD_NODE_KEY = 'cortexRoadNode';
/** Eixo (mundo, Y = greide) guardado pelo {@link applyRoad} pro corte. */
const ROAD_CENTERLINE_KEY = 'cortexRoadCenterline';

/**
 * Lê `data.road` do overlay: edições da estrada por id (SPEC-0631 §5). Entradas
 * inválidas são descartadas.
 */
export function overlayRoad(overlay: SceneFileV1 | null | undefined): Record<string, RoadOverlay> {
  const raw = overlay?.data?.['road'];
  const out: Record<string, RoadOverlay> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = roadOverlaySchema.safeParse(v);
    if (parsed.success) out[id] = parsed.data;
    else debug('road', 'overlay inválido ignorado:', id, parsed.error.message);
  }
  return out;
}

/** Nó efetivo: `{ ...nó, ...overlay }` — **o overlay vence** (SPEC-0631 §5). */
export function resolveRoadNode(node: RoadNode, ov?: RoadOverlay): RoadNode {
  return ov ? { ...node, ...ov } : node;
}

/** Cria a malha (ainda vazia) da estrada; a geometria sai no {@link buildRoads}. */
export function makeRoad(node: RoadNode): Mesh {
  const mesh = new Mesh();
  mesh.receiveShadow = node.receiveShadow ?? true;
  mesh.castShadow = node.castShadow ?? false;
  (mesh.userData as Record<string, unknown>)[ROAD_NODE_KEY] = node;
  return mesh;
}

/** O nó efetivo de uma estrada da cena, ou `null` se `obj` não é estrada. */
export function roadNodeOf(obj: Object3D): RoadNode | null {
  return ((obj.userData as Record<string, unknown>)[ROAD_NODE_KEY] as RoadNode | undefined) ?? null;
}

interface TerrainRef {
  obj: Object3D;
  terrain: Terrain;
  /** Caixa XZ no mundo. */
  box: Box3;
}

function collectTerrains(three: Object3D): TerrainRef[] {
  const out: TerrainRef[] = [];
  three.updateMatrixWorld(true);
  three.traverse((o) => {
    const terrain = (o.userData as Record<string, unknown>)['cortexTerrain'] as Terrain | undefined;
    if (!terrain) return;
    const box = new Box3();
    const c = new Vector3();
    for (const sx of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) box.expandByPoint(o.localToWorld(c.set(sx * terrain.width, 0, sz * terrain.depth)));
    }
    out.push({ obj: o, terrain, box });
  });
  return out;
}

const tmp = new Vector3();

/** Altura BASE (mundo) do primeiro terreno sob `(x, z)`, ou `null` fora de todos. */
function baseHeightAtWorld(terrains: readonly TerrainRef[], x: number, z: number): number | null {
  for (const t of terrains) {
    if (x < t.box.min.x || x > t.box.max.x || z < t.box.min.z || z > t.box.max.z) continue;
    t.obj.worldToLocal(tmp.set(x, 0, z));
    const y = t.terrain.baseHeightAt(tmp.x, tmp.z);
    if (y === null) continue;
    return t.obj.localToWorld(tmp.set(tmp.x, y, tmp.z)).y;
  }
  return null;
}

/** Por amostra: `true` se está num trecho `bridge` válido do nó (SPEC-0631 §3c). */
function bridgeMask(samples: readonly RoadSample[], node: RoadNode): boolean[] {
  const last = node.points.length - 1;
  const spans = (node.bridge ?? []).filter(([i0, i1]) => i0 < i1 && i1 <= last);
  return samples.map((s) => spans.some(([i0, i1]) => (s.t ?? 0) >= i0 && (s.t ?? 0) <= i1));
}

/** Greide de referência reto (por distância) entre as cabeceiras de cada vão. */
function flattenBridges(samples: readonly RoadSample[], refY: number[], onBridge: readonly boolean[]): void {
  for (let a = 0; a < samples.length; a++) {
    if (!onBridge[a]) continue;
    let b = a;
    while (b + 1 < samples.length && onBridge[b + 1]) b++;
    const dist = [0];
    for (let i = a + 1; i <= b; i++) {
      const p = samples[i]!.pos;
      const q = samples[i - 1]!.pos;
      dist.push(dist[dist.length - 1]! + Math.hypot(p[0] - q[0], p[2] - q[2]));
    }
    const total = dist[dist.length - 1]! || 1;
    const ya = refY[a]!;
    const yb = refY[b]!;
    for (let i = a; i <= b; i++) refY[i] = ya + (yb - ya) * (dist[i - a]! / total);
    a = b;
  }
}

function applySurface(mesh: Mesh, node: RoadNode): void {
  const textured = !!node.texture;
  const material = new MeshStandardMaterial({
    color: node.color ?? (textured ? ROAD_TEXTURED_COLOR : ROAD_DEFAULT_COLOR),
    roughness: ROAD_ROUGHNESS,
    metalness: 0,
  });
  if (node.texture) {
    const url = node.texture;
    void loadTexture(url, false)
      .then((t) => {
        // Clona: a textura do cache pode ser usada por outro material com outro wrap.
        const tex = t.clone();
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = ROAD_ANISOTROPY;
        tex.needsUpdate = true;
        material.map = tex;
        material.needsUpdate = true;
      })
      .catch((e: unknown) => debug('road', 'textura falhou:', url, e));
  }
  (mesh.material as MeshStandardMaterial | undefined)?.dispose?.();
  mesh.material = material;
}

/**
 * (Re)gera a pista de `mesh` a partir do nó: spline → greide (base do terreno ou Y dos
 * pontos, alisado e limitado) → fita + material. Guarda o eixo pro corte e liga/desliga
 * `userData.cortexRoad` (`drivable`). Não molda o terreno — chame
 * {@link moldTerrainToRoads} depois (ou {@link buildRoads}).
 *
 * A malha fica em coordenadas de mundo: o transform do objeto é zerado (SPEC-0631 §1).
 * A promessa resolve quando as peças da ponte (`bridgeParts`, §3d) estão no lugar; a pista
 * em si já está pronta no retorno.
 */
export function applyRoad(mesh: Mesh, node: RoadNode, three: Object3D, terrains = collectTerrains(three)): Promise<void> {
  const ud = mesh.userData as Record<string, unknown>;
  ud[ROAD_NODE_KEY] = node;
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);

  const samples = sampleSpline(node.points as RoadVec3[], node.steps ?? ROAD_DEFAULT_CURVE_DENSITY);
  const refY = samples.map((s) =>
    node.grade === 'points' ? s.pos[1] : (baseHeightAtWorld(terrains, s.pos[0], s.pos[2]) ?? s.pos[1]),
  );
  const onBridge = bridgeMask(samples, node);
  if (node.grade !== 'points') flattenBridges(samples, refY, onBridge);
  const grade = smoothGrade(samples, refY, {
    maxSlope: node.maxSlope ?? ROAD_DEFAULT_MAX_SLOPE,
    smoothMeters: node.smooth ?? ROAD_DEFAULT_SMOOTH_METERS,
  });
  const width = node.width ?? ROAD_DEFAULT_WIDTH;

  mesh.geometry?.dispose();
  mesh.geometry = ribbonToGeometry(roadRibbon(samples, width, node.tile ?? ROAD_DEFAULT_TILE_METERS, grade, ROAD_LIFT));
  applySurface(mesh, node);
  if (onBridge.includes(true)) (mesh.material as MeshStandardMaterial).side = DoubleSide; // vista de baixo

  const centerline = samples.map((s, i): GradePoint => ({ x: s.pos[0], z: s.pos[2], y: grade[i]!, bridge: onBridge[i]! }));
  ud[ROAD_CENTERLINE_KEY] = centerline;
  if (node.drivable === false) delete ud['cortexRoad'];
  else ud['cortexRoad'] = true;
  return buildBridgeParts(mesh, node.bridgeParts, centerline, node.width, (x, z) => baseHeightAtWorld(terrains, x, z));
}

/**
 * **Árvore não fica na pista** (SPEC-0631 §3b): esconde (sem apagar) toda instância de
 * nó `vegetation` a menos de `width/2 + clearance` do eixo de alguma estrada. Recalcula a
 * máscara inteira a cada chamada, então mover/apagar a estrada traz as árvores de volta.
 */
export function clearRoadVegetation(three: Object3D): void {
  const corridors: { c: RoadCorridor; box: Box3 }[] = [];
  const vegs: { obj: Object3D; veg: Vegetation }[] = [];
  three.traverse((o) => {
    const ud = o.userData as Record<string, unknown>;
    const veg = ud['cortexVegetation'] as Vegetation | undefined;
    if (veg) vegs.push({ obj: o, veg });
    const node = ud[ROAD_NODE_KEY] as RoadNode | undefined;
    const centerline = ud[ROAD_CENTERLINE_KEY] as GradePoint[] | undefined;
    if (!node || !centerline || centerline.length < 2) return;
    const radius = (node.width ?? ROAD_DEFAULT_WIDTH) / 2 + (node.clearance ?? ROAD_DEFAULT_CLEARANCE);
    const box = new Box3();
    for (const p of centerline) box.expandByPoint(tmp.set(p.x, 0, p.z));
    box.expandByScalar(radius);
    corridors.push({ c: new RoadCorridor(centerline, radius), box });
  });
  if (vegs.length === 0) return;
  const p = new Vector3();
  let hiddenTotal = 0;
  for (const { obj, veg } of vegs) {
    obj.updateMatrixWorld(true);
    const flat = veg.getInstances();
    const n = veg.count;
    let mask: Uint8Array | null = null;
    for (let i = 0; i < n && corridors.length > 0; i++) {
      obj.localToWorld(p.set(flat[i * FLOATS_PER_INSTANCE]!, 0, flat[i * FLOATS_PER_INSTANCE + 2]!));
      for (const { c, box } of corridors) {
        if (p.x < box.min.x || p.x > box.max.x || p.z < box.min.z || p.z > box.max.z) continue;
        if (!c.contains(p.x, p.z)) continue;
        mask ??= new Uint8Array(n);
        mask[i] = 1;
        hiddenTotal++;
        break;
      }
    }
    veg.setHidden(mask);
  }
  debug('road', `vegetação: ${hiddenTotal} instância(s) escondida(s) no corredor`);
}

/**
 * **Corte e aterro** (SPEC-0631 §3): para cada terreno, junta o delta de toda estrada cuja
 * caixa (± alcance) encosta nele e aplica com {@link Terrain.setRoadMolding} (não
 * destrutivo). Terreno sem estrada perto fica sem moldagem (idempotente). Também tira a
 * vegetação do corredor ({@link clearRoadVegetation}).
 */
export function moldTerrainToRoads(three: Object3D, terrains = collectTerrains(three)): void {
  const roads: { node: RoadNode; centerline: GradePoint[]; box: Box3; reach: number }[] = [];
  three.traverse((o) => {
    const ud = o.userData as Record<string, unknown>;
    const node = ud[ROAD_NODE_KEY] as RoadNode | undefined;
    const centerline = ud[ROAD_CENTERLINE_KEY] as GradePoint[] | undefined;
    if (!node || !centerline || centerline.length < 2) return;
    const box = new Box3();
    for (const p of centerline) box.expandByPoint(tmp.set(p.x, 0, p.z));
    roads.push({ node, centerline, box, reach: (node.width ?? ROAD_DEFAULT_WIDTH) / 2 + (node.talude ?? ROAD_DEFAULT_TALUDE) });
  });

  const v = new Vector3();
  for (const t of terrains) {
    const cell = Math.max(t.terrain.width, t.terrain.depth) / t.terrain.resolution;
    const deltas: Float32Array[] = [];
    let grid: { width: number; depth: number; resolution: number; base: number[] } | null = null;
    for (const r of roads) {
      const pad = r.reach + cell * SHOULDER_CELLS_REACH;
      if (r.box.min.x - pad > t.box.max.x || r.box.max.x + pad < t.box.min.x) continue;
      if (r.box.min.z - pad > t.box.max.z || r.box.max.z + pad < t.box.min.z) continue;
      grid ??= { width: t.terrain.width, depth: t.terrain.depth, resolution: t.terrain.resolution, base: t.terrain.getHeights() };
      const local = r.centerline.map((p): GradePoint => {
        t.obj.worldToLocal(v.set(p.x, p.y, p.z));
        return { x: v.x, z: v.z, y: v.y, bridge: p.bridge };
      });
      deltas.push(moldHeightfield(grid, local, (r.node.width ?? ROAD_DEFAULT_WIDTH) / 2, r.node.talude ?? ROAD_DEFAULT_TALUDE));
    }
    t.terrain.setRoadMolding(mergeDeltas(deltas));
  }
  clearRoadVegetation(three); // §3b: a mata sai do corredor junto com o corte
  debug('road', `moldagem: ${roads.length} estrada(s), ${terrains.length} terreno(s)`);
}

/** Gera todas as estradas da cena (com as peças das pontes) e molda os terrenos — o pós-passo do `buildScene`. */
export async function buildRoads(three: Object3D): Promise<void> {
  const terrains = collectTerrains(three);
  const meshes: Mesh[] = [];
  three.traverse((o) => {
    if ((o as Mesh).isMesh && roadNodeOf(o)) meshes.push(o as Mesh);
  });
  if (meshes.length === 0) return;
  const parts = meshes.map((m) => applyRoad(m, roadNodeOf(m)!, three, terrains));
  moldTerrainToRoads(three, terrains);
  await Promise.all(parts);
}
