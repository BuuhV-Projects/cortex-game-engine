/**
 * SPEC-0302: filtro "só o que está perto" dos raycasts de colisão e o cache da
 * varredura da cena no CharacterPhysicsSystem.
 */
import { describe, it, expect, vi } from 'vitest';
import { Box3, BoxGeometry, Ray, Raycaster, type Intersection, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Vector3 } from 'three';
import { GRID_CELL, MOVING_MARGIN, NearMeshIndex, firstHit, worldBox, worldSphere, STATIC_MARGIN, touchingBox, traverseCollidable } from '../../src/physics/nearMeshes.js';
import { ensureBoundsTree } from '../../src/physics/raycastAccel.js';
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
    const edge = box(MOVING_MARGIN + 0.5, 0, 0); // a malha (lado 2) fica a 4,5 m: só a folga alcança
    const idx = index([near, far, tall, edge]);
    expect(idx.nearXZ(0, 0, 0, [])).toEqual([near, tall, edge]);
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

  it('visit devolvendo false não desce nos filhos (SPEC-0320)', () => {
    const root = new Object3D();
    const group = new Object3D();
    const child = box(0, 0, 0);
    group.add(child);
    root.add(group);
    const seen: Object3D[] = [];
    traverseCollidable(root, (o) => {
      seen.push(o);
      return o === group ? false : undefined;
    });
    expect(seen).toEqual([root, group]);
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

describe('SPEC-0323: folga só pra quem se mexe; caixa antes dos raios de parede', () => {
  it('caixa em mundo corta a malha comprida que a esfera deixaria passar', () => {
    const road = new Mesh(new BoxGeometry(200, 0.2, 4), new MeshBasicMaterial()); // rua: 200 × 4 m
    road.updateMatrixWorld(true);
    const idx = new NearMeshIndex();
    idx.rebuild([road]);
    idx.rebuild([road]); // parada: folga estática
    expect(idx.nearXZ(50, 0, 0, [])).toEqual([road]); // em cima da rua
    expect(idx.nearXZ(0, 30, 0, [])).toEqual([]); // 28 m ao lado: dentro da esfera (raio 100), fora da caixa
    expect(idx.alongRay(new Ray(new Vector3(-100, 0, 30), new Vector3(1, 0, 0)), 0, 200, [], [])).toEqual([]); // paralelo à rua, 28 m ao lado
  });

  // malha de parede com BVH (indirect, como no engine): plano XY de 4×4 m em z = 0
  const wall = (x: number, z: number, yaw = 0): Mesh => {
    const m = new Mesh(new PlaneGeometry(4, 4, 24, 24), new MeshBasicMaterial({ side: DoubleSide }));
    m.position.set(x, 2, z);
    m.rotation.y = yaw;
    m.updateMatrixWorld(true);
    ensureBoundsTree(m);
    return m;
  };

  it('parada desde a varredura anterior usa STATIC_MARGIN; quem andou, MOVING_MARGIN', () => {
    const still = box(STATIC_MARGIN + 3, 0, 0); // esfera 1,73: alcança só com a folga grande
    const mover = box(0, 0, STATIC_MARGIN + 3);
    const idx = new NearMeshIndex();
    idx.rebuild([still, mover]); // 1ª vez: tudo é "novo" → folga grande
    expect(idx.nearXZ(0, 0, 0, [])).toEqual([still, mover]);
    mover.position.x += 1;
    mover.updateMatrixWorld(true);
    idx.rebuild([still, mover]);
    expect(idx.nearXZ(0, 0, 0, [])).toEqual([mover]); // a parada encolheu; a que andou não
    expect(idx.nearXZ(STATIC_MARGIN + 3, 0, 0, [])).toContain(still); // perto continua achando
  });

  it('touchingBox: tira a malha com BVH que não toca a caixa, mantém a que toca e a sem árvore', () => {
    expect(STATIC_MARGIN).toBeLessThan(MOVING_MARGIN);
    const far = wall(0, 3);
    const close = wall(0, 0.3, Math.PI / 2 - 0.2); // girada: testa a inversa da matrixWorld
    const plain = box(0, 0, 50); // sem árvore (pequena e compacta)
    expect((far.geometry as { boundsTree?: unknown }).boundsTree).toBeTruthy();
    const b = new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 2, 0.5));
    expect(touchingBox([far, close, plain], b, [])).toEqual([close, plain]);
  });

  it('CharacterPhysics: parede com BVH empurra igual; longe dela não mexe', () => {
    const scene = new Object3D();
    scene.add(box(0, -20, 0, 40)); // chão com topo em y = 0
    const w = wall(0, 0.3); // face em z = 0,3
    w.userData['cortexSolid'] = true;
    scene.add(w);
    scene.updateMatrixWorld(true);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const near = world.createEntity();
    const tn = new TransformComponent(0, 0, 0);
    near.addComponent(tn);
    near.addComponent(new CharacterBodyComponent({ radius: 0.4, footOffset: 0 }));
    world.tick(16);
    expect(tn.z).toBeCloseTo(0.3 - 0.4, 3); // saiu da parede: raio inteiro de distância
    tn.z = -3; // longe da parede: nada empurra
    world.tick(16);
    expect(tn.z).toBe(-3);
  });
});

describe('SPEC-0323: caixa guardada só vale pra malha parada', () => {
  it('giro no lugar (esfera igual) recalcula a caixa', () => {
    const bar = new Mesh(new BoxGeometry(20, 1, 1), new MeshBasicMaterial()); // barra de 20 m em X
    bar.updateMatrixWorld(true);
    const idx = new NearMeshIndex();
    idx.rebuild([bar]);
    idx.rebuild([bar]); // parada: caixa guardada
    expect(idx.nearXZ(0, 8, 0, [])).toEqual([]); // 8 m em Z: fora da caixa da barra em X
    bar.rotation.y = Math.PI / 2; // gira no lugar: agora a barra corre em Z
    bar.updateMatrixWorld(true);
    idx.rebuild([bar]);
    expect(idx.nearXZ(0, 8, 0, [])).toEqual([bar]);
  });
});

describe('SPEC-0328: raio só contra o que ele cruza, mais perto primeiro', () => {
  const ray = (o: Vector3, d: Vector3, far = Infinity): Raycaster => {
    const r = new Raycaster(o, d.clone().normalize(), 0, far);
    (r as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    return r;
  };

  it('alongRay: só o que o segmento cruza, ordenado pela entrada na caixa', () => {
    const a = box(10, 0, 0);
    const b = box(4, 0, 0);
    const side = box(5, 0, 6); // ao lado do raio, dentro de uma esfera de 7 m da origem
    const behind = box(-5, 0, 0);
    const beyond = box(30, 0, 0);
    const idx = index([a, b, side, behind, beyond]);
    idx.rebuild([a, b, side, behind, beyond]); // paradas: folga estática
    const entry: number[] = [];
    const out = idx.alongRay(new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0)), 0, 15, [], entry);
    expect(out).toEqual([b, a]);
    expect(entry[0]).toBeCloseTo(3 - STATIC_MARGIN, 5);
    expect(entry[1]).toBeCloseTo(9 - STATIC_MARGIN, 5);
  });

  it('alongRay com direção 0 num eixo (raio vertical) e origem dentro da caixa', () => {
    const floor = box(0, -1, 0);
    const roof = box(0, 50, 0);
    const aside = box(20, -1, 0);
    const idx = index([floor, roof, aside]);
    const entry: number[] = [];
    expect(idx.alongRay(new Ray(new Vector3(0, 1, 0), new Vector3(0, -1, 0)), 0, Infinity, [], entry)).toEqual([floor]);
    expect(idx.alongRay(new Ray(new Vector3(0, -1, 0), new Vector3(0, -1, 0)), 0, Infinity, [], entry)).toEqual([floor]);
    expect(entry[0]).toBe(0); // origem dentro: entra já em `near`
  });

  /** Cena aleatória: firstHit tem que dar o mesmo ponto que intersectObjects + 1º acerto. */
  it('firstHit = 1º acerto do intersectObjects (cena aleatória, com e sem BVH)', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const meshes: Mesh[] = [];
    for (let i = 0; i < 60; i++) {
      const m = i % 3 === 0
        ? new Mesh(new PlaneGeometry(3, 3, 24, 24), new MeshBasicMaterial({ side: DoubleSide })) // com árvore
        : new Mesh(new BoxGeometry(0.5 + rnd() * 2, 0.5 + rnd() * 2, 0.5 + rnd() * 2), new MeshBasicMaterial());
      m.position.set(rnd() * 20 - 10, rnd() * 6 - 3, rnd() * 20 - 10);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.updateMatrixWorld(true);
      ensureBoundsTree(m);
      meshes.push(m);
    }
    const idx = index(meshes);
    const plain = new Raycaster();
    let hits = 0;
    for (let k = 0; k < 200; k++) {
      const o = new Vector3(rnd() * 24 - 12, rnd() * 8 - 4, rnd() * 24 - 12);
      const d = new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const far = 2 + rnd() * 20;
      plain.set(o, d);
      plain.far = far;
      const ref = plain.intersectObjects(meshes, false)[0];
      const got = firstHit(ray(o, d, far), idx);
      expect(got === null).toBe(ref === undefined);
      if (ref) {
        hits++;
        // a árvore em `raycastFirst` chega no mesmo triângulo por outra conta: igual até ~1e-15
        expect(got!.distance).toBeCloseTo(ref.distance, 9);
        expect(got!.point.distanceTo(ref.point)).toBeLessThan(1e-9);
      }
    }
    expect(hits).toBeGreaterThan(20); // o teste exercitou acertos de verdade
  });

  it('firstHit para na 1ª malha: não testa a que entra depois do acerto', () => {
    const wall = box(3, 0, 0);
    const later = box(10, 0, 0);
    const spy = vi.spyOn(later, 'raycast');
    const h = firstHit(ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 20), index([later, wall]));
    expect(h?.object).toBe(wall);
    expect(h?.distance).toBeCloseTo(2);
    expect(spy).not.toHaveBeenCalled();
  });

  it('firstHit respeita layers e o filtro de acerto (o próprio personagem)', () => {
    const shadowOnly = box(3, 0, 0);
    shadowOnly.layers.set(29); // malha só de sombra (ADR-0280): fora do raycast
    const self = box(5, 0, 0);
    const wall = box(8, 0, 0);
    const idx = index([shadowOnly, self, wall]);
    const h = firstHit(ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 20), idx, (o) => o === self);
    expect(h?.object).toBe(wall);
    const all: Intersection[] = new Raycaster(new Vector3(), new Vector3(1, 0, 0), 0, 20).intersectObjects([shadowOnly, self, wall], false);
    expect([...new Set(all.map((x) => x.object))]).toEqual([self, wall]); // a referência também pula a layer 29
  });
});

describe('SPEC-0328: grade XZ do índice', () => {
  /** Referência por força bruta: caixa e esfera em mundo com a folga, como o índice descreve. */
  const brute = (meshes: Mesh[], x: number, z: number, reach: number, margin: number): Mesh[] =>
    meshes.filter((m) => {
      const b = worldBox(m)!.clone().expandByScalar(margin);
      const sp = worldSphere(m)!;
      if (b.min.x > x + reach || b.max.x < x - reach || b.min.z > z + reach || b.max.z < z - reach) return false;
      const r = sp.radius + margin + reach;
      return (sp.center.x - x) ** 2 + (sp.center.z - z) ** 2 <= r * r;
    });

  it('nearXZ pela grade = varredura linear (malhas pequenas, largas e que mudam de célula)', () => {
    let seed = 11;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const meshes: Mesh[] = [];
    for (let i = 0; i < 150; i++) {
      const wide = i % 25 === 0; // rua/célula fundida: cobre muitas células
      const m = box(rnd() * 200 - 100, 0, rnd() * 200 - 100, wide ? GRID_CELL * 6 : 0.5 + rnd() * 3);
      meshes.push(m);
    }
    const idx = new NearMeshIndex();
    idx.rebuild(meshes);
    idx.rebuild(meshes); // paradas: folga estática
    for (let k = 0; k < 300; k++) {
      const x = rnd() * 220 - 110, z = rnd() * 220 - 110, reach = rnd() * 3;
      expect(idx.nearXZ(x, z, reach, [])).toEqual(brute(meshes, x, z, reach, STATIC_MARGIN));
    }
    // uma muda de célula: some da antiga, aparece na nova (com a folga de quem andou)
    const mover = meshes[1]!;
    const from = mover.position.clone();
    mover.position.x += GRID_CELL * 5;
    mover.updateMatrixWorld(true);
    idx.rebuild(meshes);
    expect(idx.nearXZ(from.x, from.z, 0, [])).not.toContain(mover);
    expect(idx.nearXZ(mover.position.x, mover.position.z, 0, [])).toContain(mover);
  });

  it('raio longo (muitas células) cai na varredura inteira e acha igual', () => {
    const far = box(300, 0, 0);
    const idx = index([box(0, 0, 50), far]);
    const h = firstHit(new Raycaster(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 0, Infinity), idx);
    expect(h?.object).toBe(far);
  });
});

describe('SPEC-0328: rebuild reaproveita só quem não mudou', () => {
  it('parada reaproveita; geometria que cresceu no lugar (mesma Sphere) é recalculada', () => {
    const m = box(0, 0, 0, 1);
    const idx = new NearMeshIndex();
    idx.rebuild([m]);
    idx.rebuild([m]); // parada: folga estática
    expect(idx.nearXZ(3, 0, 0, [])).toEqual([]);
    m.geometry.scale(8, 1, 1); // agora vai de x = -4 a 4
    m.geometry.computeBoundingSphere(); // three reaproveita o MESMO objeto Sphere
    m.geometry.computeBoundingBox();
    idx.rebuild([m]);
    expect(idx.nearXZ(3, 0, 0, [])).toEqual([m]);
  });
});

describe('SPEC-0328: malha que o raio cruza ganha árvore', () => {
  it('firstHit monta a BVH da malha cruzada (ônibus) e acerta igual', () => {
    const bus = new Mesh(new BoxGeometry(12, 3, 2.5, 6, 3, 3), new MeshBasicMaterial()); // ~200 tris, compacta
    bus.position.set(10, 0, 0); // de x = 4 a 16
    bus.updateMatrixWorld(true);
    ensureBoundsTree(bus); // varredura: recusa (abaixo de MIN_BVH_TRIS)
    expect((bus.geometry as { boundsTree?: unknown }).boundsTree).toBeUndefined();
    const r = new Raycaster(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 0, 20);
    const ref = r.intersectObject(bus, false)[0]!;
    const h = firstHit(r, index([bus]));
    expect((bus.geometry as { boundsTree?: unknown }).boundsTree).toBeDefined();
    expect(h!.distance).toBeCloseTo(ref.distance, 9);
  });
});

describe('SPEC-0328: touchingBox descarta InstancedMesh pelas esferas das instâncias', () => {
  it('fica só a instanciada com alguma instância tocando a caixa', () => {
    const make = (...xs: number[]): InstancedMesh => {
      const inst = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), xs.length);
      xs.forEach((x, i) => inst.setMatrixAt(i, new Matrix4().makeTranslation(x, 1, 0)));
      inst.updateMatrixWorld(true);
      return inst;
    };
    const far = make(30, -40, 80); // lixeiras espalhadas, nenhuma perto
    const near = make(50, 0.9); // uma encostada (esfera 0,87 da caixa em x = 0,9)
    const b = new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 2, 0.5));
    expect(touchingBox([far, near], b, [])).toEqual([near]);
  });
});
