/**
 * Testes dos helpers de posicionamento (src/scene/SceneAssets.ts).
 * Cobre: getWorldBounds (medição), placeOnGround (assenta base em y, centra em
 * x/z, aplica rotY/scale) e setShadows. Ver ADR-0039/0040.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, BoxGeometry, MeshStandardMaterial, Group } from 'three';
import { getWorldBounds, placeOnGround, setShadows } from '../../src/scene/SceneAssets.js';

function box(size = 2): Mesh {
  return new Mesh(new BoxGeometry(size, size, size), new MeshStandardMaterial());
}

describe('getWorldBounds', () => {
  it('mede o bounding box de um cubo na origem', () => {
    const b = getWorldBounds(box(2));
    expect(b.minX).toBeCloseTo(-1);
    expect(b.maxX).toBeCloseTo(1);
    expect(b.bottomY).toBeCloseTo(-1);
    expect(b.topY).toBeCloseTo(1);
    expect(b.size.x).toBeCloseTo(2);
    expect(b.center.y).toBeCloseTo(0);
  });
});

describe('placeOnGround', () => {
  it('assenta a base do objeto em y', () => {
    const b = placeOnGround(box(2), { y: 0 });
    expect(b.bottomY).toBeCloseTo(0);
    expect(b.topY).toBeCloseTo(2);
  });

  it('centra horizontalmente em (x, z)', () => {
    const b = placeOnGround(box(2), { x: 5, z: -3, y: 1 });
    expect(b.center.x).toBeCloseTo(5);
    expect(b.center.z).toBeCloseTo(-3);
    expect(b.bottomY).toBeCloseTo(1);
  });

  it('aplica escala antes de medir', () => {
    const b = placeOnGround(box(2), { y: 0, scale: 2 });
    expect(b.size.x).toBeCloseTo(4);
    expect(b.topY).toBeCloseTo(4); // base em 0, altura 4
  });

  it('funciona com pivô deslocado (assenta a geometria, não o pivô)', () => {
    // Grupo com o mesh deslocado +10 em Y dentro dele: o "pivô" (origem do grupo)
    // não bate com a geometria. placeOnGround deve assentar a GEOMETRIA em y=0.
    const group = new Group();
    const mesh = box(2);
    mesh.position.y = 10;
    group.add(mesh);
    const b = placeOnGround(group, { y: 0 });
    expect(b.bottomY).toBeCloseTo(0);
    expect(b.topY).toBeCloseTo(2);
  });
});

describe('setShadows', () => {
  it('liga/desliga sombras nos meshes do objeto', () => {
    const m = box(2);
    setShadows(m, { castShadow: false, receiveShadow: true });
    expect(m.castShadow).toBe(false);
    expect(m.receiveShadow).toBe(true);
    setShadows(m, { castShadow: true });
    expect(m.castShadow).toBe(true);
    expect(m.receiveShadow).toBe(true); // não alterado
  });
});
