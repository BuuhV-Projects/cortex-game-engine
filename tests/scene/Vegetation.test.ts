/**
 * Testes da vegetação instanciada (ADR-0077): espalhar/apagar instâncias, capacidade,
 * round-trip serializável e o modelo placeholder. O pincel do editor fica de fora.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshBasicMaterial, InstancedMesh, Group, Object3D } from 'three';
import { Vegetation, makePlaceholderVegetation, FLOATS_PER_INSTANCE } from '../../src/scene/Vegetation.js';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

function source(): Object3D {
  return new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
}

describe('Vegetation', () => {
  it('cria uma InstancedMesh por sub-malha; começa vazia', () => {
    const veg = new Vegetation(source());
    expect(veg.count).toBe(0);
    const inst = veg.group.children[0] as InstancedMesh;
    expect(inst).toBeInstanceOf(InstancedMesh);
    expect(inst.count).toBe(0);
  });

  it('setInstances espalha e atualiza a contagem da InstancedMesh', () => {
    const veg = new Vegetation(source());
    veg.setInstances([0, 0, 0, 0, 1, 10, 0, 5, Math.PI / 2, 2]);
    expect(veg.count).toBe(2);
    expect((veg.group.children[0] as InstancedMesh).count).toBe(2);
  });

  it('add acrescenta (respeita a capacidade)', () => {
    const veg = new Vegetation(source(), 2); // capacidade 2
    expect(veg.add(0, 0, 0, 0, 1)).toBe(true);
    expect(veg.add(1, 0, 1, 0, 1)).toBe(true);
    expect(veg.add(2, 0, 2, 0, 1)).toBe(false); // estourou
    expect(veg.count).toBe(2);
  });

  it('removeNear apaga as instâncias no raio (XZ)', () => {
    const veg = new Vegetation(source());
    veg.setInstances([0, 0, 0, 0, 1, 10, 0, 0, 0, 1, 0.5, 0, 0.5, 0, 1]); // 3 instâncias
    const removed = veg.removeNear(0, 0, 1); // pega (0,0) e (0.5,0.5), não (10,0)
    expect(removed).toBe(2);
    expect(veg.count).toBe(1);
    expect(veg.getInstances().slice(0, 3)).toEqual([10, 0, 0]); // sobrou a de longe
  });

  it('getInstances faz round-trip do formato plano', () => {
    const veg = new Vegetation(source());
    const flat = [1, 2, 3, 0.5, 1.5, 4, 5, 6, 1, 2];
    veg.setInstances(flat);
    expect(veg.getInstances()).toEqual(flat);
    expect(veg.getInstances().length / FLOATS_PER_INSTANCE).toBe(2);
  });

  it('placeholder tree = tronco + copa (2 sub-malhas)', () => {
    const tree = makePlaceholderVegetation('tree');
    expect(tree).toBeInstanceOf(Group);
    const veg = new Vegetation(tree);
    expect(veg.group.children).toHaveLength(2); // tronco + copa
  });

  it('placeholder grass não quebra', () => {
    const veg = new Vegetation(makePlaceholderVegetation('grass'));
    veg.add(0, 0, 0, 0, 1);
    expect(veg.count).toBe(1);
  });

  it('buildScene instancia o nó vegetation (placeholder) com as instâncias', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'vegetation', id: 'arvores', kind: 'tree', instances: [0, 0, 0, 0, 1, 5, 0, 5, 0, 1.5] }],
    };
    const handle = await buildScene(new Scene(), def);
    const group = handle.byId.get('arvores')!;
    const veg = (group.userData as Record<string, unknown>)['cortexVegetation'] as Vegetation;
    expect(veg).toBeInstanceOf(Vegetation);
    expect(veg.count).toBe(2);
  });
});
