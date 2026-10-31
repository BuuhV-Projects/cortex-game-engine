/**
 * SPEC-0625: câmera de 3ª pessoa não atravessa objeto — raio da câmera, encolher
 * imediato, desvio de yaw que não briga com o jogador, ombro.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { ThirdPersonControlSystem } from '../../src/systems/ThirdPersonControlSystem.js';
import {
  CameraArmProbe, CAM_MIN_DIST, CAM_RADIUS, CAM_RELEASE_HOLD, CAM_SWING_STEP, pickSwing, stepArm,
} from '../../src/systems/thirdPersonCameraArm.js';

const noKeys = { isKeyDown: () => false, getMouseDelta: () => ({ x: 0, y: 0 }) };
const FRAME_MS = 16;
const WALL_Z = 0.35; // face da parede atrás do personagem (colado nela)

/** Parede grande cuja face fica em `z = WALL_Z` (o resto dela em +Z). */
function wallBehind(scene: THREE.Scene): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.5));
  wall.position.set(0, 0, WALL_Z + 0.25);
  scene.add(wall);
}

function setup(scene: THREE.Scene, opts = {}, pad?: unknown) {
  scene.updateMatrixWorld(true);
  const world = new World();
  const camera = new THREE.PerspectiveCamera();
  const sys = new ThirdPersonControlSystem(
    camera, noKeys as never, {} as HTMLElement, { cameraDistance: 5.5, cameraHeight: 1.5, ...opts }, pad as never, scene,
  );
  world.addSystem(sys);
  const e = world.createEntity();
  e.addComponent(new TransformComponent(0, 0, 0, 0));
  e.addComponent(new CharacterBodyComponent());
  const yaw = () => (sys as unknown as { yaw: number }).yaw;
  return { world, camera, yaw };
}

describe('stepArm (SPEC-0625)', () => {
  it('encolhe no mesmo quadro, segura e volta devagar', () => {
    const s = { dist: 5, hold: 0 };
    expect(stepArm(s, 1, 0.016)).toBe(1); // imediato
    expect(stepArm(s, 5, CAM_RELEASE_HOLD / 2)).toBe(1); // segura
    stepArm(s, 5, CAM_RELEASE_HOLD); // fim da espera
    const back = stepArm(s, 5, 0.1);
    expect(back).toBeGreaterThan(1);
    expect(back).toBeLessThan(2); // volta devagar
  });
  it('corte (dist infinita) encaixa', () => {
    expect(stepArm({ dist: Infinity, hold: 0 }, 3, 0.016)).toBe(3);
  });
});

describe('pickSwing (SPEC-0625)', () => {
  // livre só a partir de 30° para o lado positivo e 60° para o negativo
  const freeAt = (off: number) => (off >= 2 * CAM_SWING_STEP - 1e-9 || off <= -4 * CAM_SWING_STEP + 1e-9 ? 1 : 0);
  it('sem restrição: o lado mais perto que libera', () => {
    expect(pickSwing(freeAt, 1, 0, -1)).toBeCloseTo(2 * CAM_SWING_STEP);
  });
  it('jogador girando para um lado: só esse lado', () => {
    expect(pickSwing(freeAt, 1, -1, 1)).toBeCloseTo(-4 * CAM_SWING_STEP);
  });
  it('nenhum ângulo libera → null', () => {
    expect(pickSwing(() => 0, 1, 0, 1)).toBeNull();
  });
});

describe('CameraArmProbe.clearance (SPEC-0625)', () => {
  it('raio da câmera: parede de raspão (fora do raio central) ainda encurta o braço', () => {
    const scene = new THREE.Scene();
    // parede paralela ao braço, a 0,15 m do eixo (dentro do raio da câmera)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 20, 0.2));
    wall.position.set(0.15 + 0.1, 0, 2);
    scene.add(wall);
    scene.updateMatrixWorld(true);
    const probe = new CameraArmProbe();
    probe.collect(scene, undefined, Infinity);
    const free = probe.clearance(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 0, 1), 5, 0.75);
    expect(free).toBeLessThan(2 - 0.1); // parou antes da face (z = 1,9)
    expect(free).toBeCloseTo(1.9 - CAM_RADIUS, 2);
  });
});

describe('ThirdPersonControlSystem — colado na parede (SPEC-0625)', () => {
  it('desvia girando pro lado livre e nunca fica dentro da parede', () => {
    const scene = new THREE.Scene();
    wallBehind(scene);
    const { world, camera, yaw } = setup(scene);
    for (let f = 0; f < 250; f++) {
      world.tick(FRAME_MS);
      expect(camera.position.z).toBeLessThan(WALL_Z);
    }
    expect(Math.abs(yaw())).toBeGreaterThan(Math.PI / 3); // girou
    expect(camera.position.distanceTo(new THREE.Vector3(0, 1.5, 0))).toBeGreaterThanOrEqual(CAM_MIN_DIST);
  });

  it('modo locked: não desvia, só encolhe sem atravessar', () => {
    const scene = new THREE.Scene();
    wallBehind(scene);
    const { world, camera, yaw } = setup(scene, { orbit: 'locked' });
    for (let f = 0; f < 30; f++) world.tick(FRAME_MS);
    expect(yaw()).toBe(0);
    expect(camera.position.z).toBeLessThan(WALL_Z);
  });

  it('jogador girando para o lado bloqueado: o desvio não empurra contra a mão', () => {
    const scene = new THREE.Scene();
    wallBehind(scene);
    // parede à esquerda (−X): fecha o lado de yaw negativo (camBack.x = sin(yaw))
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 20, 20));
    left.position.set(-0.4 - 0.25, 0, 0);
    scene.add(left);
    const LOOK_RIGHT = 0.5; // stick direito pra direita → yaw diminui (lado −X)
    const pad = { getAxis: (_i: number, a: number) => (a === 2 ? LOOK_RIGHT : 0), isButtonDown: () => false };
    const { world, camera, yaw } = setup(scene, {}, pad);
    let prev = yaw();
    for (let f = 0; f < 60; f++) {
      world.tick(FRAME_MS);
      expect(yaw()).toBeLessThanOrEqual(prev + 1e-9); // nunca volta contra o giro do jogador
      prev = yaw();
      expect(camera.position.z).toBeLessThan(WALL_Z);
      expect(camera.position.x).toBeGreaterThan(-0.4);
    }
  });

  it('ombro: o alvo deslocado não entra na parede ao lado', () => {
    const scene = new THREE.Scene();
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.5, 20, 40));
    right.position.set(0.3 + 0.25, 0, 0); // face em x = 0,3
    scene.add(right);
    const { world, camera } = setup(scene, { shoulderOffset: 0.6 });
    world.tick(FRAME_MS);
    expect(camera.position.x).toBeLessThan(0.3);
  });
});
