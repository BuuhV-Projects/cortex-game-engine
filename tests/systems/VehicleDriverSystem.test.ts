/**
 * Testes do piloto no veículo (SPEC-0275): escolha de estado, fallback de clipe,
 * crossfade por peso, assento e pose procedural aditiva. Rig sintético (bones +
 * clipes gerados) — a math do mixer roda em node sem WebGPU.
 */
import { describe, it, expect, vi } from 'vitest';
import { AnimationClip, Bone, Group, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { World } from '../../src/ecs/World.js';
import {
  VehicleAnimatorComponent,
  DEFAULT_VEHICLE_ANIM_THRESHOLDS,
  createDriveParams,
  type VehicleAnimState,
} from '../../src/components/VehicleAnimatorComponent.js';
import { VehicleSeatAttachmentComponent } from '../../src/components/VehicleSeatAttachmentComponent.js';
import { ProceduralDriverPoseComponent } from '../../src/components/ProceduralDriverPoseComponent.js';
import {
  VehicleDriverSystem,
  attachToSeat,
  deriveVehicleAnimState,
  resolveVehicleAnimState,
} from '../../src/systems/VehicleDriverSystem.js';

const FRAME_MS = 1000 / 60;
const T = DEFAULT_VEHICLE_ANIM_THRESHOLDS;

/** Piloto: root → Hips → Spine → Chest → Head. */
function makeDriver(names = ['Hips', 'Spine', 'Chest', 'Head']): { root: Group; bones: Record<string, Bone> } {
  const root = new Group();
  const bones: Record<string, Bone> = {};
  let parent: Object3D = root;
  for (const name of names) {
    const b = new Bone();
    b.name = name;
    b.position.y = 0.2;
    parent.add(b);
    bones[name] = b;
    parent = b;
  }
  return { root, bones };
}

/** Clipe que segura `Chest` numa rotação fixa (marca qual clipe está tocando). */
function clip(name: string, angle = 0): AnimationClip {
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);
  const values = [...q.toArray(), ...q.toArray()];
  return new AnimationClip(name, 1, [new QuaternionKeyframeTrack('Chest.quaternion', [0, 1], values)]);
}

function run(world: World, frames: number): void {
  for (let i = 0; i < frames; i++) world.tick(FRAME_MS);
}

describe('deriveVehicleAnimState', () => {
  const p = (o: Partial<ReturnType<typeof createDriveParams>>) => ({ ...createDriveParams(), ...o });

  it('parado = idle; acelerador = accelerate', () => {
    expect(deriveVehicleAnimState(p({}), T)).toBe('idle');
    expect(deriveVehicleAnimState(p({ throttle: 1 }), T)).toBe('accelerate');
  });

  it('esterço vence acelerador; freio vence esterço', () => {
    expect(deriveVehicleAnimState(p({ throttle: 1, steer: -1 }), T)).toBe('steer_left');
    expect(deriveVehicleAnimState(p({ throttle: 1, steer: 1 }), T)).toBe('steer_right');
    expect(deriveVehicleAnimState(p({ steer: 1, brake: 1 }), T)).toBe('brake');
  });

  it('drift só com velocidade, e vence tudo', () => {
    expect(deriveVehicleAnimState(p({ drift: -1, brake: 1, speed: 10 }), T)).toBe('drift_left');
    expect(deriveVehicleAnimState(p({ drift: 1, speed: 10 }), T)).toBe('drift_right');
    expect(deriveVehicleAnimState(p({ drift: 1, speed: 0, steer: 1 }), T)).toBe('steer_right');
  });
});

describe('resolveVehicleAnimState', () => {
  it('drift sem clipe cai no esterço, depois no idle', () => {
    const has = (list: VehicleAnimState[]) => new Set(list);
    expect(resolveVehicleAnimState(has(['idle', 'steer_left']), 'drift_left')).toBe('steer_left');
    expect(resolveVehicleAnimState(has(['idle']), 'drift_left')).toBe('idle');
    expect(resolveVehicleAnimState(has([]), 'brake')).toBeNull();
  });
});

describe('VehicleSeatAttachmentComponent', () => {
  function kart(): Group {
    const k = new Group();
    k.name = 'kart';
    const seat = new Object3D();
    seat.name = 'assento';
    k.add(seat);
    return k;
  }

  it('parenteia no assento e aplica offset/rotação/escala ao vivo', () => {
    const world = new World();
    world.addSystem(new VehicleDriverSystem());
    const k = kart();
    const driver = new Group();
    const c = new VehicleSeatAttachmentComponent(k, 'assento', driver, { offset: { x: 0, y: 0.1, z: -0.2 }, scale: 2 });
    world.createEntity().addComponent(c);
    run(world, 1);
    expect(driver.parent?.name).toBe('assento');
    expect(driver.position.toArray()).toEqual([0, 0.1, -0.2]);
    expect(driver.scale.x).toBe(2);
    c.rotation.y = 0.5;
    run(world, 1);
    expect(driver.rotation.y).toBe(0.5);
  });

  it('anchor ausente: erro claro uma vez, sem lançar', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const world = new World();
    world.addSystem(new VehicleDriverSystem());
    const c = new VehicleSeatAttachmentComponent(kart(), 'banco', new Group());
    world.createEntity().addComponent(c);
    expect(() => run(world, 3)).not.toThrow();
    expect(c.error).toContain('"banco"');
    expect(c.error).toContain('assento'); // lista o que existe
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('attachToSeat lança com os nomes do veículo', () => {
    expect(() => attachToSeat(kart(), 'banco', new Group())).toThrow(/banco.*assento/);
  });
});

describe('VehicleAnimatorComponent', () => {
  const ALL = ['idle', 'accelerate', 'brake', 'steer_left', 'steer_right', 'drift_left', 'drift_right', 'victory'];

  function setup(names = ALL) {
    const { root } = makeDriver();
    const anim = new VehicleAnimatorComponent(root, names.map((n) => clip(n)), { crossFade: 0.25 });
    const world = new World();
    world.addSystem(new VehicleDriverSystem());
    world.createEntity().addComponent(anim);
    return { world, anim, weight: (s: VehicleAnimState) => anim.actions.get(s)!.getEffectiveWeight() };
  }

  it('entra em idle e faz crossfade gradual para accelerate', () => {
    const { world, anim, weight } = setup();
    run(world, 30);
    expect(anim.activeClip).toBe('idle');
    expect(weight('idle')).toBe(1);
    anim.params.throttle = 1;
    run(world, 6); // 0,1 s de 0,25 s
    expect(anim.state).toBe('accelerate');
    expect(weight('accelerate')).toBeGreaterThan(0.3);
    expect(weight('accelerate')).toBeLessThan(0.5);
    run(world, 20);
    expect(weight('accelerate')).toBe(1);
    expect(weight('idle')).toBe(0);
    expect(anim.actions.get('idle')!.isScheduled()).toBe(false);
  });

  it('trocar de estado no meio do fade não dá salto de peso', () => {
    const { world, anim, weight } = setup();
    run(world, 30);
    const maxStep = FRAME_MS / 1000 / anim.crossFade + 1e-9;
    let prev = weight('idle');
    for (let i = 0; i < 60; i++) {
      anim.params.steer = i % 4 < 2 ? 1 : 0; // esterço cruzando o limiar a 15 Hz
      run(world, 1);
      const w = weight('idle');
      expect(Math.abs(w - prev)).toBeLessThanOrEqual(maxStep);
      const sum = [...anim.actions.values()].reduce((s, a) => s + a.getEffectiveWeight(), 0);
      expect(sum).toBeLessThanOrEqual(1 + 1e-9);
      prev = w;
    }
  });

  it('estado sem clipe usa o fallback; forcedState vence os parâmetros', () => {
    const { world, anim } = setup(['idle', 'steer_right', 'victory']);
    anim.params.drift = 1;
    anim.params.speed = 10;
    run(world, 2);
    expect(anim.state).toBe('drift_right');
    expect(anim.activeClip).toBe('steer_right');
    anim.forcedState = 'victory';
    run(world, 2);
    expect(anim.activeClip).toBe('victory');
  });

  it('clipMap mapeia estado para outro nome de clipe', () => {
    const { root } = makeDriver();
    const anim = new VehicleAnimatorComponent(root, [clip('Parado')], { clipMap: { idle: 'Parado' } });
    const world = new World();
    world.addSystem(new VehicleDriverSystem());
    world.createEntity().addComponent(anim);
    run(world, 1);
    expect(anim.activeClip).toBe('Parado');
  });
});

describe('ProceduralDriverPoseComponent', () => {
  /** Direção "frente" (+Z) da cabeça, no mundo. */
  const headForward = (b: Bone) => new Vector3(0, 0, 1).applyQuaternion(b.getWorldQuaternion(new Quaternion()));
  /** Direção "cima" (+Y) do peito, no mundo. */
  const chestUp = (b: Bone) => new Vector3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new Quaternion()));

  function setup(opts: { withClip?: boolean; names?: string[] } = {}) {
    const { root, bones } = makeDriver(opts.names);
    const params = createDriveParams();
    const pose = new ProceduralDriverPoseComponent(root, params);
    const world = new World();
    world.addSystem(new VehicleDriverSystem());
    const e = world.createEntity().addComponent(pose);
    if (opts.withClip) e.addComponent(new VehicleAnimatorComponent(root, [clip('idle', 0.3)], { params }));
    return { world, pose, params, bones };
  }

  it('curva à direita: cabeça olha para a direita (−X) e o peito inclina para a direita', () => {
    const { world, params, bones } = setup();
    params.steer = 1;
    params.speed = 20;
    run(world, 120);
    expect(headForward(bones['Head']!).x).toBeLessThan(0);
    expect(chestUp(bones['Chest']!).x).toBeLessThan(0);
  });

  it('respeita o limite de inclinação do corpo', () => {
    const { world, pose, params, bones } = setup();
    params.steer = 1;
    params.drift = 1;
    params.speed = 50;
    run(world, 300);
    const up = chestUp(bones['Chest']!);
    const tilt = Math.acos(Math.min(1, up.y));
    expect(tilt).toBeLessThanOrEqual(pose.limits.maxRoll + 1e-4);
    expect(tilt).toBeGreaterThan(pose.limits.maxRoll * 0.9);
  });

  it('bone sem track não acumula: estável em regime e volta ao repouso', () => {
    const { world, params, bones } = setup();
    params.steer = 1;
    params.speed = 20;
    run(world, 300);
    const settled = bones['Spine']!.quaternion.clone();
    run(world, 60);
    expect(bones['Spine']!.quaternion.angleTo(settled)).toBeLessThan(1e-6);
    params.steer = 0;
    run(world, 300);
    expect(bones['Spine']!.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-4);
  });

  it('bone animado: a aditiva vai por cima do clipe a cada frame, sem acumular', () => {
    const { world, params, bones } = setup({ withClip: true });
    params.steer = 1;
    params.speed = 20;
    run(world, 300);
    const a = bones['Chest']!.quaternion.clone();
    run(world, 60);
    expect(bones['Chest']!.quaternion.angleTo(a)).toBeLessThan(1e-6);
    // difere do clipe puro (0,3 rad em X) — a aditiva está aplicada
    const clipOnly = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.3);
    expect(bones['Chest']!.quaternion.angleTo(clipOnly)).toBeGreaterThan(0.01);
  });

  it('bone ausente é ignorado sem quebrar', () => {
    const { world, pose, params } = setup({ names: ['Hips', 'Spine'] });
    params.steer = 1;
    params.speed = 20;
    expect(() => run(world, 10)).not.toThrow();
    expect(pose.missingBones).toEqual(['Chest', 'Head']);
  });
});
