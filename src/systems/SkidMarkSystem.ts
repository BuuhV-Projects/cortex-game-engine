import {
  BufferGeometry, BufferAttribute, Mesh, MeshBasicMaterial, Vector3, DoubleSide,
  type Object3D, type ColorRepresentation,
} from 'three';
import { System } from '../ecs/System.js';
import type { Entity } from '../ecs/Entity.js';
import type { Vehicle } from '../physics/RapierPhysics.js';

/** Opções do {@link SkidMarkSystem}. */
export interface SkidMarkOptions {
  /** Cor das marcas. Default `0x161616` (borracha escura). */
  color?: ColorRepresentation;
  /** Opacidade. Default 0.55. */
  opacity?: number;
  /** Largura da marca (m). Default 0.28. */
  width?: number;
  /** Máximo de segmentos (ring buffer — os mais antigos somem). Default 800. */
  maxSegments?: number;
  /** Velocidade lateral (m/s) acima da qual marca (derrapagem/drift). Default 4.5. */
  lateralSlipThreshold?: number;
  /** Abaixo desta velocidade (m/s) não marca. Default 2. */
  minSpeed?: number;
  /** Levanta a marca do chão (m) pra não brigar com o z. Default 0.03. */
  lift?: number;
  /** Quais rodas marcam (índices). Default: todas. */
  wheels?: number[];
  /** Força a marca (ex.: freio de mão / freio forte): `() => brakeIn > 0.6`. */
  skidding?: () => boolean;
  /** Só roda quando `true` (ex.: `() => car.driving`). Default sempre. */
  active?: () => boolean;
  /** Pausa total (ex.: editor). */
  pauseWhen?: () => boolean;
}

const _dir = new Vector3();
const _perp = new Vector3();
const _cp = new Vector3();

/**
 * Desenha **marcas de pneu** no chão quando o carro derrapa ou freia forte (ADR-0081).
 * Lê o contato das rodas do {@link Vehicle} (no WASM) e acumula segmentos numa única
 * malha (ring buffer — os mais antigos são reciclados). Nativo e **configurável via
 * projeto** (cor, largura, limiar, freio-de-mão). `priority = 31` (DEPOIS do
 * `VehicleControlSystem`, que faz o `physics.step()` — contatos já atualizados).
 *
 * @example
 * new SkidMarkSystem(vehicle, scene.getThreeScene(), {
 *   active: () => car.driving,
 *   skidding: () => brakeInput > 0.6,  // freio forte deixa marca
 * })
 */
export class SkidMarkSystem extends System {
  static override requiredComponents = [];
  override priority = 31;

  private readonly posAttr: BufferAttribute;
  private readonly mesh: Mesh;
  private readonly max: number;
  private readonly lastContact: (Vector3 | null)[] = [];
  private readonly wheelList: number[];
  private head = 0;
  private filled = 0;

  constructor(
    private readonly vehicle: Vehicle,
    root: Object3D,
    private readonly options: SkidMarkOptions = {},
  ) {
    super();
    this.pauseWhen = options.pauseWhen;
    this.max = options.maxSegments ?? 800;
    this.wheelList = options.wheels ?? Array.from({ length: vehicle.wheelCount }, (_, i) => i);

    const geo = new BufferGeometry();
    this.posAttr = new BufferAttribute(new Float32Array(this.max * 4 * 3), 3);
    this.posAttr.setUsage(35048 /* DynamicDrawUsage */);
    geo.setAttribute('position', this.posAttr);
    // Índices fixos: 2 triângulos por quad (DoubleSide → winding não importa).
    const idx = new Uint32Array(this.max * 6);
    for (let q = 0; q < this.max; q++) {
      const v = q * 4;
      const o = q * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v + 1; idx[o + 4] = v + 3; idx[o + 5] = v + 2;
    }
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);

    const mat = new MeshBasicMaterial({
      color: options.color ?? 0x161616,
      transparent: true,
      opacity: options.opacity ?? 0.55,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.raycast = () => {}; // não selecionável/raycastável
    (this.mesh.userData as Record<string, unknown>)['editorInternal'] = true;
    root.add(this.mesh);
  }

  override update(_entities: Entity[], _deltaTime: number): void {
    if (this.options.active && !this.options.active()) return;

    const speed = Math.abs(this.vehicle.forwardSpeed());
    const lateral = Math.abs(this.vehicle.lateralSpeed());
    const slipping =
      speed > (this.options.minSpeed ?? 2) &&
      ((this.options.skidding?.() ?? false) || lateral > (this.options.lateralSlipThreshold ?? 4.5));

    for (const w of this.wheelList) {
      if (!this.vehicle.wheelIsInContact(w) || !this.vehicle.wheelContactPoint(w, _cp)) {
        this.lastContact[w] = null;
        continue;
      }
      const prev = this.lastContact[w];
      if (slipping && prev) this.addSegment(prev, _cp);
      if (prev) prev.copy(_cp); // reusa o Vector3 da roda
      else this.lastContact[w] = _cp.clone();
    }
  }

  private addSegment(a: Vector3, b: Vector3): void {
    _dir.subVectors(b, a);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-8) return; // sem deslocamento → ignora
    _dir.normalize();
    const half = (this.options.width ?? 0.28) / 2;
    _perp.set(-_dir.z, 0, _dir.x).multiplyScalar(half); // perpendicular horizontal
    const lift = this.options.lift ?? 0.03;

    const base = this.head * 4 * 3;
    const p = this.posAttr.array as Float32Array;
    // 4 cantos: a-perp, a+perp, b-perp, b+perp (levantados).
    p[base + 0] = a.x - _perp.x; p[base + 1] = a.y + lift; p[base + 2] = a.z - _perp.z;
    p[base + 3] = a.x + _perp.x; p[base + 4] = a.y + lift; p[base + 5] = a.z + _perp.z;
    p[base + 6] = b.x - _perp.x; p[base + 7] = b.y + lift; p[base + 8] = b.z - _perp.z;
    p[base + 9] = b.x + _perp.x; p[base + 10] = b.y + lift; p[base + 11] = b.z + _perp.z;

    this.head = (this.head + 1) % this.max;
    this.filled = Math.min(this.filled + 1, this.max);
    this.posAttr.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.filled * 6);
  }

  /** Apaga todas as marcas. */
  clear(): void {
    this.head = 0;
    this.filled = 0;
    this.lastContact.length = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }
}
