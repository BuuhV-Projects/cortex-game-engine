/**
 * Raycast de mundo no shim do Rapier nativo (SPEC-0216).
 *
 * O `followGround` do kart-racer lança um raio por roda, todo frame, pra colar
 * o chassi no chão. Sem `castRayAndGetNormal` a chamada virava
 * "undefined is not a function", a exceção subia até o rAF e abortava o tick
 * INTEIRO do jogo — carro parado, pickups sem girar, UI sem responder a clique.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../../native/js/src/shims/rapier-compat.js';

interface NativeBridge {
  __rapierNative?: unknown;
}
const g = globalThis as NativeBridge;

let scratch: Float64Array;
let calls: { fn: string; args: number[] }[];
/** O que o "Rust" devolve do `worldCastRay`: 1 acerta, 0 não. */
let hit: number;
/** Resposta do `colliderGet` por `what` (0 = isSensor, 1 = corpo dono). */
let colliderGetValues: Record<number, number>;

/** Massa que o "Rust" devolve no `bodyGet(…, 6)`. */
const MASSA_FALSA = 1250;
let nextHandle = 1;

function installNativeRapier(): void {
  nextHandle = 1;
  scratch = new Float64Array(32);
  calls = [];
  hit = 1;
  colliderGetValues = { 0: 0, 1: 42 };
  g.__rapierNative = {
    worldNew: () => 1,
    worldScratch: () => scratch.buffer,
    worldStep: () => {},
    worldFree: () => {},
    bodyCreate: () => nextHandle++,
    bodyGet: (...args: number[]) => { calls.push({ fn: 'bodyGet', args }); scratch[0] = MASSA_FALSA; },
    bodyRemove: (...args: number[]) => { calls.push({ fn: 'bodyRemove', args }); },
    worldCastRay: (...args: number[]) => {
      calls.push({ fn: 'worldCastRay', args });
      if (hit === 1) {
        scratch[0] = 2.5;                       // distância
        scratch[1] = 0; scratch[2] = 1; scratch[3] = 0; // normal (chão plano)
        scratch[4] = 99;                        // handle do collider
        scratch[5] = 42;                        // handle do corpo dono
      }
      return hit;
    },
    colliderGet: (...args: number[]) => {
      calls.push({ fn: 'colliderGet', args });
      return colliderGetValues[args[2]!] ?? -1;
    },
  };
}

const argsDe = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);
const RAIO = { origin: { x: 1, y: 10, z: 3 }, dir: { x: 0, y: -1, z: 0 } };

beforeEach(() => installNativeRapier());
afterEach(() => { delete g.__rapierNative; });

describe('World.castRayAndGetNormal', () => {
  it('devolve o acerto com distância, normal e collider', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });

    const acerto = world.castRayAndGetNormal(RAIO, 20, false);

    expect(acerto).not.toBeNull();
    expect(acerto!.timeOfImpact).toBe(2.5);
    expect(acerto!.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(acerto!.collider.handle).toBe(99);
  });

  it('expõe a distância nos DOIS nomes (`timeOfImpact` e `toi`)', () => {
    // O runtime vendorizado lê `timeOfImpact`; tipagens antigas leem `toi`. O
    // `followGround` aceita os dois, e quebraria silenciosamente com só um.
    const world = new World({ x: 0, y: 0, z: 0 });

    const acerto = world.castRayAndGetNormal(RAIO, 20, false)!;

    expect(acerto.toi).toBe(2.5);
    expect(acerto.timeOfImpact).toBe(acerto.toi);
  });

  it('calcula o ponto de impacto a partir da origem e da direção', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    const acerto = world.castRayAndGetNormal(RAIO, 20, false)!;

    expect(acerto.point).toEqual({ x: 1, y: 7.5, z: 3 });
  });

  it('sem acerto devolve null', () => {
    hit = 0;
    const world = new World({ x: 0, y: 0, z: 0 });

    expect(world.castRayAndGetNormal(RAIO, 20, false)).toBeNull();
  });

  it('repassa origem, direção, alcance e `solid` pro nativo', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    world.castRayAndGetNormal(RAIO, 12, true);

    const [args] = argsDe('worldCastRay');
    expect(args!.slice(1, 8)).toEqual([1, 10, 3, 0, -1, 0, 12]);
    expect(args![8]).toBe(1); // solid
  });

  it('traduz os filterFlags conhecidos e ignora o resto', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const EXCLUI_SENSORES_E_DINAMICOS = 8 | 2;
    const BIT_DESCONHECIDO = 1024;

    world.castRayAndGetNormal(RAIO, 20, false, EXCLUI_SENSORES_E_DINAMICOS | BIT_DESCONHECIDO);

    expect(argsDe('worldCastRay')[0]![9]).toBe(EXCLUI_SENSORES_E_DINAMICOS);
  });

  it('exclui o corpo passado (o carro não acerta o próprio chassi)', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const chassi = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: true });

    world.castRayAndGetNormal(RAIO, 20, false, 0, undefined, undefined, chassi);

    expect(argsDe('worldCastRay')[0]![10]).toBe(chassi.handle);
  });

  it('sem corpo a excluir manda -1 (o Rust lê negativo como "sem exclusão")', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    world.castRayAndGetNormal(RAIO, 20, false);

    expect(argsDe('worldCastRay')[0]![10]).toBe(-1);
  });

  it('o filterPredicate recebe o collider do acerto', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const vistos: number[] = [];

    world.castRayAndGetNormal(
      RAIO, 20, false, 0, undefined, undefined, undefined,
      (collider: { handle: number }) => { vistos.push(collider.handle); return true; },
    );

    expect(vistos).toEqual([99]);
  });

  it('recusado pelo predicate, a busca CONTINUA além do acerto', () => {
    // O caso real: um sensor (gate de checkpoint) sobre a pista. Parar no
    // primeiro recusado devolvia null, o carro perdia o chão e AFUNDAVA no
    // asfalto. Aqui o primeiro acerto é recusado e o segundo, aceito.
    const world = new World({ x: 0, y: 0, z: 0 });
    let chamadas = 0;

    const acerto = world.castRayAndGetNormal(
      RAIO, 20, false, 0, undefined, undefined, undefined,
      () => ++chamadas > 1,
    );

    expect(chamadas).toBe(2);
    expect(acerto).not.toBeNull();
    // A distância é somada desde a origem ORIGINAL: 2.5 do primeiro trecho
    // (mais o epsilon de avanço) + 2.5 do segundo.
    expect(acerto!.timeOfImpact).toBeCloseTo(5, 3);
  });

  it('a origem avança a cada recusa (não reacerta o mesmo ponto)', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    world.castRayAndGetNormal(
      RAIO, 20, false, 0, undefined, undefined, undefined,
      () => false,
    );

    const origens = argsDe('worldCastRay').map((a) => a[2]);
    // Raio pra baixo a partir de y=10, acertando a 2.5: 10 → 7.5 → 5 → …
    expect(origens[0]).toBe(10);
    expect(origens[1]).toBeCloseTo(7.5, 3);
    expect(origens[2]).toBeCloseTo(5, 3);
  });

  it('predicate que recusa tudo termina em null, sem laço infinito', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    let chamadas = 0;

    const acerto = world.castRayAndGetNormal(
      RAIO, 100, false, 0, undefined, undefined, undefined,
      () => { chamadas++; return false; },
    );

    expect(acerto).toBeNull();
    expect(chamadas).toBeLessThanOrEqual(9); // MAX_ACERTOS_RECUSADOS + 1
  });

  it('o alcance restante diminui a cada recusa', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    world.castRayAndGetNormal(
      RAIO, 20, false, 0, undefined, undefined, undefined, () => false,
    );

    const alcances = argsDe('worldCastRay').map((a) => a[7]!);
    expect(alcances[0]).toBe(20);
    expect(alcances[1]).toBeCloseTo(17.5, 3);
    expect(alcances[1]).toBeLessThan(alcances[0]!);
  });

  it('o filterPredicate que aprova deixa o acerto passar', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    const acerto = world.castRayAndGetNormal(
      RAIO, 20, false, 0, undefined, undefined, undefined, () => true,
    );

    expect(acerto).not.toBeNull();
  });
});

describe('Collider: o que o filterPredicate pergunta', () => {
  it('`isSensor()` reflete o lado nativo', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const acerto = world.castRayAndGetNormal(RAIO, 20, false)!;

    expect(acerto.collider.isSensor()).toBe(false);

    colliderGetValues[0] = 1;
    expect(acerto.collider.isSensor()).toBe(true);
  });

  it('`parent()` devolve o corpo dono', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const acerto = world.castRayAndGetNormal(RAIO, 20, false)!;

    expect(acerto.collider.parent()!.handle).toBe(42);
  });

  it('`parent()` devolve null quando o collider não tem dono', () => {
    colliderGetValues[1] = -1;
    const world = new World({ x: 0, y: 0, z: 0 });
    const acerto = world.castRayAndGetNormal(RAIO, 20, false)!;

    expect(acerto.collider.parent()).toBeNull();
  });

  it('o predicate do kart-racer roda inteiro sem explodir', () => {
    // `collider => !collider.isSensor() && collider.parent()?.isFixed() === true`
    // é exatamente a expressão que derrubava o tick do jogo.
    const world = new World({ x: 0, y: 0, z: 0 });
    let chamou = false;

    const acerto = world.castRayAndGetNormal(
      RAIO, 20, false, 0, undefined, undefined, undefined,
      (collider: { isSensor(): boolean; parent(): { isFixed(): boolean } | null }) => {
        chamou = true;
        return !collider.isSensor() && collider.parent() !== null;
      },
    );

    expect(chamou).toBe(true);
    expect(acerto).not.toBeNull();
  });
});

describe('APIs do World que o jogo precisa (SPEC-0216)', () => {
  it('`gravity` é legível (o carro cancela a gravidade na pista todo frame)', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });

    expect(world.gravity).toEqual({ x: 0, y: -9.81, z: 0 });
  });

  it('`getRigidBody` acha o corpo pelo handle', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const a = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: true });
    const b = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: true });

    expect(world.getRigidBody(a.handle)).toBe(a);
    expect(world.getRigidBody(b.handle)).toBe(b);
    expect(world.getRigidBody(9999)).toBeNull();
  });

  it('`removeRigidBody` tira do mundo e da lista iterada', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const a = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: true });
    const b = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: true });

    world.removeRigidBody(a);

    expect(argsDe('bodyRemove')[0]![1]).toBe(a.handle);
    expect(world.getRigidBody(a.handle)).toBeNull();
    const vistos: unknown[] = [];
    world.forEachRigidBody((x: unknown) => vistos.push(x));
    expect(vistos).toEqual([b]);
  });

  it('`removeRigidBody(null)` não explode', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    expect(() => world.removeRigidBody(null)).not.toThrow();
  });

  it('`castRay` devolve collider e distância, sem normal', () => {
    const world = new World({ x: 0, y: 0, z: 0 });

    const acerto = world.castRay(RAIO, 20, false);

    expect(acerto!.toi).toBe(2.5);
    expect(acerto!.timeOfImpact).toBe(2.5);
    expect(acerto!.collider.handle).toBe(99);
    expect((acerto as { normal?: unknown }).normal).toBeUndefined();
  });

  it('`castRay` sem acerto devolve null', () => {
    hit = 0;
    const world = new World({ x: 0, y: 0, z: 0 });
    expect(world.castRay(RAIO, 20, false)).toBeNull();
  });
});

describe('RigidBody.mass (SPEC-0216)', () => {
  it('lê a massa pelo scratch', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const body = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: true });

    expect(body.mass()).toBe(MASSA_FALSA);
    expect(argsDe('bodyGet')[0]![2]).toBe(6); // código da massa
  });
});
