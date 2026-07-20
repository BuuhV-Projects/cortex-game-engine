/**
 * TDD da autoria de malhas de blockout (ProBuilder — SPEC-0071): editar params da
 * forma regenera a malha ao vivo + persiste a receita; a edição de elementos grava
 * override em `data.geometry` (vence a receita); reset volta à forma. Sem DOM:
 * opera sobre o Object3D (Mesh) + overlay.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, Object3D } from 'three';
import { createAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import { createMeshApi } from '../../src/editor/authoring/MeshAuthoring.js';
import { buildShape, boxMesh as boxMeshFor } from '../../src/probuilder/shapes.js';
import { toBufferGeometry } from '../../src/probuilder/EditableMesh.js';
import type { Game } from '../../src/core/Game.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

function setup(addedNodes: unknown[]) {
  const overlay = { version: 1, objects: {}, data: { added: addedNodes } } as unknown as SceneFileV1;
  const ctx = createAuthoringContext({} as unknown as Game, new Object3D(), overlay, () => {});
  const api = createMeshApi(ctx);
  return { overlay, api };
}

/** Cria o Mesh de um nó mesh como o buildScene faz (cortexMesh no userData). */
function meshObj(id: string, logical: { positions: [number, number, number][]; faces: number[][] }): Mesh {
  const { geometry, maps } = toBufferGeometry(logical);
  const m = new Mesh(geometry);
  m.name = id;
  (m.userData as Record<string, unknown>)['cortexMesh'] = { logical, maps };
  return m;
}

describe('MeshAuthoring', () => {
  it('get devolve a forma + params atuais do nó adicionado', () => {
    const node = { type: 'mesh', id: 'esc', shape: { kind: 'stairs', params: { steps: 4 } } };
    const { api } = setup([node]);
    const obj = meshObj('esc', buildShape('stairs', { steps: 4 }));
    const state = api.get(obj)!;
    expect(state.kind).toBe('stairs');
    expect(state.edited).toBe(false);
    expect(state.params.find((p) => p.key === 'steps')!.value).toBe(4);
  });

  it('get devolve null pra objeto que não é mesh', () => {
    const { api } = setup([]);
    expect(api.get(new Mesh())).toBeNull();
  });

  it('setParam atualiza a receita, regenera a malha e persiste', () => {
    const node: { type: string; id: string; shape: { kind: string; params: Record<string, number> } } = {
      type: 'mesh',
      id: 'esc',
      shape: { kind: 'stairs', params: { steps: 4 } },
    };
    const { api } = setup([node]);
    const obj = meshObj('esc', buildShape('stairs', { steps: 4 }));
    api.setParam(obj, 'steps', 7);
    expect(node.shape.params.steps).toBe(7);
    // regenerou: 7 degraus = 7 boxes = 42 faces lógicas
    const cm = (obj.userData as Record<string, unknown>)['cortexMesh'] as { logical: { faces: number[][] } };
    expect(cm.logical.faces.length).toBe(7 * 6);
  });

  it('setParam arredonda params inteiros (steps)', () => {
    const node = { type: 'mesh', id: 'e', shape: { kind: 'stairs', params: {} } };
    const { api } = setup([node]);
    const obj = meshObj('e', buildShape('stairs'));
    api.setParam(obj, 'steps', 5.8);
    expect((node.shape.params as Record<string, number>).steps).toBe(6);
  });

  it('applyGeometry grava override em data.geometry e get marca edited', () => {
    const node = { type: 'mesh', id: 'm', shape: { kind: 'cube' } };
    const { overlay, api } = setup([node]);
    const obj = meshObj('m', buildShape('cube'));
    const edited = boxMeshFor([0, 0, 0], [3, 3, 3]);
    api.applyGeometry(obj, edited);
    expect((overlay.data['geometry'] as Record<string, unknown>)['m']).toBeDefined();
    expect(api.get(obj)!.edited).toBe(true);
  });

  it('resetGeometry remove o override e regenera a partir da receita', () => {
    const node = { type: 'mesh', id: 'm', shape: { kind: 'cube', params: {} } };
    const { overlay, api } = setup([node]);
    const obj = meshObj('m', buildShape('cube'));
    api.applyGeometry(obj, boxMeshFor([0, 0, 0], [3, 3, 3]));
    api.resetGeometry(obj);
    expect((overlay.data['geometry'] as Record<string, unknown>)['m']).toBeUndefined();
    expect(api.get(obj)!.edited).toBe(false);
  });

  it('setParam descarta a edição de elementos (override some)', () => {
    const node = { type: 'mesh', id: 'm', shape: { kind: 'cube', params: {} } };
    const { overlay, api } = setup([node]);
    const obj = meshObj('m', buildShape('cube'));
    api.applyGeometry(obj, boxMeshFor([0, 0, 0], [3, 3, 3]));
    api.setParam(obj, 'width', 2);
    expect((overlay.data['geometry'] as Record<string, unknown>)['m']).toBeUndefined();
  });
});
