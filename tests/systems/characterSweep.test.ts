/**
 * SPEC-0648: o passo horizontal de um quadro longo é varrido contra as paredes — o centro da
 * cápsula não passa da face de um `cortexSolid` (dentro dele o empurrão não vê a parede e o chão some).
 */
import { describe, it, expect } from 'vitest';
import { Object3D, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';

const R = 0.4;
/** Face do patamar voltada pro personagem: a caixa ocupa x de 2 a 12, topo 1,5 m acima da calçada. */
const FACE = 2;

function setup(): { world: World; t: TransformComponent } {
  const scene = new Object3D();
  const walk = new Mesh(new BoxGeometry(40, 1, 40), new MeshBasicMaterial());
  walk.position.y = -0.5;
  const plat = new Mesh(new BoxGeometry(10, 3, 40), new MeshBasicMaterial());
  plat.position.set(7, 0, 0); // y de -1,5 a 1,5: invisível, como o `plat-` do Port Hollow
  plat.visible = false;
  plat.userData['cortexSolid'] = true;
  scene.add(walk, plat);
  scene.updateMatrixWorld(true);
  const world = new World();
  world.addSystem(new CharacterPhysicsSystem([scene]));
  const e = world.createEntity();
  const t = new TransformComponent(1.4, 1, 0);
  e.addComponent(t);
  e.addComponent(new CharacterBodyComponent({ radius: R, height: 1.8, footOffset: 0 }));
  for (let i = 0; i < 10; i++) world.tick(16); // pousa e grava a posição resolvida
  return { world, t };
}

describe('SPEC-0648: varredura do passo contra parede', () => {
  it('passo de 0,7 m num quadro de 100 ms para antes da face e segue na calçada', () => {
    const { world, t } = setup();
    t.x += 0.7; // o centro passaria da face (x = 2) e ficaria dentro da caixa
    world.tick(100);
    expect(t.x).toBeLessThanOrEqual(FACE - R + 1e-6);
    expect(t.y).toBeCloseTo(0, 3);
  });

  it('desliza: o eixo livre anda inteiro', () => {
    const { world, t } = setup();
    t.x += 0.7;
    t.z = 0.5;
    world.tick(100);
    expect(t.x).toBeLessThanOrEqual(FACE - R + 1e-6);
    expect(t.z).toBeCloseTo(0.5, 6);
  });

  it('teletransporte (passo > 8 m) não é varrido', () => {
    const { world, t } = setup();
    t.x = -9;
    world.tick(16);
    expect(t.x).toBeCloseTo(-9, 6);
  });

  it('passo longo longe da parede anda inteiro', () => {
    const { world, t } = setup();
    t.x -= 2;
    world.tick(100);
    expect(t.x).toBeCloseTo(-0.6, 6);
  });
});
