import { Mesh } from 'three';
import type { Object3D } from 'three';
import type { MeshApi, MeshShapeState } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';
import { SHAPES, buildShape, type ShapeKind } from '../../probuilder/shapes.js';
import { toBufferGeometry, type EditableMesh } from '../../probuilder/EditableMesh.js';

/** Nó `mesh` como persistido em `overlay.data.added`. */
interface AddedMeshNode {
  type: 'mesh';
  id: string;
  shape?: { kind: ShapeKind; params?: Record<string, number> };
  positions?: [number, number, number][];
  faces?: number[][];
}

/**
 * Autoria das **malhas de blockout** (ProBuilder — SPEC-0071): edita a receita de
 * forma de um nó `mesh` (params → regenera ao vivo) e reseta a edição de elementos.
 *
 * - **Receita** vive no nó em `overlay.data.added` (criado pela paleta de Formas).
 * - **Override de geometria** (edição por vértice/face) vive em
 *   `overlay.data.geometry[nome]` e **vence** a receita (precedência do SPEC-0071).
 *
 * Também expõe `applyGeometry`/`rebuild` usados pela edição de elementos (Fase 2)
 * pra trocar a `BufferGeometry` ao vivo e manter `userData.cortexMesh` coerente.
 */
export function createMeshApi(ctx: EditorAuthoringContext): MeshApi & {
  /** Troca a geometria de render ao vivo SEM persistir (durante o drag). */
  rebuild(obj: Object3D, mesh: EditableMesh): void;
  /** Grava o override de geometria editada e regenera ao vivo (persiste). */
  applyGeometry(obj: Object3D, mesh: EditableMesh): void;
  /** Malha lógica atual do objeto (de `userData.cortexMesh`), ou `null`. */
  logicalOf(obj: Object3D): EditableMesh | null;
} {
  const added = (): AddedMeshNode[] => {
    const a = ctx.overlay.data['added'];
    return Array.isArray(a) ? (a as AddedMeshNode[]) : [];
  };
  const geom = (): Record<string, EditableMesh> => ctx.record<EditableMesh>('geometry');
  const nodeOf = (obj: Object3D): AddedMeshNode | undefined =>
    added().find((n) => n.type === 'mesh' && n.id === obj.name);

  /** Troca a geometria de render do mesh ao vivo + atualiza os mapas de picking. */
  function rebuild(obj: Object3D, logical: EditableMesh): void {
    if (!(obj instanceof Mesh)) return;
    const { geometry, maps } = toBufferGeometry(logical);
    obj.geometry.dispose();
    obj.geometry = geometry;
    (obj.userData as Record<string, unknown>)['cortexMesh'] = { logical, maps };
  }

  return {
    get(obj: Object3D): MeshShapeState | null {
      const cm = (obj.userData as Record<string, unknown>)['cortexMesh'];
      if (!cm) return null; // não é um nó mesh
      const edited = !!obj.name && obj.name in geom();
      const node = nodeOf(obj);
      const kind = node?.shape?.kind ?? null;
      if (!kind) return { kind: null, params: [], edited };
      const cur = node?.shape?.params ?? {};
      const params = SHAPES[kind].params.map((pd) => ({
        key: pd.key,
        label: pd.label,
        value: cur[pd.key] ?? pd.default,
        min: pd.min,
        max: pd.max,
        step: pd.step,
        int: pd.int,
      }));
      return { kind, params, edited };
    },

    setParam(obj: Object3D, key: string, value: number): void {
      const node = nodeOf(obj);
      if (!node?.shape) return;
      // Editar a forma descarta a edição de elementos (a receita volta a mandar).
      if (obj.name && obj.name in geom()) delete geom()[obj.name];
      const params = { ...(node.shape.params ?? {}) };
      const pd = SHAPES[node.shape.kind].params.find((p) => p.key === key);
      params[key] = pd?.int ? Math.round(value) : value;
      node.shape.params = params;
      rebuild(obj, buildShape(node.shape.kind, params));
      ctx.persist();
    },

    resetGeometry(obj: Object3D): void {
      if (!obj.name) return;
      delete geom()[obj.name];
      const node = nodeOf(obj);
      const logical = node?.shape
        ? buildShape(node.shape.kind, node.shape.params)
        : node?.positions && node.faces
          ? { positions: node.positions, faces: node.faces }
          : null;
      if (logical) rebuild(obj, logical);
      ctx.persist();
    },

    rebuild(obj: Object3D, mesh: EditableMesh): void {
      rebuild(obj, mesh);
    },

    applyGeometry(obj: Object3D, mesh: EditableMesh): void {
      if (!obj.name) return;
      geom()[obj.name] = mesh;
      rebuild(obj, mesh);
      ctx.persist();
    },

    logicalOf(obj: Object3D): EditableMesh | null {
      const cm = (obj.userData as Record<string, unknown>)['cortexMesh'] as { logical?: EditableMesh } | undefined;
      return cm?.logical ?? null;
    },
  };
}
