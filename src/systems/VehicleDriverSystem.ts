import { Euler, LoopOnce, Quaternion, type Bone, type Object3D } from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import { VehicleSeatAttachmentComponent } from '../components/VehicleSeatAttachmentComponent.js';
import {
  VehicleAnimatorComponent,
  type VehicleAnimState,
  type VehicleAnimThresholds,
  type VehicleDriveParams,
} from '../components/VehicleAnimatorComponent.js';
import { ProceduralDriverPoseComponent, type DriverPoseBoneState } from '../components/ProceduralDriverPoseComponent.js';

/** Quantos nomes do veículo a mensagem de anchor ausente lista. */
const MAX_LISTED_NAMES = 40;

/** Peso do esterço e do drift na inclinação do corpo (somam 1). */
const STEER_ROLL = 0.6;
const DRIFT_ROLL = 0.4;
/** Peso do acelerador na inclinação para trás (o freio pesa 1). */
const THROTTLE_PITCH = 0.6;
/** Peso do esterço e do drift no giro da cabeça (somam 1). */
const STEER_HEAD = 0.7;
const DRIFT_HEAD = 0.3;
/** Divisão da inclinação do corpo entre Spine e Chest (somam 1). */
const SPINE_SHARE = 0.4;
const CHEST_SHARE = 0.6;

/** Ms → s (o `World.tick` recebe ms). */
const MS_PER_SECOND = 1000;

/** Fallback de estado sem clipe (SPEC-0275 §3). */
const FALLBACKS: Record<VehicleAnimState, readonly VehicleAnimState[]> = {
  idle: ['idle'],
  accelerate: ['accelerate', 'idle'],
  brake: ['brake', 'idle'],
  steer_left: ['steer_left', 'idle'],
  steer_right: ['steer_right', 'idle'],
  drift_left: ['drift_left', 'steer_left', 'idle'],
  drift_right: ['drift_right', 'steer_right', 'idle'],
  victory: ['victory', 'idle'],
};

/**
 * Estado de animação a partir dos parâmetros de direção. Precedência: drift
 * (com velocidade) > freio > esterço > acelerador > idle.
 */
export function deriveVehicleAnimState(p: VehicleDriveParams, t: VehicleAnimThresholds): VehicleAnimState {
  if (Math.abs(p.drift) >= t.drift && Math.abs(p.speed) >= t.minDriftSpeed) {
    return p.drift < 0 ? 'drift_left' : 'drift_right';
  }
  if (p.brake >= t.pedal) return 'brake';
  if (Math.abs(p.steer) >= t.steer) return p.steer < 0 ? 'steer_left' : 'steer_right';
  if (p.throttle >= t.pedal) return 'accelerate';
  return 'idle';
}

/** Primeiro estado da cadeia de fallback que tem clipe, ou `null`. */
export function resolveVehicleAnimState(
  available: { has(state: VehicleAnimState): boolean },
  state: VehicleAnimState,
): VehicleAnimState | null {
  return FALLBACKS[state].find((s) => available.has(s)) ?? null;
}

/** Bone com esse nome exato dentro de `root`, ou `null`. */
export function findBone(root: Object3D, name: string): Bone | null {
  let found: Bone | null = null;
  root.traverse((o) => {
    if (!found && (o as Bone).isBone && o.name === name) found = o as Bone;
  });
  return found;
}

/** Nomes não vazios da hierarquia (para mensagens e relatórios). */
export function objectNames(root: Object3D, filter: (o: Object3D) => boolean = () => true): string[] {
  const names: string[] = [];
  root.traverse((o) => {
    if (o.name && o !== root && filter(o)) names.push(o.name);
  });
  return names;
}

function seatError(vehicle: Object3D, seatName: string): string {
  const names = objectNames(vehicle);
  const listed = names.slice(0, MAX_LISTED_NAMES).join(', ') || '(nenhum objeto nomeado)';
  const more = names.length > MAX_LISTED_NAMES ? ` … +${names.length - MAX_LISTED_NAMES}` : '';
  return (
    `anchor de assento "${seatName}" não encontrado no veículo "${vehicle.name || '(sem nome)'}". ` +
    `Objetos no veículo: ${listed}${more}. Crie um empty "${seatName}" no .glb ou passe outro seatName.`
  );
}

/**
 * Parenteia `driver` no anchor `seatName` de `vehicle` e devolve o anchor.
 * **Lança** com os nomes disponíveis se o anchor não existir — use no
 * carregamento. Offset/rotação/escala ficam a cargo do componente.
 */
export function attachToSeat(vehicle: Object3D, seatName: string, driver: Object3D): Object3D {
  const seat = vehicle.getObjectByName(seatName);
  if (!seat) throw new Error(`[VehicleSeat] ${seatError(vehicle, seatName)}`);
  seat.add(driver);
  return seat;
}

/** Move `value` até `target` em no máximo `step`. */
function approach(value: number, target: number, step: number): number {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

function clampUnit(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function updateSeat(c: VehicleSeatAttachmentComponent): void {
  if (!c.seat) {
    if (c.error) return;
    const seat = c.vehicle.getObjectByName(c.seatName);
    if (!seat) {
      c.error = seatError(c.vehicle, c.seatName);
      console.error(`[VehicleSeat] ${c.error}`);
      return;
    }
    c.seat = seat;
  }
  if (c.driver.parent !== c.seat) c.seat.add(c.driver);
  c.driver.position.copy(c.offset);
  c.driver.rotation.copy(c.rotation);
  c.driver.scale.copy(c.scale);
}

function updateAnimator(c: VehicleAnimatorComponent, dt: number): void {
  const wanted = c.forcedState ?? deriveVehicleAnimState(c.params, c.thresholds);
  const changed = wanted !== c.state;
  c.state = wanted;
  const resolved = resolveVehicleAnimState(c.actions, wanted);
  const active = resolved ? c.actions.get(resolved)! : null;
  // Clipe de uma vez (vitória) recomeça ao entrar no estado; os em loop seguem
  // de onde estavam se ainda estavam saindo do fade.
  if (active && (!active.isScheduled() || (changed && active.loop === LoopOnce))) active.reset().play();

  // Crossfade por peso (ADR-0274 §2): contínuo para qualquer sequência de trocas.
  const step = c.crossFade > 0 ? dt / c.crossFade : 1;
  for (const action of c.actions.values()) {
    const weight = approach(action.getEffectiveWeight(), action === active ? 1 : 0, step);
    action.setEffectiveWeight(weight);
    if (weight === 0 && action.isScheduled()) action.stop();
  }
  c.activeClip = active ? active.getClip().name : null;
  c.mixer.update(dt);
}

const _euler = new Euler();
const _qModel = new Quaternion();
const _qRoot = new Quaternion();
const _qParent = new Quaternion();
const _qTmp = new Quaternion();

/**
 * Aplica uma rotação (`x` pitch, `y` yaw, `z` roll — rad, no referencial de
 * `root`) por cima do quaternion que o mixer deixou no bone. Desfaz a aditiva do
 * frame anterior quando o mixer não reescreveu o bone (senão acumularia).
 */
function applyAdditiveRotation(root: Object3D, st: DriverPoseBoneState, x: number, y: number, z: number): void {
  const bone = st.bone;
  if (st.hasApplied && bone.quaternion.equals(st.applied)) bone.quaternion.copy(st.base);
  st.base.copy(bone.quaternion);
  _qModel.setFromEuler(_euler.set(x, y, z, 'YXZ'));
  root.getWorldQuaternion(_qRoot);
  if (bone.parent) bone.parent.getWorldQuaternion(_qParent);
  else _qParent.identity();
  // delta local = pai⁻¹ · (raiz · modelo · raiz⁻¹) · pai
  _qTmp.copy(_qRoot).invert();
  _qModel.premultiply(_qRoot).multiply(_qTmp);
  _qTmp.copy(_qParent).invert();
  _qModel.premultiply(_qTmp).multiply(_qParent);
  bone.quaternion.premultiply(_qModel);
  st.applied.copy(bone.quaternion);
  st.hasApplied = true;
}

function boneState(root: Object3D, name: string, missing: string[]): DriverPoseBoneState | null {
  const bone = findBone(root, name);
  if (!bone) {
    missing.push(name);
    return null;
  }
  return { bone, base: new Quaternion(), applied: new Quaternion(), hasApplied: false };
}

function updatePose(c: ProceduralDriverPoseComponent, dt: number): void {
  if (!c.bones) {
    c.missingBones = [];
    c.bones = {
      spine: boneState(c.root, c.boneNames.spine, c.missingBones),
      chest: boneState(c.root, c.boneNames.chest, c.missingBones),
      head: boneState(c.root, c.boneNames.head, c.missingBones),
    };
  }
  const p = c.params;
  const L = c.limits;
  const intensity = c.speedRef > 0 ? Math.min(1, Math.abs(p.speed) / c.speedRef) : 1;
  const roll = clampUnit(p.steer * STEER_ROLL + p.drift * DRIFT_ROLL) * L.maxRoll * intensity;
  const pitch = clampUnit(p.brake - p.throttle * THROTTLE_PITCH) * L.maxPitch * intensity;
  const headYaw = -clampUnit(p.steer * STEER_HEAD + p.drift * DRIFT_HEAD) * L.maxHeadYaw;
  const headRoll = L.maxRoll > 0 ? -clampUnit(roll / L.maxRoll) * L.maxHeadRoll : 0;

  const k = 1 - Math.exp(-c.smoothing * dt);
  const cur = c.current;
  cur.roll += (roll - cur.roll) * k;
  cur.pitch += (pitch - cur.pitch) * k;
  cur.headYaw += (headYaw - cur.headYaw) * k;
  cur.headRoll += (headRoll - cur.headRoll) * k;

  // Pai antes do filho: a conversão de cada bone lê o mundo do pai já inclinado.
  const { spine, chest, head } = c.bones;
  if (spine) applyAdditiveRotation(c.root, spine, cur.pitch * SPINE_SHARE, 0, cur.roll * SPINE_SHARE);
  if (chest) applyAdditiveRotation(c.root, chest, cur.pitch * CHEST_SHARE, 0, cur.roll * CHEST_SHARE);
  if (head) applyAdditiveRotation(c.root, head, 0, cur.headYaw, cur.headRoll);
}

/**
 * **Piloto no veículo** (SPEC-0275): por entidade, na ordem fixa
 * assento ({@link VehicleSeatAttachmentComponent}) → animação
 * ({@link VehicleAnimatorComponent}) → pose ({@link ProceduralDriverPoseComponent}).
 * Cada componente é opcional. Prioridade 55: depois de quem escreve os
 * parâmetros (input 30, scripts de IA 50).
 */
export class VehicleDriverSystem extends System {
  // Cada componente é opcional: o filtro é por entidade, dentro do update.
  static override requiredComponents = [];
  override priority = 55;

  constructor(pauseWhen?: () => boolean) {
    super();
    this.pauseWhen = pauseWhen;
  }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / MS_PER_SECOND;
    for (const e of entities) {
      const seat = e.getComponent(VehicleSeatAttachmentComponent);
      if (seat?.enabled) updateSeat(seat);
      const anim = e.getComponent(VehicleAnimatorComponent);
      if (anim?.enabled) updateAnimator(anim, dt);
      const pose = e.getComponent(ProceduralDriverPoseComponent);
      if (pose?.enabled) updatePose(pose, dt);
    }
  }
}
