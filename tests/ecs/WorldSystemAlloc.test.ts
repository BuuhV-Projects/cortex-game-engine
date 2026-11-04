/**
 * Alocação por sistema do ECS (SPEC-0688): com o perfil por sistema ligado e o host expondo
 * `__cortexAllocatedBytes`, o `World` lê antes e depois de cada `update` e soma a diferença no nome do sistema.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { World } from '../../src/ecs/World.js';
import { System } from '../../src/ecs/System.js';
import { drainTraceCounters, resetTraceCounters, setTraceCountersActive } from '../../src/core/perfTrace/traceCounters.js';

const g = globalThis as { __cortexAllocatedBytes?: () => number };
let allocated = 0;
const KB = 1024;

class Gastador extends System {
  override readonly profileLabel = 'Gastador';
  update(): void {
    allocated += 4 * KB;
  }
}

class Economico extends System {
  override readonly profileLabel = 'Economico';
  update(): void {}
}

beforeEach(() => {
  allocated = 0;
  resetTraceCounters();
  g.__cortexAllocatedBytes = () => allocated;
});

afterEach(() => {
  delete g.__cortexAllocatedBytes;
  resetTraceCounters();
});

describe('World — alocação por sistema (SPEC-0688)', () => {
  it('soma os bytes de cada sistema na janela', () => {
    setTraceCountersActive(true);
    const world = new World();
    world.addSystem(new Gastador());
    world.addSystem(new Economico());
    world.enableSystemProfile();
    world.tick(16);
    world.tick(16);
    expect(drainTraceCounters().alloc?.sysKB).toEqual({ Gastador: 8, Economico: 0 });
  });

  it('sem o trace ativo, não lê a alocação', () => {
    let reads = 0;
    g.__cortexAllocatedBytes = () => ++reads;
    const world = new World();
    world.addSystem(new Economico());
    world.enableSystemProfile();
    world.tick(16);
    expect(reads).toBe(0);
  });

  it('sem o perfil por sistema, não lê a alocação', () => {
    setTraceCountersActive(true);
    let reads = 0;
    g.__cortexAllocatedBytes = () => ++reads;
    const world = new World();
    world.addSystem(new Economico());
    world.tick(16);
    expect(reads).toBe(0);
  });
});
