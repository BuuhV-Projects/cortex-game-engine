/**
 * Microbench de alocação do `World.tick` (SPEC-0675, ADR-0676): bytes por tick pelo `heapUsed` antes e depois de
 * rodadas de ticks, depois de aquecer até o JIT otimizar; vale a menor rodada sem coleta (a alocação do código
 * otimizado é fixa, o ruído só soma). Roda com JIT (o vitest normal): o V8 otimiza o iterador do `Set` que o Hermes
 * aloca por passo, então a referência no formato antigo mede só os arrays — o número compara antes e depois, não
 * soma com o nativo. Cena do DDD 00: ~2,1 mil entidades, ~25 sistemas com `requiredComponents = []`.
 * Para ver os números: `PERF_REPORT=1 yarn vitest run tests/ecs/worldQueryAlloc.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { Component } from '../../src/ecs/Component.js';
import type { Entity } from '../../src/ecs/Entity.js';
import { System } from '../../src/ecs/System.js';
import { World } from '../../src/ecs/World.js';

const ENTITIES = 2100;
/** Ganchos de quadro do jogo + sistemas da engine com `[]`. */
const ALL_SYSTEMS = 25;
const TWO_COMPONENT_SYSTEMS = 3;
/** Uma entidade a cada N tem os dois componentes (os personagens/carros). */
const BODY_EVERY = 10;
const WARMUP_TICKS = 300;
const ROUNDS = 15;
const TICKS = 50;
/** Teto depois do corte: sobra de caixa de número das chamadas; um array por sistema voltando passa dele. */
const CEILING_BYTES = 2048;

class Transform extends Component {}
class Body extends Component {}

let sink = 0;
class Hook extends System {
  static override requiredComponents = [];
  override update(entities: Entity[]): void {
    sink += entities.length;
  }
}
class Physics extends System {
  static override requiredComponents = [Transform, Body];
  override update(entities: Entity[]): void {
    sink += entities.length;
  }
}

/** Referência: o `tick` de antes, com a consulta por `for…of` no `Set` e array novo por sistema. */
class OldWorld {
  readonly entities = new Set<Entity>();
  readonly systems: System[] = [];
  tick(dt: number): void {
    for (const system of this.systems) {
      const required = (system.constructor as typeof System).requiredComponents;
      system.update(this.query(...required), dt);
    }
  }
  private query(...classes: (new () => Component)[]): Entity[] {
    const result: Entity[] = [];
    outer: for (const entity of this.entities) {
      for (let i = 0; i < classes.length; i++) if (!entity.hasComponent(classes[i]!)) continue outer;
      result.push(entity);
    }
    return result;
  }
}

function populate(world: World, old: OldWorld): void {
  for (let i = 0; i < ENTITIES; i++) {
    const e = world.createEntity().addComponent(new Transform());
    if (i % BODY_EVERY === 0) e.addComponent(new Body());
    old.entities.add(e);
  }
  for (let s = 0; s < ALL_SYSTEMS; s++) {
    const hook = new Hook();
    world.addSystem(hook);
    old.systems.push(hook);
  }
  for (let s = 0; s < TWO_COMPONENT_SYSTEMS; s++) {
    const physics = new Physics();
    world.addSystem(physics);
    old.systems.push(physics);
  }
}

/** Bytes por chamada de `fn` (a menor rodada sem coleta). */
function bytesPerCall(fn: () => void): number {
  for (let i = 0; i < WARMUP_TICKS; i++) fn();
  let best = Infinity;
  for (let r = 0; r < ROUNDS; r++) {
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < TICKS; i++) fn();
    const after = process.memoryUsage().heapUsed;
    if (after >= before) best = Math.min(best, (after - before) / TICKS);
  }
  return best;
}

describe('World.tick — alocação por quadro (SPEC-0675)', () => {
  it('sem mudança de estrutura, o tick não aloca na consulta', () => {
    const world = new World();
    const old = new OldWorld();
    populate(world, old);
    const before = bytesPerCall(() => old.tick(16));
    const after = bytesPerCall(() => world.tick(16));
    if (process.env['PERF_REPORT']) {
      process.stdout.write(`[alloc] World.tick: ${after.toFixed(0)} B/tick (formato antigo: ${before.toFixed(0)} B)\n`);
    }
    expect(sink).toBeGreaterThan(0);
    expect(after).toBeLessThan(CEILING_BYTES);
    expect(before).toBeGreaterThan(after);
  });
});
