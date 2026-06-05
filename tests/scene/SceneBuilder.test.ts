/**
 * Testes do SceneBuilder data-driven (src/scene/SceneBuilder.ts).
 * Cobre: instanciação de nós, skip de deletados, override de transform e nós
 * adicionados pela overlay; e os helpers overlayDeleted/overlayAdded. Ver ADR.
 */
import { describe, it, expect } from 'vitest';
import { Scene } from '../../src/core/Scene.js';
import { buildScene, overlayDeleted, overlayAdded } from '../../src/scene/SceneBuilder.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';
import type { SceneFileV1 } from '../../src/scene/SceneFile.js';

const def: SceneDefinition = {
  version: 1,
  nodes: [
    { type: 'primitive', id: 'a', shape: 'box', size: 1, place: { x: 0, y: 0 } },
    { type: 'primitive', id: 'b', shape: 'box', size: 1, place: { x: 5, y: 0 } },
  ],
};

function overlay(partial: Partial<SceneFileV1>): SceneFileV1 {
  return { version: 1, objects: {}, data: {}, ...partial };
}

describe('buildScene', () => {
  it('instancia os nós nomeados por id', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def);
    expect(handle.byId.size).toBe(2);
    expect(handle.byId.get('a')?.name).toBe('a');
    expect(handle.byId.get('b')?.name).toBe('b');
    // place: base em y=0, box de altura 1 → centro em y≈0.5
    expect(handle.byId.get('a')!.position.y).toBeCloseTo(0.5);
  });

  it('pula nós deletados na overlay (nunca instancia)', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def, { overlay: overlay({ data: { deleted: ['b'] } }) });
    expect(handle.byId.has('a')).toBe(true);
    expect(handle.byId.has('b')).toBe(false);
  });

  it('aplica override de transform da overlay (precedência sobre place)', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def, {
      overlay: overlay({
        objects: { a: { position: [10, 20, 30], rotation: [0, 0, 0], scale: [2, 2, 2] } },
      }),
    });
    const a = handle.byId.get('a')!;
    expect(a.position.x).toBeCloseTo(10);
    expect(a.position.y).toBeCloseTo(20);
    expect(a.scale.x).toBeCloseTo(2);
  });

  it('instancia nós adicionados pela overlay', async () => {
    const scene = new Scene();
    const handle = await buildScene(scene, def, {
      overlay: overlay({
        data: { added: [{ type: 'primitive', id: 'c', shape: 'box', size: 1, place: { x: 0, y: 0 } }] },
      }),
    });
    expect(handle.byId.has('c')).toBe(true);
  });
});

describe('overlay helpers', () => {
  it('overlayDeleted extrai os ids removidos', () => {
    expect(overlayDeleted(overlay({ data: { deleted: ['x', 'y'] } }))).toEqual(['x', 'y']);
    expect(overlayDeleted(null)).toEqual([]);
    expect(overlayDeleted(overlay({}))).toEqual([]);
  });

  it('overlayAdded valida e retorna os nós adicionados', () => {
    const ov = overlay({
      data: {
        added: [
          { type: 'primitive', id: 'c', shape: 'box' },
          { type: 'lixo', id: 'inválido' }, // descartado pela validação
        ],
      },
    });
    const added = overlayAdded(ov);
    expect(added).toHaveLength(1);
    expect(added[0]!.id).toBe('c');
  });
});
