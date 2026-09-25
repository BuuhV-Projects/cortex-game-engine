import type { AnimationClip, Bone, Object3D } from 'three';
import type { World } from '../ecs/World.js';
import type { Entity } from '../ecs/Entity.js';
import {
  DEFAULT_SEAT_ANCHOR,
  VehicleSeatAttachmentComponent,
  type VehicleSeatOptions,
} from '../components/VehicleSeatAttachmentComponent.js';
import {
  VEHICLE_ANIM_STATES,
  VehicleAnimatorComponent,
  createDriveParams,
  type VehicleAnimState,
  type VehicleAnimatorOptions,
  type VehicleDriveParams,
} from '../components/VehicleAnimatorComponent.js';
import { ProceduralDriverPoseComponent, type DriverPoseOptions } from '../components/ProceduralDriverPoseComponent.js';
import { VehicleDriverSystem, objectNames } from '../systems/VehicleDriverSystem.js';

/** Anchors obrigatórios do kart (SPEC-0275 §6). */
export const KART_ANCHORS = [
  'assento',
  'volante',
  'roda_frente_esquerda',
  'roda_frente_direita',
  'roda_traseira_esquerda',
  'roda_traseira_direita',
] as const;

/** Bones obrigatórios do piloto (SPEC-0275 §6). */
export const DRIVER_BONES = ['Head', 'Spine', 'Chest', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot'] as const;

/** Achados de uma categoria do relatório. */
export interface AssetCheck {
  found: string[];
  missing: string[];
  /** Tudo o que o asset tem nessa categoria — para o autor renomear. */
  available: string[];
}

/** Relatório de {@link validateVehicleAssets}. */
export interface VehicleAssetReport {
  anchors: AssetCheck;
  bones: AssetCheck;
  clips: AssetCheck;
  /** `true` se nada da convenção falta. */
  ok: boolean;
}

function check(required: readonly string[], available: string[]): AssetCheck {
  const have = new Set(available);
  return {
    found: required.filter((n) => have.has(n)),
    missing: required.filter((n) => !have.has(n)),
    available,
  };
}

/**
 * Confere kart e piloto contra a convenção da SPEC-0275: anchors do veículo,
 * bones do piloto e clipes com os nomes dos estados. Não lança — devolve o
 * relatório (ver {@link formatVehicleAssetReport}).
 */
export function validateVehicleAssets(assets: {
  vehicle: Object3D;
  driver: Object3D;
  clips: readonly AnimationClip[];
  /** Estado → nome do clipe, se o asset usa outros nomes. */
  clipMap?: Partial<Record<VehicleAnimState, string>>;
  /** Anchor do assento, se não for `'assento'`. */
  seatName?: string;
}): VehicleAssetReport {
  const anchorsRequired = KART_ANCHORS.map((n) => (n === DEFAULT_SEAT_ANCHOR ? (assets.seatName ?? n) : n));
  const anchors = check(anchorsRequired, objectNames(assets.vehicle));
  const bones = check(DRIVER_BONES, objectNames(assets.driver, (o) => !!(o as Bone).isBone));
  const clipNames = assets.clips.map((c) => c.name);
  const clipsRequired = VEHICLE_ANIM_STATES.map((s) => assets.clipMap?.[s] ?? s);
  const clips = check(clipsRequired, clipNames);
  return { anchors, bones, clips, ok: !anchors.missing.length && !bones.missing.length && !clips.missing.length };
}

/** Relatório em texto (log e painel de dev). */
export function formatVehicleAssetReport(r: VehicleAssetReport): string {
  const line = (label: string, c: AssetCheck): string =>
    `${label}: ${c.found.length}/${c.found.length + c.missing.length}` +
    (c.missing.length ? ` — faltam: ${c.missing.join(', ')}` : ' ✓');
  const lines = [line('anchors', r.anchors), line('bones', r.bones), line('clipes', r.clips)];
  if (r.anchors.missing.length) lines.push(`  objetos no veículo: ${r.anchors.available.join(', ') || '(nenhum)'}`);
  if (r.bones.missing.length) lines.push(`  bones no piloto: ${r.bones.available.join(', ') || '(nenhum)'}`);
  if (r.clips.missing.length) lines.push(`  clipes no piloto: ${r.clips.available.join(', ') || '(nenhum)'}`);
  return lines.join('\n');
}

/** Config do {@link setupVehicleDriver}. */
export interface VehicleDriverConfig {
  /** Raiz do veículo (cena do GLB do kart). */
  vehicle: Object3D;
  /** Raiz do piloto (cena do GLB do piloto). */
  driver: Object3D;
  /** Clipes do piloto (`gltf.animations`), baked com mãos/pés (sem IK). */
  clips: readonly AnimationClip[];
  /** Anchor do assento. Default `'assento'`. */
  seatName?: string;
  seat?: VehicleSeatOptions;
  animator?: Omit<VehicleAnimatorOptions, 'params'>;
  pose?: DriverPoseOptions;
  /** Parâmetros compartilhados. Default: um objeto novo zerado. */
  params?: VehicleDriveParams;
  /** Pausa do sistema (ex.: `() => game.editorActive || game.gameplayPaused`). */
  pauseWhen?: () => boolean;
}

/** Handle de {@link setupVehicleDriver}. */
export interface VehicleDriverHandle {
  entity: Entity;
  /** Escreva aqui a cada frame (input ou IA). */
  params: VehicleDriveParams;
  report: VehicleAssetReport;
  seat: VehicleSeatAttachmentComponent;
  animator: VehicleAnimatorComponent;
  pose: ProceduralDriverPoseComponent;
}

/**
 * **Liga um piloto num veículo com uma chamada** (SPEC-0275): valida a
 * convenção, senta o piloto (lança se o assento faltar, com o relatório), cria a
 * entidade com assento + animador + pose sobre um `params` compartilhado e
 * registra o {@link VehicleDriverSystem} se ainda não houver.
 *
 * @example
 * const kart = await loader.loadGLTF('kart.glb');
 * const piloto = await loader.loadGLTF('piloto.glb');
 * game.scene.add(kart.scene);
 * const driver = setupVehicleDriver(game.world, {
 *   vehicle: kart.scene, driver: piloto.scene, clips: piloto.animations,
 *   pauseWhen: () => game.editorActive || game.gameplayPaused,
 * });
 * game.onUpdate(() => { driver.params.throttle = game.input.isKeyDown('w') ? 1 : 0; });
 */
export function setupVehicleDriver(world: World, cfg: VehicleDriverConfig): VehicleDriverHandle {
  const seatName = cfg.seatName ?? DEFAULT_SEAT_ANCHOR;
  const report = validateVehicleAssets({ ...cfg, clipMap: cfg.animator?.clipMap, seatName });
  if (report.anchors.missing.includes(seatName)) {
    throw new Error(
      `[VehicleDriver] anchor de assento "${seatName}" não encontrado no veículo "${cfg.vehicle.name || '(sem nome)'}". ` +
        `Crie um empty "${seatName}" no .glb ou passe outro seatName.\n${formatVehicleAssetReport(report)}`,
    );
  }
  if (!report.ok) console.warn(`[VehicleDriver] asset fora da convenção (SPEC-0275):\n${formatVehicleAssetReport(report)}`);

  const params = cfg.params ?? createDriveParams();
  const seat = new VehicleSeatAttachmentComponent(cfg.vehicle, seatName, cfg.driver, cfg.seat);
  const animator = new VehicleAnimatorComponent(cfg.driver, cfg.clips, { ...cfg.animator, params });
  const pose = new ProceduralDriverPoseComponent(cfg.driver, params, cfg.pose);
  const entity = world.createEntity().addComponent(seat).addComponent(animator).addComponent(pose);
  if (!world.hasSystem(VehicleDriverSystem)) world.addSystem(new VehicleDriverSystem(cfg.pauseWhen));
  return { entity, params, report, seat, animator, pose };
}
