import { Mesh } from 'three';
import type { Object3D } from 'three';
import type { RoadApi, RoadEditState } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';
import { applyRoad } from '../../scene/SceneBuilder.js';
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
        | { surface?: unknown; width?: number }
        | undefined;
      if (!cr) return null; // não é uma estrada
      const surface = typeof cr.surface === 'string' ? cr.surface : 'custom';
      return { surface, width: cr.width ?? 8 };
    },

    setSurface(obj: Object3D, name: string): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.surface = name as RoadAddedNode['surface'];
      applyRoad(obj, node, ctx.three);
      ctx.persist();
    },

    setWidth(obj: Object3D, width: number): void {
      const node = nodeOf(obj);
      if (!node || !(obj instanceof Mesh)) return;
      node.width = Math.max(0.5, width);
      applyRoad(obj, node, ctx.three);
      ctx.persist();
    },
  };
}
