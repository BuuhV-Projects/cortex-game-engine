/**
 * SPEC-0718: com `teleported()`, a posição posta de fora vale inteira no próximo tick, sem a varredura do passo desde a
 * posição anterior (SPEC-0648), mesmo com parede entre os dois pontos e a menos de 8 m.
 */
import { describe, it, expect } from 'vitest';
import { Object3D, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';

const R = 0.4;
/** Parede fina em x = 2 (de 2 a 2,2), alta, com calçada dos dois lados. */
const FACE = 2;
const WALL_DEPTH = 0.2;
/** Ponto do outro lado da parede, a 3 m do de partida: menos que os 8 m do teletransporte da SPEC-0648. */
const BEYOND = 4.4;
const START = 1.4;
const FRAME_MS = 16;
const SETTLE_FRAMES = 10;
const HELD_FRAMES = 6;

function setup(): { world: World; t: TransformComponent; body: CharacterBodyComponent } {
  const scene = new Object3D();
  const walk = new Mesh(new BoxGeometry(40, 1, 40), new MeshBasicMaterial());
  walk.position.y = -0.5;
  const wall = new Mesh(new BoxGeometry(WALL_DEPTH, 4, 40), new MeshBasicMaterial());
  wall.position.set(FACE + WALL_DEPTH / 2, 2, 0);
  wall.userData['cortexSolid'] = true;
  scene.add(walk, wall);
  scene.updateMatrixWorld(true);
  const world = new World();
  world.addSystem(new CharacterPhysicsSystem([scene]));
  const e = world.createEntity();
  const t = new TransformComponent(START, 0, 0);
  const body = new CharacterBodyComponent({ radius: R, height: 1.8, footOffset: 0 });
  e.addComponent(t);
  e.addComponent(body);
  for (let i = 0; i < SETTLE_FRAMES; i++) world.tick(FRAME_MS); // pousa e grava a posição resolvida
  return { world, t, body };
}

describe('SPEC-0718: teletransporte curto', () => {
  it('sem aviso, o salto curto para antes da parede (SPEC-0648)', () => {
    const { world, t } = setup();
    t.x = BEYOND;
    world.tick(FRAME_MS);
    expect(t.x).toBeLessThanOrEqual(FACE - R + 1e-6);
  });

  it('com teleported(), o salto vale inteiro, do outro lado da parede', () => {
    const { world, t, body } = setup();
    t.x = BEYOND;
    body.teleported();
    world.tick(FRAME_MS);
    expect(t.x).toBeCloseTo(BEYOND, 6);
    expect(body.teleportQueued).toBe(false);
  });

  it('o aviso vale um tick só: o passo seguinte contra a parede volta a ser varrido', () => {
    const { world, t, body } = setup();
    t.x = BEYOND;
    body.teleported();
    world.tick(FRAME_MS);
    t.x = START; // de volta, atravessando a parede, sem aviso
    world.tick(FRAME_MS);
    expect(t.x).toBeGreaterThanOrEqual(FACE + WALL_DEPTH + R - 1e-6);
  });

  it('ponto preso: place + teleported() a cada quadro mantém o personagem no ponto', () => {
    const { world, t, body } = setup();
    for (let i = 0; i < HELD_FRAMES; i++) {
      t.x = BEYOND;
      t.z = 0;
      body.teleported();
      world.tick(FRAME_MS);
      expect(t.x).toBeCloseTo(BEYOND, 6);
    }
  });
});
