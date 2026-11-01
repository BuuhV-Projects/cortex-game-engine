/**
 * SPEC-0394 — setters de corpo e collider no adaptador do Rapier nativo. Sem eles
 * o `BreakableProps.activate` do DDD 61 lançava quando o carro encostava num poste.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// @ts-expect-error — host JS shim, typed as any
import { World, RigidBodyDesc } from '../../native/js/src/shims/rapier-compat.js';

const g = globalThis as { __rapierNative?: unknown };
const BODY = 7;
const COLLIDER = 70;
const SCRATCH_SIZE = 16;
let calls: { fn: string; args: number[] }[];

beforeEach(() => {
  calls = [];
  const scratch = new Float64Array(SCRATCH_SIZE);
  const log = (fn: string) => (...args: number[]) => { calls.push({ fn, args }); };
  g.__rapierNative = {
    worldNew: () => 1,
    worldScratch: () => scratch.buffer,
    bodyCreate: () => BODY,
    bodyCollider: () => COLLIDER,
    bodySet: log('bodySet'),
    colliderSet: log('colliderSet'),
  };
});

afterEach(() => {
  delete g.__rapierNative;
});

const argsOf = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args.slice(1));

describe('rapier-compat: setters do BreakableProps (SPEC-0394)', () => {
  it('activate + break do DDD 61 chegam ao nativo com os códigos do lib.rs', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    const body = world.createRigidBody(RigidBodyDesc.fixed());
    // mesma ordem do BreakableProps.activate/break (entities/breakableProps.ts do jogo)
    body.setBodyType(1, true);
    const collider = body.collider(0);
    collider.setRadius(0.4);
    collider.setHalfHeight(1.1);
    collider.setDensity(120);
    collider.setFriction(0.7);
    collider.setRestitution(0.05);
    body.enableCcd(true);
    body.setLinearDamping(0.15);
    body.setAngularDamping(2.5);
    body.setBodyType(0, true);

    // [handle, code, x, y, z, qw, wake]
    expect(argsOf('bodySet')).toEqual([
      [BODY, 12, 1, 0, 0, 0, 1],
      [BODY, 13, 1, 0, 0, 0, 1],
      [BODY, 14, 0.15, 0, 0, 0, 1],
      [BODY, 15, 2.5, 0, 0, 0, 1],
      [BODY, 12, 0, 0, 0, 0, 1],
    ]);
    // [collider, code, value]: radius 0, halfHeight 1, density 2, friction 3, restitution 4
    expect(argsOf('colliderSet')).toEqual([
      [COLLIDER, 0, 0.4],
      [COLLIDER, 1, 1.1],
      [COLLIDER, 2, 120],
      [COLLIDER, 3, 0.7],
      [COLLIDER, 4, 0.05],
    ]);
  });

  it('sleep dorme o corpo pelo código 16 (SPEC-0655)', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    world.createRigidBody(RigidBodyDesc.dynamic()).sleep();
    expect(argsOf('bodySet')).toEqual([[BODY, 16, 0, 0, 0, 0, 0]]);
  });

  it('setBodyType com wake=false não acorda o corpo', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    world.createRigidBody(RigidBodyDesc.fixed()).setBodyType(0, false);
    expect(argsOf('bodySet')[0]!.at(-1)).toBe(0);
  });
});
