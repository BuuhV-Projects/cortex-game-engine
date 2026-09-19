/**
 * API do `World` no shim do Rapier nativo (SPEC-0208). O shim espelha um
 * SUBCONJUNTO do Rapier do browser, e o que falta só aparece em runtime como
 * "undefined is not a function" no meio do setup do jogo — foi assim que o
 * `forEachRigidBody` apareceu, com o kart-racer morrendo no `createCar`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../../native/js/src/shims/rapier-compat.js';

interface NativeBridge {
  __rapierNative?: unknown;
}
const g = globalThis as NativeBridge;

/** Lado nativo falso: handles sequenciais, sem tocar no Rust. */
function installNativeRapier(): void {
  let nextHandle = 1;
  g.__rapierNative = {
    worldNew: () => 1,
    worldScratch: () => new ArrayBuffer(8 * 32),
    worldStep: () => {},
    worldFree: () => {},
    bodyCreate: () => nextHandle++,
    colliderShape: () => 1,
    colliderTrimesh: () => 1,
  };
}

const DESC = { kind: 0, x: 0, y: 0, z: 0, canSleep: true };

beforeEach(() => installNativeRapier());
afterEach(() => { delete g.__rapierNative; });

describe('World.forEachRigidBody', () => {
  it('visita cada corpo criado, na ordem', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    const a = world.createRigidBody(DESC);
    const b = world.createRigidBody(DESC);

    const seen: unknown[] = [];
    world.forEachRigidBody((body: unknown) => seen.push(body));

    expect(seen).toEqual([a, b]);
  });

  it('mundo vazio não chama o callback', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    let calls = 0;
    world.forEachRigidBody(() => calls++);
    expect(calls).toBe(0);
  });

  it('criar corpo DENTRO do callback não entra em laço infinito', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    world.createRigidBody(DESC);

    let calls = 0;
    world.forEachRigidBody(() => {
      calls++;
      if (calls < 5) world.createRigidBody(DESC); // itera sobre uma cópia
    });

    expect(calls).toBe(1);
    expect(world.numRigidBodies).toBe(2);
  });

  it('callback inválido é ignorado em vez de explodir', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    world.createRigidBody(DESC);
    expect(() => world.forEachRigidBody(undefined as never)).not.toThrow();
  });

  it('numRigidBodies conta o que o mundo criou', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    expect(world.numRigidBodies).toBe(0);
    world.createRigidBody(DESC);
    world.createRigidBody(DESC);
    expect(world.numRigidBodies).toBe(2);
  });
});

describe('World.createVehicleController', () => {
  it('falha com uma mensagem que explica o bloqueio do port', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    expect(() => world.createVehicleController()).toThrow(/controlador de veiculo/i);
    // A mensagem tem que dizer o que fazer com a informação: jogo de carro não
    // roda no export nem no preview nativo (antes citava uma nota interna).
    expect(() => world.createVehicleController()).toThrow(/preview nativo/i);
  });
});
