import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { createShorelineMask } from '../../src/scene/WaterShoreline.js';

function sample(mask: ReturnType<typeof createShorelineMask>, x: number, z: number): number {
  const image = mask.texture.image as { width: number; height: number; data: Uint8Array };
  const column = Math.floor((x - mask.bounds.x) / mask.bounds.z * image.width);
  const row = Math.floor((z - mask.bounds.y) / mask.bounds.w * image.height);
  if (column < 0 || column >= image.width || row < 0 || row >= image.height) return 0;
  return image.data[(row * image.width + column) * 4] / 255;
}

describe('WaterShoreline', () => {
  it('limita a espuma ao contorno real e mantém mar aberto e interior sem máscara', () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(4, 4, 4)));
    const mask = createShorelineMask(root, 0, .8);
    expect(sample(mask, 2, 0)).toBeGreaterThan(.8);
    expect(sample(mask, 2.4, 0)).toBeGreaterThan(.2);
    expect(sample(mask, 3, 0)).toBe(0);
    expect(sample(mask, 0, 0)).toBe(0);
    expect(sample(mask, 200, 200)).toBe(0);
    mask.texture.dispose();
  });

  it('ignora objetos submersos, suspensos, escondidos e a própria água', () => {
    const root = new Group();
    for (const height of [-3, 3]) {
      const mesh = new Mesh(new BoxGeometry(4, 2, 4));
      mesh.position.y = height;
      root.add(mesh);
    }
    const hidden = new Group();
    hidden.visible = false;
    hidden.add(new Mesh(new BoxGeometry(4, 4, 4)));
    root.add(hidden);
    const water = new Mesh(new BoxGeometry(4, 4, 4));
    water.userData.cortexWater = true;
    root.add(water);
    const mask = createShorelineMask(root, 0, .8);
    expect(mask.texture.image.width).toBe(1);
    expect(sample(mask, 0, 0)).toBe(0);
    mask.texture.dispose();
  });

  it('respeita hierarquia, escala e nível da água', () => {
    const root = new Group();
    const island = new Group();
    island.position.set(10, 5, 3);
    island.scale.setScalar(2);
    island.rotation.y = Math.PI / 2;
    island.add(new Mesh(new BoxGeometry(2, 2, 2)));
    root.add(island);
    const mask = createShorelineMask(root, 5, .8);
    expect(sample(mask, 12, 3)).toBeGreaterThan(.8);
    expect(sample(mask, 10, 3)).toBe(0);
    mask.texture.dispose();
  });

  it('considera transformações das instâncias', () => {
    const root = new Group();
    const mesh = new InstancedMesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial(), 2);
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(20, 0, 0));
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(30, -5, 0));
    root.add(mesh);
    const mask = createShorelineMask(root, 0, .8);
    expect(sample(mask, 21, 0)).toBeGreaterThan(.8);
    expect(sample(mask, 31, 0)).toBe(0);
    mask.texture.dispose();
  });

  it('limita o maior lado da textura mesmo em margens extensas', () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(400, 4, 4)));
    const mask = createShorelineMask(root, 0, .8);
    expect(mask.texture.image.width).toBe(1024);
    expect(mask.texture.image.height).toBeLessThanOrEqual(1024);
    mask.texture.dispose();
  });
});
