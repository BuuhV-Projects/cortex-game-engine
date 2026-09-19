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
/** O que o "nativo" devolve nas leituras que passam pelo scratch. */
let scratch: Float64Array;
let bodyGetValue: number;
let calls: { fn: string; args: number[] }[];

function installNativeRapier(): void {
  let nextHandle = 1;
  scratch = new Float64Array(32);
  bodyGetValue = 0;
  calls = [];
  g.__rapierNative = {
    worldNew: () => 1,
    worldScratch: () => scratch.buffer,
    worldStep: () => {},
    worldFree: () => {},
    bodyCreate: () => nextHandle++,
    colliderShape: () => 1,
    colliderTrimesh: () => 1,
    bodyGet: (...args: number[]) => { calls.push({ fn: 'bodyGet', args }); scratch[0] = bodyGetValue; },
    bodySet: (...args: number[]) => { calls.push({ fn: 'bodySet', args }); },
    bodyCollider: (...args: number[]) => { calls.push({ fn: 'bodyCollider', args }); return 77; },
    colliderGroups: (...args: number[]) => { calls.push({ fn: 'colliderGroups', args }); return 0xabcd; },
    bodyMassProps: (...args: number[]) => { calls.push({ fn: 'bodyMassProps', args }); },
    vehicleNew: () => 5,
  };
}

const argsOf = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);

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
  // A SPEC-0208 tinha um teste garantindo a MENSAGEM do bloqueio ("veículo não
  // portado"). A SPEC-0209 portou o controlador, então o bloqueio deixou de
  // existir — o teste foi substituído por este, e a cobertura do controller
  // vive em `rapier-compat-vehicle.test.ts`.
  it('cria o controlador (o bloqueio do port caiu na SPEC-0209)', () => {
    g.__rapierNative!['vehicleNew'] = () => 5;
    const world = new World({ x: 0, y: 0, z: 0 });
    const chassis = world.createRigidBody(DESC);
    expect(() => world.createVehicleController(chassis)).not.toThrow();
  });
});

describe('RigidBody — o que o jogo de carro usa (SPEC-0209)', () => {
  /** Corpo pronto num mundo. */
  function body() {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    return world.createRigidBody(DESC);
  }

  it('isDynamic/isFixed/isKinematic vêm do tipo do corpo', () => {
    const rb = body();

    bodyGetValue = 0;
    expect(rb.isDynamic()).toBe(true);
    expect(rb.isFixed()).toBe(false);

    bodyGetValue = 1;
    expect(rb.isFixed()).toBe(true);

    bodyGetValue = 2;
    expect(rb.isKinematic()).toBe(true);
    // `4` é o código de "tipo do corpo" no lib.rs — contrato entre as pontas.
    expect(argsOf('bodyGet').every((a) => a[2] === 4)).toBe(true);
  });

  it('numColliders lê a contagem; collider(i) devolve um Collider com handle', () => {
    const rb = body();
    bodyGetValue = 3;

    expect(rb.numColliders()).toBe(3);
    const collider = rb.collider(0);
    expect(collider?.handle).toBe(77);
  });

  it('collider inexistente (handle negativo) devolve null', () => {
    g.__rapierNative!['bodyCollider'] = () => -1;
    expect(body().collider(9)).toBeNull();
  });

  it('grupos de colisão do collider passam pelo mesmo caminho (get e set)', () => {
    const collider = body().collider(0)!;

    expect(collider.collisionGroups()).toBe(0xabcd);
    collider.setCollisionGroups(0x1234);

    // [mundo, collider, set(0|1), valor]
    expect(argsOf('colliderGroups')).toEqual([[1, 77, 0, 0], [1, 77, 1, 0x1234]]);
  });

  it('resetForces/resetTorques/setEnabledRotations mandam os códigos certos', () => {
    const rb = body();
    rb.resetForces(true);
    rb.resetTorques(true);
    rb.setEnabledRotations(false, true, false, true);

    const sets = argsOf('bodySet');
    expect(sets[0]![2]).toBe(8);  // resetForces
    expect(sets[1]![2]).toBe(9);  // resetTorques
    expect(sets[2]!.slice(2, 6)).toEqual([10, 0, 1, 0]); // só Y habilitado
  });

  it('setAdditionalMassProperties manda massa, centro e inércia', () => {
    const rb = body();
    rb.setAdditionalMassProperties(
      1200, { x: 0, y: -0.4, z: 0 }, { x: 10, y: 20, z: 30 }, { x: 0, y: 0, z: 0, w: 1 }, true,
    );

    // [mundo, corpo, massa, cx,cy,cz, ix,iy,iz, wake] — o `frame` da API do
    // Rapier não viaja: o engine sempre passa identidade (SPEC-0209).
    expect(argsOf('bodyMassProps')[0]).toEqual([1, 1, 1200, 0, -0.4, 0, 10, 20, 30, 1]);
  });
});
