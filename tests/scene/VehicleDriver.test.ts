/**
 * Testes da convenção de asset do piloto no veículo (SPEC-0275 §6):
 * `validateVehicleAssets` + `setupVehicleDriver`.
 */
import { describe, it, expect, vi } from 'vitest';
import { AnimationClip, Bone, Group, Object3D } from 'three';
import { World } from '../../src/ecs/World.js';
import {
  DRIVER_BONES,
  KART_ANCHORS,
  formatVehicleAssetReport,
  setupVehicleDriver,
  validateVehicleAssets,
} from '../../src/scene/VehicleDriver.js';
import { VEHICLE_ANIM_STATES } from '../../src/components/VehicleAnimatorComponent.js';
import { VehicleDriverSystem } from '../../src/systems/VehicleDriverSystem.js';

function kart(anchors: readonly string[] = KART_ANCHORS): Group {
  const k = new Group();
  for (const name of anchors) {
    const o = new Object3D();
    o.name = name;
    k.add(o);
  }
  return k;
}

function driver(bones: readonly string[] = DRIVER_BONES): Group {
  const root = new Group();
  for (const name of bones) {
    const b = new Bone();
    b.name = name;
    root.add(b);
  }
  return root;
}

const clips = (names: readonly string[] = VEHICLE_ANIM_STATES) => names.map((n) => new AnimationClip(n, 1, []));

describe('validateVehicleAssets', () => {
  it('asset na convenção = ok', () => {
    const r = validateVehicleAssets({ vehicle: kart(), driver: driver(), clips: clips() });
    expect(r.ok).toBe(true);
    expect(r.anchors.found).toHaveLength(KART_ANCHORS.length);
    expect(formatVehicleAssetReport(r)).toContain('anchors: 6/6 ✓');
  });

  it('lista o que falta e o que existe', () => {
    const r = validateVehicleAssets({
      vehicle: kart(['assento', 'volante']),
      driver: driver(['Head', 'mixamorigSpine']),
      clips: clips(['idle', 'Run']),
    });
    expect(r.ok).toBe(false);
    expect(r.anchors.missing).toContain('roda_frente_esquerda');
    expect(r.bones.missing).toContain('Spine');
    expect(r.bones.available).toEqual(['Head', 'mixamorigSpine']);
    expect(r.clips.missing).toContain('victory');
    const text = formatVehicleAssetReport(r);
    expect(text).toContain('mixamorigSpine');
    expect(text).toContain('faltam:');
  });

  it('bone só conta se for Bone (não um mesh com o mesmo nome)', () => {
    const d = new Group();
    const fake = new Object3D();
    fake.name = 'Head';
    d.add(fake);
    expect(validateVehicleAssets({ vehicle: kart(), driver: d, clips: [] }).bones.missing).toContain('Head');
  });
});

describe('setupVehicleDriver', () => {
  it('cria a entidade, compartilha params e registra o sistema uma vez', () => {
    const world = new World();
    const a = setupVehicleDriver(world, { vehicle: kart(), driver: driver(), clips: clips() });
    setupVehicleDriver(world, { vehicle: kart(), driver: driver(), clips: clips() });
    expect(a.animator.params).toBe(a.params);
    expect(a.pose.params).toBe(a.params);
    expect(world.hasSystem(VehicleDriverSystem)).toBe(true);
    expect(world.query().length).toBe(2);
    world.tick(16);
    expect(a.seat.seat?.name).toBe('assento');
  });

  it('assento ausente lança no carregamento com o relatório', () => {
    expect(() => setupVehicleDriver(new World(), { vehicle: kart(['volante']), driver: driver(), clips: clips() })).toThrow(
      /assento.*\n.*anchors: 1\/6/s,
    );
  });

  it('outros itens ausentes só avisam', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = setupVehicleDriver(new World(), { vehicle: kart(['assento']), driver: driver([]), clips: [] });
    expect(h.report.ok).toBe(false);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
