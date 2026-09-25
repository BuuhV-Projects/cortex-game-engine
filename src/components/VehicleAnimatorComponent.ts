import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { Component } from '../ecs/Component.js';

/** Estados de animação do piloto, na convenção de nomes de clipe (SPEC-0275). */
export const VEHICLE_ANIM_STATES = [
  'idle',
  'accelerate',
  'brake',
  'steer_left',
  'steer_right',
  'drift_left',
  'drift_right',
  'victory',
] as const;

/** Um estado de animação do piloto. */
export type VehicleAnimState = (typeof VEHICLE_ANIM_STATES)[number];

/**
 * Parâmetros contínuos de direção — o jogo (input ou IA) escreve uma vez por
 * frame; o {@link VehicleAnimatorComponent} e o {@link ProceduralDriverPoseComponent}
 * leem o MESMO objeto.
 */
export interface VehicleDriveParams {
  /** Velocidade de avanço, em m/s (negativa = ré). */
  speed: number;
  /** Esterço −1..1: −1 esquerda, +1 direita (convenção do input). */
  steer: number;
  /** Acelerador 0..1. */
  throttle: number;
  /** Freio 0..1. */
  brake: number;
  /** Drift −1..1: 0 sem drift; o sinal é o lado (−1 esquerda). */
  drift: number;
}

/** Parâmetros zerados (kart parado). */
export function createDriveParams(): VehicleDriveParams {
  return { speed: 0, steer: 0, throttle: 0, brake: 0, drift: 0 };
}

/** Limiares da escolha de estado (ver `deriveVehicleAnimState`). */
export interface VehicleAnimThresholds {
  /** Acelerador/freio a partir do qual o pedal conta. */
  pedal: number;
  /** `|steer|` a partir do qual o piloto esterça. */
  steer: number;
  /** `|drift|` a partir do qual é drift. */
  drift: number;
  /** Velocidade mínima (m/s) para drift — parado não se derrapa. */
  minDriftSpeed: number;
}

/** Limiares padrão da SPEC-0275. */
export const DEFAULT_VEHICLE_ANIM_THRESHOLDS: Readonly<VehicleAnimThresholds> = {
  pedal: 0.2,
  steer: 0.25,
  drift: 0.3,
  minDriftSpeed: 2,
};

/** Duração padrão do crossfade entre estados, em segundos. */
const DEFAULT_CROSS_FADE = 0.25;

/** Opções do {@link VehicleAnimatorComponent}. */
export interface VehicleAnimatorOptions {
  /** Estado → nome do clipe. Default: o próprio nome do estado. */
  clipMap?: Partial<Record<VehicleAnimState, string>>;
  /** Parâmetros compartilhados. Default: um objeto novo zerado. */
  params?: VehicleDriveParams;
  /** Duração do crossfade, em segundos. Default `0.25`. */
  crossFade?: number;
  /** Limiares da escolha de estado. */
  thresholds?: Partial<VehicleAnimThresholds>;
}

/**
 * **Animação do piloto por estado de direção** (SPEC-0275). Usa um
 * `AnimationMixer` próprio (ADR-0274): o {@link VehicleDriverSystem} escolhe o
 * estado a partir de {@link params} (ou de {@link forcedState}), faz o
 * crossfade por peso e avança o mixer no loop da engine.
 *
 * Estados sem clipe caem num parecido (`drift_x → steer_x → idle`, o resto
 * `→ idle`). `victory` toca uma vez e congela no último quadro.
 *
 * @example
 * const gltf = await loader.loadGLTF('piloto.glb');
 * const anim = new VehicleAnimatorComponent(gltf.scene, gltf.animations);
 * entity.addComponent(anim);
 * // no loop do jogo:
 * anim.params.throttle = input.isKeyDown('w') ? 1 : 0;
 */
export class VehicleAnimatorComponent extends Component {
  readonly mixer: AnimationMixer;
  /** Actions por estado (só os estados com clipe no asset). */
  readonly actions = new Map<VehicleAnimState, AnimationAction>();
  readonly params: VehicleDriveParams;
  readonly thresholds: VehicleAnimThresholds;
  /** Duração do crossfade, em segundos (editável ao vivo). */
  crossFade: number;
  /** Força um estado (seleção manual, vitória). `null` = automático. */
  forcedState: VehicleAnimState | null = null;
  /** Estado lógico atual (escrito pelo sistema). */
  state: VehicleAnimState | null = null;
  /** Nome do clipe tocando agora (escrito pelo sistema). */
  activeClip: string | null = null;

  /**
   * @param root - Raiz do piloto (a cena do GLB); o mixer anima a hierarquia dela.
   * @param clips - Clipes do GLB (`gltf.animations`).
   */
  constructor(root: Object3D, clips: readonly AnimationClip[], options: VehicleAnimatorOptions = {}) {
    super();
    this.mixer = new AnimationMixer(root);
    this.params = options.params ?? createDriveParams();
    this.crossFade = options.crossFade ?? DEFAULT_CROSS_FADE;
    this.thresholds = { ...DEFAULT_VEHICLE_ANIM_THRESHOLDS, ...options.thresholds };
    for (const state of VEHICLE_ANIM_STATES) {
      const clipName = options.clipMap?.[state] ?? state;
      const clip = clips.find((c) => c.name === clipName);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      const once = state === 'victory';
      action.setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = once;
      action.setEffectiveWeight(0);
      this.actions.set(state, action);
    }
  }
}
