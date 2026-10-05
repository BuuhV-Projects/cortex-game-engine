/** SPEC-0305: raycast de InstancedMesh com esferas em cache dá os mesmos acertos que o do three. */
import { describe, it, expect } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { threeInstancedRaycast } from '../../src/physics/raycastAccel.js';
import { rayMayHitSphere } from '../../src/physics/instancedRaycast.js';

const INSTANCES = 60;
const SPREAD = 80;
const RAYS = 3000;

/** Gerador determinístico (LCG) pros testes. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function scatter(): { mesh: InstancedMesh; parent: Group } {
  const r = rng(44);
  const mesh = new InstancedMesh(new BoxGeometry(2, 3, 1).translate(0, 1.5, 0), new MeshBasicMaterial(), INSTANCES);
  const m = new Matrix4();
  for (let i = 0; i < INSTANCES; i++) {
    m.makeRotationY(r() * Math.PI * 2).scale(new Vector3(1 + r(), 1, 1 + r())).setPosition((r() - 0.5) * SPREAD, 0, (r() - 0.5) * SPREAD);
    mesh.setMatrixAt(i, m);
  }
  const parent = new Group();
  parent.position.set(30, 0, -20);
  parent.add(mesh);
  parent.updateMatrixWorld(true);
  return { mesh, parent };
}

/** Acertos de RAYS raios (de chão e de parede, com e sem alcance), como texto comparável. */
function shoot(mesh: InstancedMesh, raycast: InstancedMesh['raycast'], cx = 30, cz = -20): string[] {
  const r = rng(45);
  const ray = new Raycaster();
  const out: string[] = [];
  for (let k = 0; k < RAYS; k++) {
    const o = new Vector3(cx + (r() - 0.5) * SPREAD, r() * 4, cz + (r() - 0.5) * SPREAD);
    const down = k % 3 === 0;
    const d = down ? new Vector3(0, -1, 0) : new Vector3(r() - 0.5, 0, r() - 0.5).normalize();
    ray.set(down ? o.setY(10) : o, d);
    ray.far = down ? Infinity : 0.5 + r() * 10;
    const hits: Parameters<InstancedMesh['raycast']>[1] = [];
    raycast.call(mesh, ray, hits);
    out.push(hits.map((h) => `${h.instanceId}:${h.distance.toFixed(6)}`).join(','));
  }
  return out;
}

describe('raycast de InstancedMesh com esferas em cache (SPEC-0305)', () => {
  it('é o raycast instalado e devolve os mesmos acertos que o do three', () => {
    const { mesh } = scatter();
    expect(InstancedMesh.prototype.raycast).not.toBe(threeInstancedRaycast);
    const expected = shoot(mesh, threeInstancedRaycast);
    expect(expected.filter(Boolean).length).toBeGreaterThan(RAYS / 20); // o teste precisa acertar bastante
    expect(shoot(mesh, mesh.raycast)).toEqual(expected);
  });

  it('refaz o cache quando instâncias mudam (porta que abre)', () => {
    const { mesh } = scatter();
    shoot(mesh, mesh.raycast); // monta o cache
    for (let i = 0; i < INSTANCES; i += 2) mesh.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
    mesh.instanceMatrix.needsUpdate = true;
    expect(shoot(mesh, mesh.raycast)).toEqual(shoot(mesh, threeInstancedRaycast));
  });

  it('refaz o cache quando a malha (ou o pai) se move', () => {
    const { mesh, parent } = scatter();
    shoot(mesh, mesh.raycast); // monta o cache no lugar antigo
    parent.position.set(-50, 0, 70);
    parent.updateMatrixWorld(true);
    expect(shoot(mesh, mesh.raycast, -50, 70)).toEqual(shoot(mesh, threeInstancedRaycast, -50, 70));
  });

  it('descarte pela esfera é conservador', () => {
    const o = { x: 0, y: 0, z: 0 };
    const d = { x: 1, y: 0, z: 0 };
    expect(rayMayHitSphere(o, d, 10, 5, 0.9, 0, 1)).toBe(true); // passa por dentro
    expect(rayMayHitSphere(o, d, 10, 5, 1.1, 0, 1)).toBe(false); // passa ao lado
    expect(rayMayHitSphere(o, d, 10, -3, 0, 0, 1)).toBe(false); // atrás
    expect(rayMayHitSphere(o, d, 10, 0.5, 0, 0, 1)).toBe(true); // origem dentro
    expect(rayMayHitSphere(o, d, 3, 4, 0, 0, 1)).toBe(true); // borda no alcance
    expect(rayMayHitSphere(o, d, 2.9, 4, 0, 0, 1)).toBe(false); // além do alcance
  });
});
