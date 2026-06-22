/**
 * Testes do nó `mesh` (blockout editável — ADR-0071) no buildScene: instanciação
 * a partir de receita `shape`, geometria explícita, e a precedência do override
 * do editor (`overlay.data.geometry[id]` vence). Cobre também `overlayGeometry`.
 */
import { describe, it, expect } from 'vitest';
import { Mesh } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene, overlayGeometry } from '../../src/scene/SceneBuilder.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';
import { boxMesh } from '../../src/probuilder/shapes.js';

function overlay(partial: Partial<SceneFileV1>): SceneFileV1 {
  return { version: 1, objects: {}, data: {}, ...partial };
}

function cortexMesh(obj: import('three').Object3D): { logical: { positions: number[][]; faces: number[][] } } {
  return (obj.userData as Record<string, unknown>)['cortexMesh'] as never;
}

describe('nó mesh', () => {
  it('instancia a partir de uma receita shape (escada)', async () => {
    const scene = new Scene();
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'mesh', id: 'esc', shape: { kind: 'stairs', params: { steps: 4 } } }],
    };
    const handle = await buildScene(scene, def);
    const obj = handle.byId.get('esc')!;
    expect(obj).toBeInstanceOf(Mesh);
    expect(cortexMesh(obj).logical.faces.length).toBe(4 * 6);
    expect((obj.userData as Record<string, unknown>)['cortexSceneNode']).toBe(true);
  });

  it('instancia a partir de geometria explícita (positions/faces)', async () => {
    const scene = new Scene();
    const box = boxMesh([-1, -1, -1], [1, 1, 1]);
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'mesh', id: 'm', positions: box.positions, faces: box.faces }],
    };
    const handle = await buildScene(scene, def);
    expect(cortexMesh(handle.byId.get('m')!).logical.positions).toHaveLength(8);
  });

  it('override do editor (data.geometry) vence a receita do nó', async () => {
    const scene = new Scene();
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'mesh', id: 'm', shape: { kind: 'cube' } }],
    };
    const edited = boxMesh([0, 0, 0], [2, 2, 2]);
    edited.positions[6] = [9, 9, 9]; // marca distintiva
    const handle = await buildScene(scene, def, { overlay: overlay({ data: { geometry: { m: edited } } }) });
    expect(cortexMesh(handle.byId.get('m')!).logical.positions[6]).toEqual([9, 9, 9]);
  });
});

describe('overlayGeometry', () => {
  it('lê entradas válidas e ignora as malformadas', () => {
    const ov = overlay({
      data: {
        geometry: {
          ok: { positions: [[0, 0, 0]], faces: [[0, 1, 2]] },
          bad1: { positions: [[0, 0, 0]] }, // sem faces
          bad2: 42,
        },
      },
    });
    expect(Object.keys(overlayGeometry(ov))).toEqual(['ok']);
  });

  it('retorna {} sem overlay', () => {
    expect(overlayGeometry(null)).toEqual({});
  });
});
