import type { Mesh, Object3D } from 'three';
import type { EditorAuthoringContext } from './AuthoringContext.js';
import { applyRoad, moldTerrainToRoads, roadNodeOf } from '../../scene/RoadBuild.js';
import { ROAD_DEFAULT_MAX_SLOPE, ROAD_DEFAULT_SMOOTH_METERS } from '../../road/RoadGrade.js';
import { ROAD_DEFAULT_TILE_METERS } from '../../road/RoadMesh.js';
import { ROAD_DEFAULT_CLEARANCE, ROAD_DEFAULT_TALUDE, ROAD_DEFAULT_WIDTH, type RoadOverlay } from '../../road/roadFields.js';
import type { RoadVec3 } from '../../road/RoadSpline.js';

/** Mínimo de pontos de uma estrada (a curva precisa de 2). */
const MIN_ROAD_POINTS = 2;

/** Estado de uma estrada selecionada, como o Inspector mostra (SPEC-0631 §6). */
export interface RoadEditState {
  width: number;
  talude: number;
  /** Razão (0.25 = 25%); o Inspector mostra em %. */
  maxSlope: number;
  grade: 'terrain' | 'points';
  smooth: number;
  texture: string | null;
  tile: number;
  color: string | number | null;
  drivable: boolean;
  /** Faixa sem vegetação além da borda (m). */
  clearance: number;
  points: number;
  /** Vãos de ponte `[i0, i1]` por índice de ponto (SPEC-0631 §3c). */
  bridge: [number, number][];
}

/**
 * Autoria de **estradas** pelo Inspector (SPEC-0631 §5–6): cada mudança vai para o
 * overlay `data.road[id]` (o overlay vence o nó), refaz a pista e remolda os terrenos.
 */
export interface RoadApi {
  /** Estado da estrada, ou `null` se `obj` não é estrada. */
  get(obj: Object3D): RoadEditState | null;
  /** Aplica um conjunto de campos → regenera + remolda + persiste. */
  set(obj: Object3D, patch: RoadOverlay): void;
  /** Abre o seletor de textura (atribuído pelo attachEditor). */
  pickTexture?(obj: Object3D): void;
  /** Entra na edição do traçado (atribuído pelo attachEditor). */
  editPoints?(obj: Object3D): void;
}

/** O que o {@link RoadEditSystem} precisa: pontos, mover ao vivo e confirmar. */
export interface RoadEditApi {
  /** Pontos (mundo) da estrada, ou `null` se não é estrada. */
  pointsOf(obj: Object3D): RoadVec3[] | null;
  /** Move um ponto e refaz a pista ao vivo (sem remoldar o terreno). */
  setPoint(obj: Object3D, index: number, pos: RoadVec3): void;
  /** Remove um ponto (mantém o mínimo de 2). Devolve `false` se não pôde. */
  removePoint(obj: Object3D, index: number): boolean;
  /** Confirma: remolda o terreno e persiste o overlay. */
  commit(obj: Object3D): void;
}

/** Cria a {@link RoadApi} + a {@link RoadEditApi} sobre o overlay do editor. */
export function createRoadApi(ctx: EditorAuthoringContext): { roadApi: RoadApi; roadEditApi: RoadEditApi } {
  const store = (): Record<string, RoadOverlay> => ctx.record<RoadOverlay>('road');

  /** Grava o patch no overlay e refaz a pista; `mold` remolda o terreno + persiste. */
  const update = (obj: Object3D, patch: RoadOverlay, mold: boolean): void => {
    const node = roadNodeOf(obj);
    if (!node) return;
    const s = store();
    s[obj.name] = { ...s[obj.name], ...patch };
    void applyRoad(obj as Mesh, { ...node, ...patch }, ctx.three);
    if (!mold) return;
    moldTerrainToRoads(ctx.three);
    ctx.persist();
  };

  const roadApi: RoadApi = {
    get(obj) {
      const n = roadNodeOf(obj);
      if (!n) return null;
      return {
        width: n.width ?? ROAD_DEFAULT_WIDTH,
        talude: n.talude ?? ROAD_DEFAULT_TALUDE,
        maxSlope: n.maxSlope ?? ROAD_DEFAULT_MAX_SLOPE,
        grade: n.grade ?? 'terrain',
        smooth: n.smooth ?? ROAD_DEFAULT_SMOOTH_METERS,
        texture: n.texture || null,
        tile: n.tile ?? ROAD_DEFAULT_TILE_METERS,
        color: n.color ?? null,
        drivable: n.drivable !== false,
        clearance: n.clearance ?? ROAD_DEFAULT_CLEARANCE,
        points: n.points.length,
        bridge: n.bridge ?? [],
      };
    },
    set(obj, patch) {
      update(obj, patch, true);
    },
  };

  const roadEditApi: RoadEditApi = {
    pointsOf(obj) {
      const n = roadNodeOf(obj);
      return n ? n.points.map((p) => [p[0], p[1], p[2]] as RoadVec3) : null;
    },
    setPoint(obj, index, pos) {
      const n = roadNodeOf(obj);
      if (!n || !n.points[index]) return;
      const points = n.points.map((p, i) => (i === index ? pos : p));
      update(obj, { points }, false);
    },
    removePoint(obj, index) {
      const n = roadNodeOf(obj);
      if (!n || n.points.length <= MIN_ROAD_POINTS || !n.points[index]) return false;
      // Os vãos de ponte são por índice: os pontos depois do removido descem um.
      const shift = (i: number): number => (i > index ? i - 1 : i);
      const bridge = n.bridge?.map(([a, b]): [number, number] => [shift(a), shift(b)]).filter(([a, b]) => a < b);
      update(obj, { points: n.points.filter((_, i) => i !== index), ...(bridge ? { bridge } : {}) }, true);
      return true;
    },
    commit(obj) {
      if (!roadNodeOf(obj)) return;
      moldTerrainToRoads(ctx.three);
      ctx.persist();
    },
  };
  return { roadApi, roadEditApi };
}
