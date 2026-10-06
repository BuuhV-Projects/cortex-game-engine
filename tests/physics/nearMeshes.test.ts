/**
 * SPEC-0302: filtro "só o que está perto" dos raycasts de colisão e o cache da
 * varredura da cena no CharacterPhysicsSystem.
 */
import { describe, it, expect, vi } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { MOVING_MARGIN, NearMeshIndex, traverseCollidable } from '../../src/physics/nearMeshes.js';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { COLLECT_INTERVAL_MS, CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';

const box = (x: number, y: number, z: number, size = 2): Mesh => {
  const m = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  m.position.set(x, y, z);
  m.updateMatrixWorld(true);
  return m;
};

const index = (meshes: Mesh[] | InstancedMesh[]): NearMeshIndex => {
  const i = new NearMeshIndex();
  i.rebuild(meshes);
  return i;
};

describe('NearMeshIndex (SPEC-0302)', () => {
  it('pega só as malhas cuja esfera (com a folga de movimento) alcança o ponto', () => {
    const near = box(1, 0, 0);
    const far = box(500, 0, 0);
    const tall = box(0, 300, 0); // longe em Y, mas em cima no plano: conta pro raio vertical
    const edge = box(MOVING_MARGIN + 1.5, 0, 0); // fora da esfera (raio 1,73), dentro da folga
    const idx = index([near, far, tall, edge]);
    expect(idx.nearXZ(0, 0, 0, [])).toEqual([near, tall, edge]);
    expect(idx.near(new Vector3(0, 0, 0), 1, [])).toEqual([near, edge]);
  });

  it('InstancedMesh usa a esfera das instâncias (a mesma do raycast do three)', () => {
    const inst = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
    inst.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, 0));
    inst.setMatrixAt(1, new Matrix4().makeTranslation(200, 0, 0));
    inst.computeBoundingSphere();
    inst.updateMatrixWorld(true);
    expect(index([inst]).nearXZ(200, 0, 0, [])).toEqual([inst]);
    expect(index([inst]).nearXZ(-400, 0, 0, [])).toEqual([]);
  });
});

describe('CharacterPhysicsSystem: varredura em cache (SPEC-0302)', () => {
  const setup = () => {
    const scene = new Object3D();
    scene.add(box(0, -1, 0, 2)); // chão com topo em y = 0
    scene.updateMatrixWorld(true);
    const sys = new CharacterPhysicsSystem([scene]);
    const world = new World();
    world.addSystem(sys);
    const e = world.createEntity();
    const t = new TransformComponent(0, 0, 0); // já em pé no chão
    const c = new CharacterBodyComponent({ footOffset: 0 });
    e.addComponent(t);
    e.addComponent(c);
    return { scene, sys, world, t, c };
  };

  it('chão perto funciona igual; malha longe não muda nada', () => {
    const { scene, world, t, c } = setup();
    scene.add(box(800, 5, 800, 4)); // longe: fora do filtro
    scene.updateMatrixWorld(true);
    for (let i = 0; i < 20; i++) world.tick(16);
    expect(c.grounded).toBe(true);
    expect(t.y).toBeCloseTo(0);
  });

  it('plataforma nova vira chão depois do intervalo; refresh() força na hora', () => {
    const { scene, sys, world, t } = setup();
    world.tick(16); // 1ª varredura
    // degrau novo, 0,3 m acima do chão, debaixo do personagem
    const step = box(0, -0.7, 0, 2);
    scene.add(step);
    scene.updateMatrixWorld(true);
    world.tick(16);
    expect(t.y).toBeCloseTo(0); // ainda não varreu de novo
    for (let ms = 0; ms <= COLLECT_INTERVAL_MS; ms += 16) world.tick(16);
    expect(t.y).toBeCloseTo(0.3); // varreu: subiu no degrau
    // refresh: o próximo quadro já varre
    const higher = box(0, -0.5, 0, 2);
    scene.add(higher);
    scene.updateMatrixWorld(true);
    sys.refresh();
    world.tick(16);
    expect(t.y).toBeCloseTo(0.5);
  });
});

describe('SPEC-0307: sem gizmo do editor, sem escondido, faixa vertical', () => {
  it('traverseCollidable poda o gizmo inteiro e marca a subárvore escondida', () => {
    const root = new Object3D();
    const gizmo = new Object3D();
    gizmo.userData['editorInternal'] = true; // flag só na raiz (como o TransformControls)
    const handle = box(0, 0, 0);
    gizmo.add(handle);
    const hiddenGroup = new Object3D();
    hiddenGroup.visible = false;
    const culled = box(0, 0, 0);
    hiddenGroup.add(culled);
    const proxy = box(0, 0, 0); // collider invisível declarado
    proxy.visible = false;
    proxy.userData['cortexSolid'] = true;
    root.add(gizmo, hiddenGroup, proxy);
    const seen = new Map<Object3D, boolean>();
    traverseCollidable(root, (o, hidden) => seen.set(o, hidden));
    expect(seen.has(handle)).toBe(false);
    expect(seen.get(culled)).toBe(true);
    expect(seen.get(proxy)).toBe(false);
  });

  it('nearXZ com maxY/minY descarta a esfera toda fora da faixa', () => {
    const ground = box(0, -1, 0);
    const roof = box(0, 50, 0);
    const idx = index([ground, roof]);
    expect(idx.nearXZ(0, 0, 0, [], -Infinity, 1)).toEqual([ground]);
    expect(idx.nearXZ(0, 0, 0, [], 40, Infinity)).toEqual([roof]);
  });

  const stand = (scene: Object3D) => {
    scene.updateMatrixWorld(true);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 1, 0);
    const c = new CharacterBodyComponent({ footOffset: 0, groundY: -10 });
    e.addComponent(t);
    e.addComponent(c);
    for (let i = 0; i < 60; i++) world.tick(16);
    return t;
  };

  it('chão escondido não é chão; collider invisível (cortexSolid) é', () => {
    const scene = new Object3D();
    const holder = new Object3D();
    holder.visible = false;
    holder.add(box(0, -1, 0)); // topo em y = 0
    scene.add(holder);
    expect(stand(scene).y).toBeCloseTo(-10); // caiu até o piso de segurança
    holder.userData['cortexSolid'] = true;
    expect(stand(scene).y).toBeCloseTo(0);
  });

  it('peças do gizmo (sem o flag, filhas da raiz marcada) nem entram no raycast', () => {
    const scene = new Object3D();
    scene.add(box(0, -1, 0));
    const gizmo = new Object3D();
    gizmo.userData['editorInternal'] = true;
    const handle = box(0, 0.5, 0, 0.5);
    const spy = vi.spyOn(handle, 'raycast');
    gizmo.add(handle);
    scene.add(gizmo);
    expect(stand(scene).y).toBeCloseTo(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
