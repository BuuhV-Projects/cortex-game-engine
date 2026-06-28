/**
 * Testes do ThirdPersonControlSystem (src/systems/ThirdPersonControlSystem.ts),
 * foco no controle **gamepad-first** (Xbox): stick esquerdo anda (analógico), RT
 * corre, A pula. Ambiente node (sem `document`) → o caminho mouse/pointer-lock fica
 * inerte; exercitamos só o gamepad. Câmera real (three), sem WebGL.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { ThirdPersonControlSystem } from '../../src/systems/ThirdPersonControlSystem.js';

/** Stub de gamepad: eixos/botões fixos (sem deadzone — valores crus). */
function fakePad(axes: number[] = [], buttons: number[] = []) {
  return {
    getAxis: (_i: number, a: number) => axes[a] ?? 0,
    isButtonDown: (_i: number, b: number) => buttons[b] === 1,
  };
}
const noKeys = { isKeyDown: () => false, getMouseDelta: () => ({ x: 0, y: 0 }) };

function setup(pad: unknown, opts = {}) {
  const world = new World();
  const camera = new THREE.PerspectiveCamera();
  const sys = new ThirdPersonControlSystem(
    camera,
    noKeys as never,
    {} as HTMLElement,
    { moveSpeed: 2, sprintSpeed: 6, ...opts },
    pad as never,
  );
  world.addSystem(sys);
  const e = world.createEntity();
  e.addComponent(new TransformComponent(0, 0, 0, 0));
  e.addComponent(new CharacterBodyComponent());
  return { world, e };
}

describe('ThirdPersonControlSystem (gamepad-first)', () => {
  it('stick esquerdo pra frente (ly=-1) move o player pra -Z (yaw=0)', () => {
    const { world, e } = setup(fakePad([0, -1]));
    world.tick(16);
    const t = e.getComponent(TransformComponent)!;
    expect(t.z).toBeLessThan(0);
    expect(Math.abs(t.x)).toBeLessThan(1e-6); // sem deriva lateral
  });

  it('stick lateral (lx=1) move pra +X', () => {
    const { world, e } = setup(fakePad([1, 0]));
    world.tick(16);
    expect(e.getComponent(TransformComponent)!.x).toBeGreaterThan(0);
  });

  it('analógico: stick parcial (0.5) anda ~metade do stick cheio', () => {
    const full = setup(fakePad([0, -1]));
    const half = setup(fakePad([0, -0.5]));
    full.world.tick(16);
    half.world.tick(16);
    const dz = (s: ReturnType<typeof setup>) => Math.abs(s.e.getComponent(TransformComponent)!.z);
    expect(dz(half)).toBeGreaterThan(0);
    expect(dz(half)).toBeLessThan(dz(full));
    expect(dz(half) / dz(full)).toBeCloseTo(0.5, 1);
  });

  it('RT (botão 7) corre — anda mais que sem RT', () => {
    const walk = setup(fakePad([0, -1]));
    const run = setup(fakePad([0, -1], [0, 0, 0, 0, 0, 0, 0, 1]));
    walk.world.tick(16);
    run.world.tick(16);
    const dz = (s: ReturnType<typeof setup>) => Math.abs(s.e.getComponent(TransformComponent)!.z);
    expect(dz(run)).toBeGreaterThan(dz(walk));
  });

  it('A (botão 0) enfileira o pulo (borda de pressão, uma vez)', () => {
    const { world, e } = setup(fakePad([0, 0], [1]));
    const body = e.getComponent(CharacterBodyComponent)!;
    world.tick(16);
    expect(body.jumpQueued).toBe(true);
  });

  it('sem gamepad nem teclado: player não se move', () => {
    const { world, e } = setup(undefined);
    world.tick(16);
    const t = e.getComponent(TransformComponent)!;
    expect(t.x).toBe(0);
    expect(t.z).toBe(0);
  });
});
