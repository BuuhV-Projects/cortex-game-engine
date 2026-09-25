import { Quaternion, type Bone, type Object3D } from 'three';
import { Component } from '../ecs/Component.js';
import { createDriveParams, type VehicleDriveParams } from './VehicleAnimatorComponent.js';

/** Limites da pose, em radianos: é o ângulo máximo que cada rotação atinge. */
export interface DriverPoseLimits {
  /** Inclinação lateral total do corpo (Spine + Chest). */
  maxRoll: number;
  /** Inclinação frente/trás total do corpo. */
  maxPitch: number;
  /** Giro da cabeça para a curva. */
  maxHeadYaw: number;
  /** Contra-inclinação da cabeça (nivela o olhar). */
  maxHeadRoll: number;
}

/**
 * Limites padrão da SPEC-0275 — ajuste fino: a curva do tronco e as mãos no
 * volante já vêm baked no clipe (sem IK em runtime, ADR-0274).
 */
export const DEFAULT_DRIVER_POSE_LIMITS: Readonly<DriverPoseLimits> = {
  maxRoll: 0.12,
  maxPitch: 0.08,
  maxHeadYaw: 0.3,
  maxHeadRoll: 0.08,
};

/** Nomes dos bones que a pose mexe (convenção do piloto). */
export interface DriverPoseBoneNames {
  head: string;
  spine: string;
  chest: string;
}

/** Velocidade (m/s) em que o corpo atinge a inclinação máxima. */
const DEFAULT_SPEED_REF = 12;
/** Taxa de suavização dos alvos, em 1/s. */
const DEFAULT_SMOOTHING = 8;

/** Opções do {@link ProceduralDriverPoseComponent}. */
export interface DriverPoseOptions {
  limits?: Partial<DriverPoseLimits>;
  bones?: Partial<DriverPoseBoneNames>;
  /** Velocidade (m/s) da inclinação máxima do corpo. Default `12`. */
  speedRef?: number;
  /** Suavização dos alvos, em 1/s. Default `8`. */
  smoothing?: number;
}

/** Estado por bone da aditiva (gerenciado pelo sistema). */
export interface DriverPoseBoneState {
  bone: Bone;
  /** Quaternion vindo do mixer, antes da aditiva. */
  base: Quaternion;
  /** Quaternion depois da aditiva — detecta bone que o mixer não reescreveu. */
  applied: Quaternion;
  hasApplied: boolean;
}

/**
 * **Pose procedural do piloto** (SPEC-0275): rotações aditivas pequenas em
 * `Spine`, `Chest` e `Head` por cima da animação — corpo inclina na curva, para
 * trás ao acelerar, para frente ao frear; cabeça olha para a curva. Calculado no
 * referencial do piloto (glTF: +Z frente, +Y cima — ADR-0274), então independe
 * dos eixos locais do rig.
 *
 * Bone ausente é ignorado (fica em {@link missingBones}). O
 * {@link VehicleDriverSystem} aplica depois do mixer.
 *
 * @example
 * const params = createDriveParams();
 * entity
 *   .addComponent(new VehicleAnimatorComponent(piloto, clips, { params }))
 *   .addComponent(new ProceduralDriverPoseComponent(piloto, params, { limits: { maxRoll: 0.3 } }));
 */
export class ProceduralDriverPoseComponent extends Component {
  readonly limits: DriverPoseLimits;
  readonly boneNames: DriverPoseBoneNames;
  speedRef: number;
  smoothing: number;
  /** Ângulos suavizados atuais, em rad (escritos pelo sistema). */
  readonly current = { roll: 0, pitch: 0, headYaw: 0, headRoll: 0 };
  /** Bones resolvidos (escrito pelo sistema na 1ª execução). */
  bones: { spine: DriverPoseBoneState | null; chest: DriverPoseBoneState | null; head: DriverPoseBoneState | null } | null =
    null;
  /** Bones da convenção que o piloto não tem. */
  missingBones: string[] = [];

  /**
   * @param root - Raiz do piloto (define o referencial frente/cima).
   * @param params - Parâmetros de direção (o mesmo objeto do animador).
   */
  constructor(
    public root: Object3D,
    public params: VehicleDriveParams = createDriveParams(),
    options: DriverPoseOptions = {},
  ) {
    super();
    this.limits = { ...DEFAULT_DRIVER_POSE_LIMITS, ...options.limits };
    this.boneNames = { head: 'Head', spine: 'Spine', chest: 'Chest', ...options.bones };
    this.speedRef = options.speedRef ?? DEFAULT_SPEED_REF;
    this.smoothing = options.smoothing ?? DEFAULT_SMOOTHING;
  }
}
