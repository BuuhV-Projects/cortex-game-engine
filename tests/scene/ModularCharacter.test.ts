/**
 * Testes do composeModularCharacter (src/scene/ModularCharacter.ts): rebind das peças
 * nos ossos do rig POR NOME (subconjunto, ordem preservada), erro se faltar osso, e
 * descarte do mesh próprio do rig. Usa three.js puro (grafo/esqueleto rodam headless).
 */
import { describe, it, expect } from 'vitest';
import { Group, Bone, Skeleton, SkinnedMesh, BufferGeometry, MeshBasicMaterial } from 'three';
import { composeModularCharacter } from '../../src/scene/ModularCharacter.js';

/** Rig sintético: Hips → Spine → Head (esqueleto, sem animações). */
function makeRig(): { scene: Group; animations: never[] } {
  const hips = new Bone();
  hips.name = 'Hips';
  const spine = new Bone();
  spine.name = 'Spine';
  hips.add(spine);
  const head = new Bone();
  head.name = 'Head';
  spine.add(head);
  const scene = new Group();
  scene.add(hips);
  return { scene, animations: [] };
}

/** Peça sintética: 1 SkinnedMesh bindado num esqueleto com os ossos `boneNames`. */
function makePart(boneNames: string[]): { scene: Group; animations: never[] } {
  const bones = boneNames.map((name) => {
    const b = new Bone();
    b.name = name;
    return b;
  });
  const root = new Group();
  for (const b of bones) root.add(b);
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
  mesh.name = 'partMesh';
  mesh.bind(new Skeleton(bones));
  root.add(mesh);
  return { scene: root, animations: [] };
}

describe('composeModularCharacter', () => {
  it('rebinda os ossos da peça pros ossos do rig por NOME (ordem da peça preservada)', () => {
    const rig = makeRig();
    const part = makePart(['Head', 'Spine']); // subconjunto, ordem diferente do rig
    const { object } = composeModularCharacter(rig, [part]);

    const rigBones = new Map<string, Bone>();
    object.traverse((n) => {
      if ((n as Bone).isBone) rigBones.set(n.name, n as Bone);
    });
    const mesh = object.getObjectByName('partMesh') as SkinnedMesh;
    expect(mesh).toBeTruthy();
    expect(mesh.skeleton.bones.map((b) => b.name)).toEqual(['Head', 'Spine']);
    expect(mesh.skeleton.bones[0]).toBe(rigBones.get('Head'));
    expect(mesh.skeleton.bones[1]).toBe(rigBones.get('Spine'));
    expect(mesh.frustumCulled).toBe(false);
  });

  it('lança erro nomeando o osso da peça que não existe no rig', () => {
    const rig = makeRig();
    const part = makePart(['Head', 'Tail']); // "Tail" não existe no rig
    expect(() => composeModularCharacter(rig, [part])).toThrow(/Tail/);
  });

  it('descarta o mesh próprio do rig (fica só esqueleto + animações)', () => {
    const rig = makeRig();
    const rigBody = new SkinnedMesh(new BufferGeometry(), new MeshBasicMaterial());
    rigBody.name = 'rigBody';
    rigBody.bind(new Skeleton([]));
    rig.scene.add(rigBody);

    const { object } = composeModularCharacter(rig, [makePart(['Head'])]);
    expect(object.getObjectByName('rigBody')).toBeFalsy();
    expect(object.getObjectByName('partMesh')).toBeTruthy();
  });
});
