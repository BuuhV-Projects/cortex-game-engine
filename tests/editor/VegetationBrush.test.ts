/**
 * Testes da autoria de **vegetação** (SPEC-0077, fase 2): o pincel espalha/apaga
 * instâncias e grava no nó (`data.added`). O wiring de ponteiro/raycast fica de fora.
 */
import { describe, it, expect, vi } from 'vitest';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { createVegetationAuthoring } from '../../src/editor/authoring/VegetationAuthoring.js';
import type { EditorAuthoringContext } from '../../src/editor/authoring/AuthoringContext.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

async function setup() {
  const scene = new Scene();
  const node = { type: 'vegetation' as const, id: 'veg1', kind: 'tree' as const, instances: [] as number[] };
  const overlay: SceneFileV1 = { version: 1, objects: {}, data: { added: [node] } };
  const def: SceneDefinition = { version: 1, nodes: [{ type: 'terrain', id: 'chao', size: 40, resolution: 8 }] };
  const handle = await buildScene(scene, def, { overlay });
  const persist = vi.fn();
  const ctx = { three: scene.getThreeScene(), overlay, persist } as unknown as EditorAuthoringContext;
  const auth = createVegetationAuthoring(ctx, {
    onPaintStart: () => {},
    onPaintStop: () => {},
    toast: () => {},
    groundAt: () => 0, // terreno plano em Y=0 pro teste
  });
  const obj = handle.byId.get('veg1')!;
  return { auth, obj, overlay, persist };
}

describe('createVegetationAuthoring (pincel de espalhar)', () => {
  it('startPaint liga a sessão; get reflete o estado', async () => {
    const { auth, obj } = await setup();
    expect(auth.api.get(obj)!.painting).toBe(false);
    auth.api.startPaint(obj);
    expect(auth.isPainting()).toBe(true);
    expect(auth.api.get(obj)!.painting).toBe(true);
  });

  it('scatterAt espalha instâncias (assenta no groundAt)', async () => {
    const { auth, obj } = await setup();
    auth.api.startPaint(obj);
    auth.api.setBrush(12, 6);
    auth.scatterAt(0, 0, false);
    const st = auth.api.get(obj)!;
    expect(st.count).toBeGreaterThan(0);
  });

  it('save grava as instâncias no nó (data.added) + persiste', async () => {
    const { auth, obj, overlay, persist } = await setup();
    auth.api.startPaint(obj);
    auth.api.setBrush(12, 6);
    auth.scatterAt(0, 0, false);
    auth.save();
    const node = (overlay.data['added'] as { instances: number[] }[])[0]!;
    expect(node.instances.length).toBeGreaterThan(0);
    expect(node.instances.length % 5).toBe(0); // [x,y,z,rotY,scale]
    expect(persist).toHaveBeenCalled();
  });

  it('scatterAt com erase apaga as instâncias no raio', async () => {
    const { auth, obj } = await setup();
    auth.api.startPaint(obj);
    auth.api.setBrush(12, 6);
    auth.scatterAt(0, 0, false);
    expect(auth.api.get(obj)!.count).toBeGreaterThan(0);
    auth.scatterAt(0, 0, true); // borracha cobre o disco inteiro
    expect(auth.api.get(obj)!.count).toBe(0);
  });

  it('get devolve null pra objeto que não é vegetação', async () => {
    const { auth } = await setup();
    const { Mesh } = await import('three');
    expect(auth.api.get(new Mesh())).toBeNull();
  });
});
