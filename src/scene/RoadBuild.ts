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
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Object3D,
} from 'three';
import { debug } from '../core/debug.js';
import { sampleSpline, ROAD_DEFAULT_CURVE_DENSITY, type RoadVec3 } from '../road/RoadSpline.js';
import { roadRibbon, ribbonToGeometry, ROAD_DEFAULT_TILE_METERS } from '../road/RoadMesh.js';
import {
  smoothGrade,
  moldHeightfield,
  mergeDeltas,
  ROAD_DEFAULT_MAX_SLOPE,
  ROAD_DEFAULT_SMOOTH_METERS,
  type GradePoint,
} from '../road/RoadGrade.js';
import { roadOverlaySchema, ROAD_DEFAULT_TALUDE, ROAD_DEFAULT_WIDTH, type RoadOverlay } from '../road/roadFields.js';
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
 */
export function applyRoad(mesh: Mesh, node: RoadNode, three: Object3D, terrains = collectTerrains(three)): void {
  const ud = mesh.userData as Record<string, unknown>;
  ud[ROAD_NODE_KEY] = node;
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);

  const samples = sampleSpline(node.points as RoadVec3[], node.steps ?? ROAD_DEFAULT_CURVE_DENSITY);
  const refY = samples.map((s) =>
    node.grade === 'points' ? s.pos[1] : (baseHeightAtWorld(terrains, s.pos[0], s.pos[2]) ?? s.pos[1]),
  );
  const grade = smoothGrade(samples, refY, {
    maxSlope: node.maxSlope ?? ROAD_DEFAULT_MAX_SLOPE,
    smoothMeters: node.smooth ?? ROAD_DEFAULT_SMOOTH_METERS,
  });
  const width = node.width ?? ROAD_DEFAULT_WIDTH;

  mesh.geometry?.dispose();
  mesh.geometry = ribbonToGeometry(roadRibbon(samples, width, node.tile ?? ROAD_DEFAULT_TILE_METERS, grade, ROAD_LIFT));
  applySurface(mesh, node);

  ud[ROAD_CENTERLINE_KEY] = samples.map((s, i) => ({ x: s.pos[0], z: s.pos[2], y: grade[i]! }));
  if (node.drivable === false) delete ud['cortexRoad'];
  else ud['cortexRoad'] = true;
}

/**
 * **Corte e aterro** (SPEC-0631 §3): para cada terreno, junta o delta de toda estrada cuja
 * caixa (± alcance) encosta nele e aplica com {@link Terrain.setRoadMolding} (não
 * destrutivo). Terreno sem estrada perto fica sem moldagem (idempotente).
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
      const local = r.centerline.map((p) => {
        t.obj.worldToLocal(v.set(p.x, p.y, p.z));
        return { x: v.x, z: v.z, y: v.y };
      });
      deltas.push(moldHeightfield(grid, local, (r.node.width ?? ROAD_DEFAULT_WIDTH) / 2, r.node.talude ?? ROAD_DEFAULT_TALUDE));
    }
    t.terrain.setRoadMolding(mergeDeltas(deltas));
  }
  debug('road', `moldagem: ${roads.length} estrada(s), ${terrains.length} terreno(s)`);
}

/** Gera todas as estradas da cena e molda os terrenos — o pós-passo do `buildScene`. */
export function buildRoads(three: Object3D): void {
  const terrains = collectTerrains(three);
  const meshes: Mesh[] = [];
  three.traverse((o) => {
    if ((o as Mesh).isMesh && roadNodeOf(o)) meshes.push(o as Mesh);
  });
  if (meshes.length === 0) return;
  for (const m of meshes) applyRoad(m, roadNodeOf(m)!, three, terrains);
  moldTerrainToRoads(three, terrains);
}
