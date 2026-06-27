/**
 * Testes da autoria de **traçado** de estrada (ADR-0072): `createRoadEditApi` —
 * mover pontos de controle regenera a pista e remolda o terreno ao soltar. O
 * `RoadEditSystem` em si (handles + TransformControls) é DOM/Three e fica de fora.
 */
import { describe, it, expect, vi } from 'vitest';
import { Mesh } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { createRoadEditApi } from '../../src/editor/authoring/RoadAuthoring.js';
import type { EditorAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

async function setup() {
  const scene = new Scene();
  const road = { type: 'road' as const, id: 'r1', nodes: [[0, 0, 0], [0, 0, 10], [0, 0, 20]], terrainMode: 'cutfill' as const };
  const heights = new Array(81).fill(0);
  const overlay: SceneFileV1 = { version: 1, objects: {}, data: { added: [road], terrain: { chao: heights } } };
  const def: SceneDefinition = { version: 1, nodes: [{ type: 'terrain', id: 'chao', size: 20, resolution: 8 }] };
  const handle = await buildScene(scene, def, { overlay });
  const persist = vi.fn();
  const ctx = { three: scene.getThreeScene(), overlay, persist } as unknown as EditorAuthoringContext;
  const api = createRoadEditApi(ctx);
  const roadMesh = handle.byId.get('r1') as Mesh;
  return { api, roadMesh, overlay, persist };
}

describe('createRoadEditApi (edição de traçado)', () => {
  it('nodesOf devolve os pontos de controle (cópia)', async () => {
    const { api, roadMesh } = await setup();
    expect(api.nodesOf(roadMesh)).toEqual([[0, 0, 0], [0, 0, 10], [0, 0, 20]]);
    expect(api.nodesOf(new Mesh())).toBeNull(); // não é estrada
  });

  it('setNode move o ponto no overlay e regenera a pista', async () => {
    const { api, roadMesh, overlay } = await setup();
    api.setNode(roadMesh, 1, [6, 0, 10]);
    const nodes = (overlay.data['added'] as { nodes: number[][] }[])[0]!.nodes;
    expect(nodes[1]).toEqual([6, 0, 10]); // ponto movido no dado persistível
    expect(roadMesh.geometry.getAttribute('position').count).toBeGreaterThan(0); // pista regenerada
  });

  it('setNode ignora índice inexistente', async () => {
    const { api, roadMesh, overlay } = await setup();
    api.setNode(roadMesh, 9, [1, 1, 1]); // fora do range
    const nodes = (overlay.data['added'] as { nodes: number[][] }[])[0]!.nodes;
    expect(nodes).toHaveLength(3); // nada adicionado/alterado
  });

  it('commit persiste (remolda o terreno ao traçado novo)', async () => {
    const { api, roadMesh, persist } = await setup();
    api.commit(roadMesh);
    expect(persist).toHaveBeenCalled();
  });
});
