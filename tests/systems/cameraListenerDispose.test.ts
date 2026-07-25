/**
 * SPEC-0152 — teardown de fase sem vazamento: os systems de câmera registram
 * `mousedown` no canvas no construtor e PRECISAM removê-lo no `dispose()`
 * (chamado pelo `World.clear()` na troca de fase). Sem isso, a closure do
 * listener retém o system (→ câmera → raiz da cena) da fase anterior a cada
 * troca. Ambiente node: `document` é stubado pra ativar o ramo do listener.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World.js';
import { ThirdPersonControlSystem } from '../../src/systems/ThirdPersonControlSystem.js';
import { FirstPersonCameraSystem } from '../../src/systems/FirstPersonCameraSystem.js';

const noKeys = { isKeyDown: () => false, getMouseDelta: () => ({ x: 0, y: 0 }) };

/** Canvas falso que registra os listeners adicionados/removidos. */
function fakeCanvas() {
  const listeners = new Map<string, Set<unknown>>();
  return {
    listeners,
    addEventListener(type: string, fn: unknown) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: unknown) {
      listeners.get(type)?.delete(fn);
    },
    count(type: string): number {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

beforeEach(() => {
  // Ativa o ramo `typeof document !== 'undefined'` dos construtores.
  vi.stubGlobal('document', { pointerLockElement: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dispose() dos systems de câmera (SPEC-0152)', () => {
  it('ThirdPersonControlSystem: dispose remove o mousedown do canvas', () => {
    const canvas = fakeCanvas();
    const sys = new ThirdPersonControlSystem(
      new THREE.PerspectiveCamera(),
      noKeys as never,
      canvas as unknown as HTMLElement,
    );
    expect(canvas.count('mousedown')).toBe(1);
    sys.dispose();
    expect(canvas.count('mousedown')).toBe(0);
  });

  it('FirstPersonCameraSystem: dispose remove o mousedown do canvas', () => {
    const canvas = fakeCanvas();
    const sys = new FirstPersonCameraSystem(
      new THREE.PerspectiveCamera(),
      noKeys as never,
      canvas as unknown as HTMLElement,
    );
    expect(canvas.count('mousedown')).toBe(1);
    sys.dispose();
    expect(canvas.count('mousedown')).toBe(0);
  });

  it('World.clear() (troca de fase) dispara o dispose — sem listener órfão por fase', () => {
    const canvas = fakeCanvas();
    const world = new World();
    // Duas "fases": cada uma registra o seu system no mesmo canvas.
    world.addSystem(
      new ThirdPersonControlSystem(new THREE.PerspectiveCamera(), noKeys as never, canvas as unknown as HTMLElement),
    );
    world.clear();
    world.addSystem(
      new ThirdPersonControlSystem(new THREE.PerspectiveCamera(), noKeys as never, canvas as unknown as HTMLElement),
    );
    world.clear();
    expect(canvas.count('mousedown')).toBe(0); // antes do fix: 2 (um por fase)
  });

  it('dispose é idempotente (duas chamadas não quebram)', () => {
    const canvas = fakeCanvas();
    const sys = new ThirdPersonControlSystem(
      new THREE.PerspectiveCamera(),
      noKeys as never,
      canvas as unknown as HTMLElement,
    );
    sys.dispose();
    expect(() => sys.dispose()).not.toThrow();
  });
});
