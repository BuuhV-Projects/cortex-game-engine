/**
 * SPEC-0328: a câmera da 3ª pessoa reaproveita a varredura da cena que o
 * CharacterPhysicsSystem acabou de fazer da mesma raiz (e varre sozinha sem ele).
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { ThirdPersonControlSystem } from '../../src/systems/ThirdPersonControlSystem.js';
import { CharacterPhysicsSystem, COLLECT_INTERVAL_MS } from '../../src/systems/CharacterPhysicsSystem.js';
import { publishScan, recentScan } from '../../src/physics/nearMeshes.js';

const noKeys = { isKeyDown: () => false, getMouseDelta: () => ({ x: 0, y: 0 }) };
const FULL = 5.5;
const target = new THREE.Vector3(0, 1.5, 0);
const FRAME_MS = 16;

function setup(scene: THREE.Scene) {
  const world = new World();
  world.addSystem(new CharacterPhysicsSystem([scene]));
  const camera = new THREE.PerspectiveCamera();
  world.addSystem(
    new ThirdPersonControlSystem(camera, noKeys as never, {} as HTMLElement, { cameraDistance: FULL, cameraHeight: 1.5 }, undefined, scene),
  );
  const e = world.createEntity();
  e.addComponent(new TransformComponent(0, 0, 0, 0));
  e.addComponent(new CharacterBodyComponent({ footOffset: 0 }));
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 40));
  floor.position.y = -1; // topo em y = 0
  scene.add(floor);
  scene.updateMatrixWorld(true);
  return { world, camera };
}

describe('SPEC-0328: câmera reaproveita a varredura do CharacterPhysics', () => {
  it('parede nova entra na câmera na varredura seguinte, como antes', () => {
    const scene = new THREE.Scene();
    const { world, camera } = setup(scene);
    world.tick(FRAME_MS);
    expect(recentScan(scene, COLLECT_INTERVAL_MS)).toBeDefined(); // o CharacterPhysics publicou
    expect(camera.position.distanceTo(target)).toBeCloseTo(FULL, 1);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.5));
    wall.position.set(0, 0, 2); // entre o alvo e a câmera
    scene.add(wall);
    scene.updateMatrixWorld(true);
    for (let ms = 0; ms <= COLLECT_INTERVAL_MS + FRAME_MS; ms += FRAME_MS) world.tick(FRAME_MS);
    for (let i = 0; i < 30; i++) world.tick(FRAME_MS); // o braço encolhe a 12 m/s (SPEC-0311)
    expect(camera.position.distanceTo(target)).toBeLessThan(2);
  });

  it('a câmera não desce na cena quando há varredura recente publicada', () => {
    /** Leituras do `userData` de um nó-sentinela durante 1 quadro (cada varredura lê). */
    const readsIn = (withCamera: boolean): number => {
      const scene = new THREE.Scene();
      const world = new World();
      world.addSystem(new CharacterPhysicsSystem([scene]));
      if (withCamera) {
        world.addSystem(new ThirdPersonControlSystem(new THREE.PerspectiveCamera(), noKeys as never, {} as HTMLElement, {}, undefined, scene));
      }
      const e = world.createEntity();
      e.addComponent(new TransformComponent(0, 0, 0, 0));
      e.addComponent(new CharacterBodyComponent());
      const sentinel = new THREE.Object3D();
      let reads = 0;
      const ud = {};
      Object.defineProperty(sentinel, 'userData', { get: () => (reads++, ud) });
      scene.add(sentinel);
      world.tick(FRAME_MS);
      return reads;
    };
    expect(readsIn(true)).toBe(readsIn(false));
  });

  it('recentScan respeita a idade', () => {
    const root = new THREE.Object3D();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    publishScan(root, []);
    now.mockReturnValue(1000 + COLLECT_INTERVAL_MS);
    expect(recentScan(root, COLLECT_INTERVAL_MS)).toBeDefined();
    now.mockReturnValue(1001 + COLLECT_INTERVAL_MS);
    expect(recentScan(root, COLLECT_INTERVAL_MS)).toBeUndefined();
    now.mockRestore();
  });
});
