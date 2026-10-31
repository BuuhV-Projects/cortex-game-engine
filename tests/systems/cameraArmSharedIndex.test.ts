/**
 * SPEC-0646: o braço da câmera consulta o índice de chão publicado pela física e só
 * indexa o resto — mesmo conjunto de alvos de antes (visível − jogador).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NearMeshIndex, publishScan } from '../../src/physics/nearMeshes.js';
import { splitRest } from '../../src/systems/CharacterPhysicsSystem.js';
import { CameraArmProbe, CAM_RADIUS } from '../../src/systems/thirdPersonCameraArm.js';

const box = (z: number): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2));
  m.position.set(0, 1.5, z);
  return m;
};
const TARGET = new THREE.Vector3(0, 1.5, 0);
const BACK = new THREE.Vector3(0, 0, 1);

/** Publica `ground` (indexado) + `rest` como o CharacterPhysicsSystem faz. */
function shared(scene: THREE.Scene, ground: THREE.Mesh[], rest: THREE.Mesh[]): CameraArmProbe {
  scene.updateMatrixWorld(true);
  const idx = new NearMeshIndex();
  idx.rebuild(ground);
  publishScan(scene, [...ground, ...rest], idx, rest);
  return new CameraArmProbe();
}

describe('splitRest (SPEC-0646)', () => {
  it('tira de visible o que é chão, mantendo a ordem', () => {
    const [a, b, c, d] = [box(1), box(2), box(3), box(4)];
    expect(splitRest([a, b, c, d], [a, c], [])).toEqual([b, d]);
    expect(splitRest([a, b], [], [])).toEqual([a, b]);
  });
});

describe('CameraArmProbe com o índice compartilhado (SPEC-0646)', () => {
  it('para na parede que só está no índice de chão', () => {
    const scene = new THREE.Scene();
    const wall = box(2);
    scene.add(wall);
    const probe = shared(scene, [wall], []);
    probe.collect(scene, undefined, 0);
    expect(probe.clearance(TARGET, BACK, 5, 0.75)).toBeCloseTo(1.9 - CAM_RADIUS, 2);
  });

  it('para no que está no resto (vegetação/água)', () => {
    const scene = new THREE.Scene();
    const bush = box(3);
    scene.add(bush);
    const probe = shared(scene, [], [bush]);
    probe.collect(scene, undefined, 0);
    expect(probe.clearance(TARGET, BACK, 5, 0.75)).toBeCloseTo(2.9 - CAM_RADIUS, 2);
  });

  it('ignora a malha do próprio jogador que está no índice de chão', () => {
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    const backpack = box(1);
    player.add(backpack);
    const wall = box(4);
    scene.add(player, wall);
    const probe = shared(scene, [backpack, wall], []);
    probe.collect(scene, player, 0);
    expect(probe.clearance(TARGET, BACK, 5, 0.75)).toBeCloseTo(3.9 - CAM_RADIUS, 2);
    // o raio único (ombro) também pula o próprio
    expect(probe.hit(TARGET, BACK, 5)).toBeCloseTo(3.9, 2);
  });

  it('o desvio enxerga a parede do índice de chão', () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.5));
    wall.position.set(0, 0, 0.6); // face em z = 0,35, colada atrás do alvo
    scene.add(wall);
    const probe = shared(scene, [wall], []);
    probe.collect(scene, undefined, 0);
    expect(probe.clearance(TARGET, BACK, 5, 0.75)).toBeLessThan(0.8);
    const off = probe.swing(TARGET, 0, 0, 0.8, 0.75);
    expect(off).not.toBeNull();
    expect(Math.abs(off!)).toBeGreaterThanOrEqual(Math.PI / 2 - 1e-9); // abaixo de 90° a parede bloqueia
  });
});
