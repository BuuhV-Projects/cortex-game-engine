/**
 * Testes do character controller (CharacterBodyComponent + CharacterPhysicsSystem)
 * + aterramento no terreno (TerrainCollisionSystem): gravidade limitada, pulo
 * (jumpForce/maxJumps), e o personagem ficando EM CIMA do terreno.
 */
import { describe, it, expect } from 'vitest';
import { Object3D, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { World } from '../../src/ecs/World.js';
import { Terrain } from '../../src/scene/Terrain.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { TerrainComponent } from '../../src/components/TerrainComponent.js';
import { CharacterPhysicsSystem } from '../../src/systems/CharacterPhysicsSystem.js';
import { TerrainCollisionSystem } from '../../src/systems/TerrainCollisionSystem.js';

describe('CharacterPhysicsSystem', () => {
  it('gravidade puxa pra baixo (limitada por fallSpeedMax)', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const t = new TransformComponent(0, 10, 0);
    const c = new CharacterBodyComponent({ gravity: 30, fallSpeedMax: 25 });
    e.addComponent(t);
    e.addComponent(c);
    world.tick(100); // 0.1s
    expect(c.velocityY).toBeCloseTo(-3); // -30*0.1
    expect(t.y).toBeLessThan(10);
    // acumula até o teto de queda
    for (let i = 0; i < 60; i++) world.tick(100);
    expect(c.velocityY).toBeCloseTo(-25); // limitado por fallSpeedMax
  });

  it('jump() aplica jumpForce e respeita maxJumps', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const c = new CharacterBodyComponent({ jumpForce: 9, maxJumps: 1 });
    e.addComponent(new TransformComponent(0, 0, 0));
    e.addComponent(c);
    c.jump();
    world.tick(16);
    expect(c.velocityY).toBeGreaterThan(0); // subiu (jumpForce - gravidade do tick)
    expect(c.jumpsUsed).toBe(1);
    c.jump(); // sem pulos disponíveis (maxJumps 1, não aterrou)
    const vBefore = c.velocityY;
    world.tick(16);
    expect(c.jumpsUsed).toBe(1); // não pulou de novo
    expect(c.velocityY).toBeLessThan(vBefore); // só caiu pela gravidade
  });
});

describe('CharacterBody + piso plano (groundY, sem raycast)', () => {
  it('cai e PARA no groundY (estável: não passa, não treme)', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    const c = new CharacterBodyComponent({ groundY: 0 });
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBe(0); // aterrou exatamente no piso (clamp determinístico)
    expect(c.grounded).toBe(true);
    expect(c.velocityY).toBe(0);
    expect(c.jumpsUsed).toBe(0);

    // mais ticks no chão: continua cravado (sem tremor/oscilação)
    for (let i = 0; i < 10; i++) world.tick(16);
    expect(t.y).toBe(0);
  });

  it('groundY pode ser != 0 (altura de spawn em top-down)', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    const e = world.createEntity();
    const t = new TransformComponent(0, 8, 0);
    const c = new CharacterBodyComponent({ groundY: 3 });
    e.addComponent(t);
    e.addComponent(c);
    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBe(3);
    expect(c.grounded).toBe(true);
  });
});

describe('CharacterBody + colisão real (raycast na geometria, tipo Unity)', () => {
  function sceneWithFloor(topY: number): Object3D {
    const scene = new Object3D();
    const floor = new Mesh(new BoxGeometry(40, 1, 40), new MeshBasicMaterial());
    floor.position.y = topY - 0.5; // topo do box em topY
    scene.add(floor);
    scene.updateMatrixWorld(true);
    return scene;
  }

  it('cai de qualquer altura e POUSA na geometria embaixo (não no groundY)', () => {
    const scene = sceneWithFloor(2); // chão real em y=2
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 12, 0); // bem no alto
    const c = new CharacterBodyComponent({ groundY: 0 }); // piso de segurança em 0
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 200; i++) world.tick(16);
    expect(t.y).toBeCloseTo(2, 1); // pousou no mesh (2), não caiu até o fallback (0)
    expect(c.grounded).toBe(true);
  });

  it('estável no chão: não treme (Y constante após pousar)', () => {
    const scene = sceneWithFloor(0);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const e = world.createEntity();
    const t = new TransformComponent(0, 3, 0);
    e.addComponent(t);
    e.addComponent(new CharacterBodyComponent());
    for (let i = 0; i < 120; i++) world.tick(16); // pousa
    const settled = t.y;
    const ys: number[] = [];
    for (let i = 0; i < 30; i++) { world.tick(16); ys.push(t.y); }
    // sem oscilação: todo frame fica cravado na mesma altura
    for (const y of ys) expect(y).toBe(settled);
  });

  it('ignora o próprio mesh (não se apoia em si mesmo)', () => {
    const scene = sceneWithFloor(0);
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem([scene]));
    const selfMesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshBasicMaterial());
    scene.add(selfMesh);
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    e.addComponent(t);
    e.addComponent(new Object3DComponent(selfMesh));
    e.addComponent(new CharacterBodyComponent());
    const sync = (): void => { selfMesh.position.set(t.x, t.y, t.z); selfMesh.updateMatrixWorld(true); };
    sync();
    for (let i = 0; i < 120; i++) { world.tick(16); sync(); }
    expect(t.y).toBeCloseTo(0, 1); // pousou no FLOOR, não no próprio mesh
  });

  it('sem raízes (sem colisão), usa só o piso groundY', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem()); // sem colisão
    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0);
    const c = new CharacterBodyComponent({ groundY: 1 });
    e.addComponent(t);
    e.addComponent(c);
    for (let i = 0; i < 120; i++) world.tick(16);
    expect(t.y).toBe(1);
    expect(c.grounded).toBe(true);
  });
});

describe('CharacterBody + terreno', () => {
  it('o personagem cai e PARA em cima do terreno (grounded, pulos resetam)', () => {
    const world = new World();
    world.addSystem(new CharacterPhysicsSystem());
    world.addSystem(new TerrainCollisionSystem());
    const terrain = new Terrain({ size: 20, resolution: 20 });
    const te = world.createEntity();
    te.addComponent(new TerrainComponent(terrain, terrain.mesh)); // plano em y=0

    const e = world.createEntity();
    const t = new TransformComponent(0, 5, 0); // começa no ar
    const c = new CharacterBodyComponent();
    e.addComponent(t);
    e.addComponent(c);

    for (let i = 0; i < 120; i++) world.tick(16); // ~2s caindo
    expect(t.y).toBeCloseTo(0); // pousou na superfície (plano = 0)
    expect(c.grounded).toBe(true);
    expect(c.velocityY).toBe(0);
    expect(c.jumpsUsed).toBe(0); // resetou ao aterrar
  });
});
