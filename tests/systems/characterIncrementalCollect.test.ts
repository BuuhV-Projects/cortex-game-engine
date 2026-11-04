/**
 * Coleta do CharacterPhysicsSystem depois do setup (SPEC-0674): o que entra, sai, se move ou ganha
 * `cortexNoCollide` com a cena já varrida aparece na varredura seguinte; troncos novos empurram; a grade de
 * troncos dá o mesmo resultado que o laço linear sobre todos.
 */
import { describe, it, expect } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { CharacterPhysicsSystem, COLLECT_INTERVAL_MS } from '../../src/systems/CharacterPhysicsSystem.js';
import { Vegetation, makePlaceholderVegetation } from '../../src/scene/Vegetation.js';

const TICK = 16;
/** Ticks que garantem uma varredura nova (o intervalo inteiro). */
const ONE_COLLECT = Math.ceil(COLLECT_INTERVAL_MS / TICK) + 1;

/** Chão de 4×4 com topo em `top`, centrado em (x, z). */
function floor(x: number, z: number, top: number): Mesh {
  const m = new Mesh(new BoxGeometry(4, 1, 4), new MeshBasicMaterial());
  m.position.set(x, top - 0.5, z);
  return m;
}

function setup(scene: Object3D, x = 0, z = 0) {
  scene.updateMatrixWorld(true);
  const world = new World();
  const sys = new CharacterPhysicsSystem([scene]);
  world.addSystem(sys);
  const e = world.createEntity();
  const t = new TransformComponent(x, 3, z);
  const c = new CharacterBodyComponent({ groundY: -10, radius: 0.5 });
  e.addComponent(t);
  e.addComponent(c);
  const run = (ticks: number): void => {
    for (let i = 0; i < ticks; i++) {
      scene.updateMatrixWorld(true);
      world.tick(TICK);
    }
  };
  /** Solta o personagem de `y` e deixa cair até assentar. */
  const drop = (y = 3): number => {
    t.y = y;
    c.velocityY = 0;
    run(120);
    return t.y;
  };
  return { world, sys, t, c, run, drop };
}

describe('CharacterPhysicsSystem — coleta depois do setup (SPEC-0674)', () => {
  it('chão ADICIONADO depois da 1ª varredura vira chão na seguinte', () => {
    const scene = new Object3D();
    const { run, drop } = setup(scene);
    run(1); // 1ª varredura: cena vazia
    scene.add(floor(0, 0, 1));
    run(ONE_COLLECT);
    expect(drop()).toBeCloseTo(1, 1);
  });

  it('chão REMOVIDO depois do setup deixa de segurar', () => {
    const scene = new Object3D();
    const f = floor(0, 0, 1);
    scene.add(f);
    const { run, drop } = setup(scene);
    expect(drop()).toBeCloseTo(1, 1);
    scene.remove(f);
    run(ONE_COLLECT);
    expect(drop()).toBeCloseTo(-10, 1);
  });

  it('chão MOVIDO pra longe (outra célula) e de volta: o índice acompanha', () => {
    const scene = new Object3D();
    const f = floor(0, 0, 1);
    scene.add(f);
    const { run, drop } = setup(scene);
    expect(drop()).toBeCloseTo(1, 1);
    for (let i = 0; i < 3; i++) run(ONE_COLLECT); // parado: folga estática, sem rebuild do slot
    f.position.set(60, 0.5, 60); // 7 células adiante
    run(ONE_COLLECT);
    expect(drop()).toBeCloseTo(-10, 1);
    f.position.set(0, 1.5, 0); // volta mais alto (topo em 2)
    run(ONE_COLLECT);
    expect(drop(4)).toBeCloseTo(2, 1);
  });

  it('cortexNoCollide ligado num nó vivo tira a subárvore; desligado, ela volta', () => {
    const scene = new Object3D();
    const group = new Object3D();
    group.add(floor(0, 0, 1));
    scene.add(group);
    const { run, drop } = setup(scene);
    expect(drop()).toBeCloseTo(1, 1);
    group.userData['cortexNoCollide'] = true;
    run(ONE_COLLECT);
    expect(drop()).toBeCloseTo(-10, 1);
    delete group.userData['cortexNoCollide'];
    run(ONE_COLLECT);
    expect(drop()).toBeCloseTo(1, 1);
  });

  it('chão adicionado DENTRO de subárvore cortexNoCollide nunca colide', () => {
    const scene = new Object3D();
    const deco = new Object3D();
    deco.userData['cortexNoCollide'] = true;
    scene.add(deco);
    const { run, drop } = setup(scene);
    run(1);
    deco.add(floor(0, 0, 1));
    run(ONE_COLLECT);
    expect(drop()).toBeCloseTo(-10, 1);
  });

  it('cortexSolid ligado num ancestral vivo faz da malha uma parede', () => {
    const scene = new Object3D();
    const holder = new Object3D();
    const wall = new Mesh(new BoxGeometry(1, 4, 4), new MeshBasicMaterial());
    wall.position.set(1, 2, 0); // face em x = 0.5
    holder.add(wall);
    scene.add(holder, floor(0, 0, 0));
    const { t, run } = setup(scene, 0.3, 0); // raio 0.5: dentro da parede se ela for sólida
    run(ONE_COLLECT);
    expect(t.x).toBeCloseTo(0.3, 5); // ainda não é sólida
    holder.userData['cortexSolid'] = true;
    t.x = 0.3;
    run(ONE_COLLECT);
    expect(t.x).toBeLessThan(0.05); // empurrado pra fora da face
  });
});

describe('troncos (SPEC-0674)', () => {
  function forest(instances: number[]): { scene: Object3D; veg: Vegetation } {
    const veg = new Vegetation(makePlaceholderVegetation('tree'), 1000);
    veg.setInstances(instances);
    veg.group.userData['cortexVegetation'] = veg;
    veg.group.userData['cortexSolid'] = true;
    const scene = new Object3D();
    scene.add(veg.group);
    return { scene, veg };
  }

  it('Vegetation.version sobe a cada mudança das instâncias', () => {
    const { veg } = forest([0, 0, 0, 0, 1]);
    const v0 = veg.version;
    veg.add(5, 0, 5, 0, 1);
    expect(veg.version).toBeGreaterThan(v0);
    const v1 = veg.version;
    veg.removeNear(100, 100, 1); // nada removido: não muda
    expect(veg.version).toBe(v1);
  });

  it('árvore ADICIONADA depois do setup empurra na varredura seguinte', () => {
    const { scene, veg } = forest([50, 0, 50, 0, 1]);
    const { t, run } = setup(scene, 0.1, 0);
    run(ONE_COLLECT);
    expect(t.x).toBeCloseTo(0.1, 5); // nenhuma árvore perto
    veg.add(0, 0, 0, 0, 1);
    run(ONE_COLLECT);
    expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(0.4 + 0.5 - 1e-6); // fora do tronco
  });

  it('a grade dá o mesmo empurrão que o laço linear sobre todos (aglomerado denso)', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const inst: number[] = [];
    for (let i = 0; i < 400; i++) inst.push(rnd() * 40 - 20, 0, rnd() * 40 - 20, 0, 0.5 + rnd() * 3);
    for (let i = 0; i < 40; i++) inst.push(rnd() * 2, 0, rnd() * 2, 0, 1 + rnd()); // aglomerado: força o laço linear
    const { scene } = forest(inst);
    const { t, run } = setup(scene);
    run(1);
    const radius = 0.5;
    for (let k = 0; k < 300; k++) {
      const x = k < 40 ? rnd() * 2 : rnd() * 40 - 20;
      const z = k < 40 ? rnd() * 2 : rnd() * 40 - 20;
      // referência: o laço linear de antes, sobre todas as instâncias
      let ex = x;
      let ez = z;
      for (let i = 0; i < inst.length; i += 5) {
        const dx = ex - inst[i]!;
        const dz = ez - inst[i + 2]!;
        const minD = 0.4 * inst[i + 4]! + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const f = (minD - d) / d;
          ex += dx * f;
          ez += dz * f;
        }
      }
      t.x = x;
      t.z = z;
      run(1);
      expect(t.x).toBe(ex);
      expect(t.z).toBe(ez);
    }
  });
});
