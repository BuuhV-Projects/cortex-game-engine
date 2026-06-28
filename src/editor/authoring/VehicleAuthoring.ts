import type { Object3D } from 'three';
import type { VehicleApi, VehicleEditState } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';
import { debug } from '../../core/debug.js';

/** Defaults (batem com os defaults do engine) pra preencher o que faltar. */
const DEFAULTS: VehicleEditState = {
  engineForce: 5000,
  maxBrake: 50,
  handbrakeForce: 120,
  rollingResistance: 4,
  maxSteer: 0.7,
  mass: 1200,
  frictionSlip: 2.5,
  suspensionStiffness: 24,
  suspensionRestLength: 0.3,
  comY: 0,
  comZ: 0,
  maxSpeed: 260,
  engineSound: '',
};

type Cfg = Record<string, unknown> & { centerOfMass?: { x?: number; y?: number; z?: number } };

function n(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Autoria do **veículo** (ADR-0081) — seção "Veículo" do Inspector. Lê a config efetiva
 * do nó (marcado com `userData.cortexVehicle` pelo {@link buildScene}, já mesclado com o
 * overlay) e grava as edições em `data.vehicle[id]`. Aplica ao recarregar/play (o jogo lê
 * a config ao criar o veículo). `comY`/`comZ` mapeiam pra `chassisOffset.y/.z` (centro de
 * massa: altura / frente-trás).
 */
export function createVehicleApi(ctx: EditorAuthoringContext): VehicleApi {
  const store = (): Record<string, Cfg> => ctx.record<Cfg>('vehicle');
  const baseOf = (obj: Object3D): Cfg | null => {
    const b = (obj.userData as Record<string, unknown>)['cortexVehicle'];
    return b && typeof b === 'object' ? (b as Cfg) : null;
  };

  return {
    get(obj: Object3D): VehicleEditState | null {
      const base = baseOf(obj);
      if (!base) return null; // não é um veículo
      const merged: Cfg = { ...base, ...store()[obj.name] };
      const co = merged.centerOfMass ?? {};
      return {
        engineForce: n(merged['engineForce'], DEFAULTS.engineForce),
        maxBrake: n(merged['maxBrake'], DEFAULTS.maxBrake),
        handbrakeForce: n(merged['handbrakeForce'], DEFAULTS.handbrakeForce),
        rollingResistance: n(merged['rollingResistance'], DEFAULTS.rollingResistance),
        maxSteer: n(merged['maxSteer'], DEFAULTS.maxSteer),
        mass: n(merged['mass'], DEFAULTS.mass),
        frictionSlip: n(merged['frictionSlip'], DEFAULTS.frictionSlip),
        suspensionStiffness: n(merged['suspensionStiffness'], DEFAULTS.suspensionStiffness),
        suspensionRestLength: n(merged['suspensionRestLength'], DEFAULTS.suspensionRestLength),
        comY: n(co.y, DEFAULTS.comY),
        comZ: n(co.z, DEFAULTS.comZ),
        maxSpeed: n(merged['maxSpeed'], DEFAULTS.maxSpeed),
        engineSound: typeof merged['engineSound'] === 'string' ? (merged['engineSound'] as string) : '',
      };
    },

    set(obj: Object3D, key: keyof VehicleEditState, value: number): void {
      if (!obj.name) return;
      const rec = store();
      const cfg: Cfg = rec[obj.name] ?? (rec[obj.name] = {});
      const live = baseOf(obj) ?? ((obj.userData as Record<string, unknown>)['cortexVehicle'] = {} as Cfg);

      if (key === 'comY' || key === 'comZ') {
        const axis = key === 'comY' ? 'y' : 'z';
        cfg.centerOfMass = { ...(cfg.centerOfMass ?? live.centerOfMass ?? {}), [axis]: value };
        live.centerOfMass = { ...(live.centerOfMass ?? {}), [axis]: value };
      } else {
        cfg[key] = value;
        live[key] = value;
      }
      ctx.persist();
    },

    importSound(obj: Object3D, name: string, dataUrl: string): void {
      if (typeof fetch === 'undefined' || !obj.name) return;
      void (async () => {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const res = await fetch(`/__upload-asset?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
          if (!res.ok) throw new Error(await res.text());
          const path = (await res.text()).trim();
          const rec = store();
          const cfg: Cfg = rec[obj.name] ?? (rec[obj.name] = {});
          cfg['engineSound'] = path;
          const live = baseOf(obj) ?? ((obj.userData as Record<string, unknown>)['cortexVehicle'] = {} as Cfg);
          live['engineSound'] = path;
          ctx.persist(true);
        } catch (e) {
          debug('editor', 'falha ao importar áudio do motor:', e);
        }
      })();
    },
  };
}
