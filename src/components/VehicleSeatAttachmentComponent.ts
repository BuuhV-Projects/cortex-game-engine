import { Euler, Vector3, type Object3D } from 'three';
import { Component } from '../ecs/Component.js';

/** Nome padrão do anchor do assento (convenção do kart — SPEC-0275). */
export const DEFAULT_SEAT_ANCHOR = 'assento';

/** Opções do {@link VehicleSeatAttachmentComponent}. */
export interface VehicleSeatOptions {
  /** Posição local do piloto relativa ao assento, em metros. */
  offset?: { x: number; y: number; z: number };
  /** Rotação local (Euler XYZ), em radianos. */
  rotation?: { x: number; y: number; z: number };
  /** Escala local: número (uniforme) ou por eixo. */
  scale?: number | { x: number; y: number; z: number };
}

/**
 * **Senta um personagem no assento de um veículo** (SPEC-0275). O
 * {@link VehicleDriverSystem} acha o anchor `seatName` dentro de `vehicle`,
 * parenteia o `driver` nele e aplica {@link offset}/{@link rotation}/{@link scale}
 * todo frame (editar tem efeito ao vivo).
 *
 * Anchor ausente: {@link error} recebe a mensagem (com os nomes que existem no
 * veículo) e o piloto não é mexido. Para falhar já no carregamento, use
 * `attachToSeat` ou `setupVehicleDriver`, que lançam.
 *
 * @example
 * entity.addComponent(new VehicleSeatAttachmentComponent(kart, 'assento', piloto, {
 *   offset: { x: 0, y: 0.05, z: -0.1 },
 * }));
 */
export class VehicleSeatAttachmentComponent extends Component {
  readonly offset: Vector3;
  readonly rotation: Euler;
  readonly scale: Vector3;
  /** Anchor resolvido (escrito pelo sistema). */
  seat: Object3D | null = null;
  /** Erro de resolução (anchor ausente), ou `null`. */
  error: string | null = null;

  constructor(
    public vehicle: Object3D,
    public seatName: string,
    public driver: Object3D,
    options: VehicleSeatOptions = {},
  ) {
    super();
    const o = options.offset ?? { x: 0, y: 0, z: 0 };
    const r = options.rotation ?? { x: 0, y: 0, z: 0 };
    const s = options.scale ?? 1;
    this.offset = new Vector3(o.x, o.y, o.z);
    this.rotation = new Euler(r.x, r.y, r.z);
    this.scale = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(s.x, s.y, s.z);
  }
}
