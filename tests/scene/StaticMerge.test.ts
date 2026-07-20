/**
 * Merge da geometria estática (SPEC-0121): funde malhas paradas por material com
 * transform baked; preserva `cortexSolid`; NÃO toca subárvore dinâmica (script/
 * player/animada), skinned, vegetação, terreno, água nem invisível.
 */
import { describe, it, expect } from 'vitest';
import {
  Object3D,
  Mesh,
  SkinnedMesh,
  BoxGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { mergeStaticScene } from '../../src/scene/StaticMerge.js';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { Collider2DComponent } from '../../src/components/Collider2DComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { ScriptComponent } from '../../src/components/ScriptComponent.js';

function box(mat: MeshBasicMaterial | MeshStandardMaterial, x = 0): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), mat);
  m.position.x = x;
  return m;
}

function countMeshes(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as Mesh).isMesh) n++;
  });
  return n;
}

describe('mergeStaticScene', () => {
  it('funde malhas de mesmo material em 1 e preserva as posições (baked)', () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial({ color: 0x00ff00 });
    root.add(box(mat, 0), box(mat, 5), box(mat, -3));
    const stats = mergeStaticScene(root);
    expect(stats.merged).toBe(3);
    expect(stats.groups).toBe(1);
    expect(countMeshes(root)).toBe(1);
    const merged = root.children.find((c) => (c as Mesh).isMesh) as Mesh;
    merged.geometry.computeBoundingBox();
    const bb = merged.geometry.boundingBox!;
    expect(bb.min.x).toBeCloseTo(-3.5); // box em x=-3 (meia aresta 0.5)
    expect(bb.max.x).toBeCloseTo(5.5); // box em x=5
  });

  it('materiais diferentes viram grupos diferentes; grupo de 1 fica como está', () => {
    const root = new Object3D();
    const verde = new MeshBasicMaterial({ color: 0x00ff00 });
    const azul = new MeshBasicMaterial({ color: 0x0000ff });
    const unico = new MeshStandardMaterial({ color: 0xffffff });
    root.add(box(verde, 0), box(verde, 2), box(azul, 4), box(azul, 6), box(unico, 8));
    const stats = mergeStaticScene(root);
    expect(stats.groups).toBe(2); // verde + azul
    expect(stats.merged).toBe(4);
    expect(stats.kept).toBe(1); // o standard sozinho não vale o bake
    expect(countMeshes(root)).toBe(3); // 2 fundidas + 1 original
  });

  it('preserva cortexSolid no grupo (parede do Character sobrevive)', () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const a = box(mat, 0);
    const b = box(mat, 2);
    a.userData['cortexSolid'] = true;
    b.userData['cortexSolid'] = true;
    const c = box(mat, 4); // NÃO sólido — não pode cair no mesmo grupo
    root.add(a, b, c);
    mergeStaticScene(root);
    const merged = root.children.filter((o) => (o as Mesh).isMesh) as Mesh[];
    const solid = merged.find((m) => m.userData['cortexSolid'] === true);
    const plain = merged.find((m) => m.userData['cortexSolid'] !== true);
    expect(solid).toBeDefined();
    expect(plain).toBeDefined(); // o não-sólido ficou de fora do grupo sólido
  });

  it('NÃO funde: skinned, invisível, vegetação, terreno, água', () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const skinned = new SkinnedMesh(new BoxGeometry(1, 1, 1), mat);
    const invisible = box(mat, 1);
    invisible.visible = false;
    const veg = box(mat, 2);
    veg.userData['cortexVegetationSub'] = true;
    const terr = box(mat, 3);
    terr.userData['cortexTerrain'] = {};
    const water = box(mat, 4);
    water.userData['cortexWater'] = true;
    root.add(skinned, invisible, veg, terr, water);
    const stats = mergeStaticScene(root);
    expect(stats.merged).toBe(0);
    expect(stats.groups).toBe(0);
    expect(countMeshes(root)).toBe(5);
  });

  it('NÃO funde subárvores de entidades dinâmicas (script/character); estática com collider funde', () => {
    const root = new Object3D();
    const world = new World();
    const mat = new MeshBasicMaterial();

    const coin = box(mat, 0); // moeda: entidade com ScriptComponent (sem Object3DComponent)
    const coinE = world.createEntity();
    coinE.addComponent(new ScriptComponent(coin, [{ type: 'CoinScript' }]));

    const player = box(mat, 2); // character: dinâmico
    const pE = world.createEntity();
    pE.addComponent(new TransformComponent(2, 0, 0));
    pE.addComponent(new Object3DComponent(player));
    pE.addComponent(new CharacterBodyComponent());

    const plat1 = box(mat, 4); // plataformas estáticas (Transform+Object3D+Collider2D)
    const plat2 = box(mat, 6);
    for (const [obj, x] of [[plat1, 4], [plat2, 6]] as const) {
      const e = world.createEntity();
      e.addComponent(new TransformComponent(x, 0, 0));
      e.addComponent(new Object3DComponent(obj));
      e.addComponent(new Collider2DComponent(0.5, 0.5));
    }

    root.add(coin, player, plat1, plat2);
    const stats = mergeStaticScene(root, world);
    expect(stats.merged).toBe(2); // só as plataformas
    expect(stats.groups).toBe(1);
    // moeda e player continuam malhas próprias na cena
    expect(root.children).toContain(coin);
    expect(root.children).toContain(player);
  });

  it('não remove um pai fundível cujo filho não é fundível (filho não some da tela)', () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const parent = box(mat, 0);
    const dynamicChild = box(mat, 0);
    dynamicChild.position.set(0, 2, 0);
    dynamicChild.userData['cortexWater'] = true; // filho inelegível
    parent.add(dynamicChild);
    const sibling = box(mat, 5);
    root.add(parent, sibling);
    const stats = mergeStaticScene(root);
    // parent não pode sair (levaria o filho); sobra só sibling elegível → grupo de 1
    expect(stats.merged).toBe(0);
    expect(countMeshes(root)).toBe(3);
  });

  it('extraDynamicRoots preserva subárvores animadas (SceneAnimator)', () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const animated = box(mat, 0);
    const a = box(mat, 2);
    const b = box(mat, 4);
    root.add(animated, a, b);
    const stats = mergeStaticScene(root, undefined, [animated]);
    expect(stats.merged).toBe(2); // só a+b
    expect(root.children).toContain(animated);
  });

  it('raycast de chão enxerga a malha fundida na MESMA altura (física preservada)', () => {
    const root = new Object3D();
    const mat = new MeshBasicMaterial();
    const floorA = new Mesh(new BoxGeometry(10, 1, 10), mat);
    floorA.position.set(0, 1.5, 0); // topo em y=2
    const floorB = new Mesh(new BoxGeometry(10, 1, 10), mat);
    floorB.position.set(20, 1.5, 0);
    root.add(floorA, floorB);
    mergeStaticScene(root);
    const merged = root.children.find((c) => (c as Mesh).isMesh) as Mesh;
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox!.max.y).toBeCloseTo(2);
    expect(merged.getWorldPosition(new Vector3()).y).toBe(0); // baked: mesh na origem
  });
});
