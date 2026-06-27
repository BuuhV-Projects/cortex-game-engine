import { Mesh } from 'three';
import type { Object3D } from 'three';
import type { RoadApi, RoadEditState } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';
import { applyRoad, moldTerrainToRoads } from '../../scene/SceneBuilder.js';
import type { SceneNode } from '../../scene/SceneDefinition.js';

/** Nó `road` como persistido em `overlay.data.added`. */
type RoadAddedNode = Extract<SceneNode, { type: 'road' }>;

/**
 * Autoria de **estradas** (ADR-0072): edita a superfície/largura de um nó `road`
 * criado no editor (vive em `overlay.data.added`) e **regenera a malha ao vivo**
 * ({@link applyRoad}) + persiste. A geometria/conformação são recalculadas a partir
 * dos `nodes` da spline (que o desenho/edição definem).
 */
export function createRoadApi(ctx: EditorAuthoringContext): RoadApi {
  const added = (): RoadAddedNode[] => {
    const a = ctx.overlay.data['added'];
    return Array.isArray(a) ? (a as RoadAddedNode[]) : [];
  };
  const nodeOf = (obj: Object3D): RoadAddedNode | undefined =>
    added().find((n) => n.type === 'road' && n.id === obj.name);

  return {
    get(obj: Object3D): RoadEditState | null {
      const cr = (obj.userData as Record<string, unknown>)['cortexRoad'] as
        | { surface?: unknown; width?: number; terrainMode?: string; taludeWidth?: number; maxSlope?: number; markings?: unknown }
        | undefined;
      if (!cr) return null; // não é uma estrada
      const surface = typeof cr.surface === 'string' ? cr.surface : 'custom';
      const terrainMode = cr.terrainMode === 'cutfill' ? 'cutfill' : 'conform';
      const markings = cr.markings == null ? 'none' : typeof cr.markings === 'string' ? cr.markings : 'custom';
      return { surface, width: cr.width ?? 8, terrainMode, taludeWidth: cr.taludeWidth ?? 6, maxSlope: cr.maxSlope ?? 0.25, markings };
    },

    setSurface(obj: Object3D, name: string): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.surface = name as RoadAddedNode['surface'];
      applyRoad(obj, node, ctx.three);
      ctx.persist();
    },

    setSurfaceTexture(obj: Object3D, surface: { diffuse: string; normal?: string }): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.surface = { diffuse: surface.diffuse, ...(surface.normal ? { normal: surface.normal } : {}) };
      applyRoad(obj, node, ctx.three);
      ctx.persist();
    },

    setWidth(obj: Object3D, width: number): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.width = Math.max(0.5, width);
      applyRoad(obj, node, ctx.three);
      moldTerrainToRoads(ctx.three); // largura muda a faixa moldada
      ctx.persist();
    },

    setTerrainMode(obj: Object3D, mode: 'conform' | 'cutfill'): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.terrainMode = mode;
      applyRoad(obj, node, ctx.three); // regenera a pista (greide ou conform)
      moldTerrainToRoads(ctx.three); // aplica/limpa o cut & fill no terreno
      ctx.persist();
    },

    setTalude(obj: Object3D, taludeWidth: number): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.taludeWidth = Math.max(0, taludeWidth);
      applyRoad(obj, node, ctx.three); // guarda o talude novo em cortexRoad
      moldTerrainToRoads(ctx.three);
      ctx.persist();
    },

    setMaxSlope(obj: Object3D, maxSlope: number): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.maxSlope = Math.max(0.005, maxSlope); // >0; maior = sobe mais o morro (corta menos)
      applyRoad(obj, node, ctx.three); // recalcula o greide
      moldTerrainToRoads(ctx.three); // remolda o terreno ao greide novo
      ctx.persist();
    },

    setMarkings(obj: Object3D, name: string): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      if (name === 'none') delete node.markings;
      else node.markings = name as RoadAddedNode['markings'];
      applyRoad(obj, node, ctx.three); // regenera o overlay de marcação
      ctx.persist();
    },
  };
}
