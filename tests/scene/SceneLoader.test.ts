/**
 * Testes de SceneFile (parser/zod) e SceneLoader.applyToRoot.
 * Lógica pura sobre Object3D real — sem WebGL nem fetch.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { parseSceneFile, emptySceneFile } from '../../src/scene/SceneFile.js';
import { SceneLoader } from '../../src/scene/SceneLoader.js';

describe('parseSceneFile', () => {
  it('aceita um SceneFileV1 válido (data opaco passa direto)', () => {
    const raw = {
      version: 1,
      objects: {
        Prop_A: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
      data: { spawn: { x: 1, y: 0, z: 2, rotationY: 1.5 }, qualquerCoisa: true },
    };
    const file = parseSceneFile(raw);
    expect(file).not.toBeNull();
    expect(file!.objects['Prop_A']!.position).toEqual([1, 2, 3]);
    expect((file!.data['spawn'] as { x: number }).x).toBe(1);
  });

  it('rejeita formato inválido (version errada, vec incompleto)', () => {
    expect(parseSceneFile({ version: 2, objects: {}, data: {} })).toBeNull();
    expect(
      parseSceneFile({
        version: 1,
        objects: { X: { position: [1, 2], rotation: [0, 0, 0], scale: [1, 1, 1] } },
        data: {},
      }),
    ).toBeNull();
    expect(parseSceneFile(null)).toBeNull();
    expect(parseSceneFile('nope')).toBeNull();
  });

  it('emptySceneFile é válido', () => {
    expect(parseSceneFile(emptySceneFile())).not.toBeNull();
  });
});

describe('SceneLoader.applyToRoot', () => {
  it('aplica transforms por nome e conta os afetados', () => {
    const root = new THREE.Group();
    const a = new THREE.Object3D();
    a.name = 'Prop_A';
    const b = new THREE.Object3D();
    b.name = 'SemEntrada';
    root.add(a, b);

    const file = parseSceneFile({
      version: 1,
      objects: {
        Prop_A: { position: [5, 6, 7], rotation: [0, 1, 0], scale: [2, 2, 2] },
      },
      data: {},
    })!;

    const { applied } = new SceneLoader().applyToRoot(root, file);

    expect(applied).toBe(1);
    expect(a.position.toArray()).toEqual([5, 6, 7]);
    expect(a.rotation.y).toBeCloseTo(1);
    expect(a.scale.toArray()).toEqual([2, 2, 2]);
    // Objeto sem entrada fica intacto.
    expect(b.position.toArray()).toEqual([0, 0, 0]);
  });
});
