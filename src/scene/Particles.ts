import {
  AdditiveBlending,
  Color,
  DataTexture,
  DoubleSide,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Texture,
} from 'three';

/**
 * **Partículas instanciadas** (ADR-0168 / SPEC-0169) — fagulha, poeira, fumaça,
 * respingo e clarão, com **um draw call por emissor**.
 *
 * O emissor mantém um POOL de tamanho fixo (`max`) em arrays planos e desenha as
 * partículas vivas como quads billboard de um {@link InstancedMesh} — o mesmo
 * mecanismo instanciado que a vegetação já usa (SPEC-0077), que é o caminho
 * provado no host nativo.
 *
 * **Sem cor por partícula** (ADR-0168): `instanceColor` é vertex color de
 * instância, e o `naga` do host nativo miscompila vertex color. A cor é do
 * EMISSOR e o desaparecimento é por ESCALA — a partícula encolhe até zero. Com
 * `blending: 'additive'` (o default de fogo/fagulha) encolher lê como apagar,
 * porque o brilho somado cai com a área. Gradiente de cor se faz sobrepondo dois
 * emissores.
 *
 * @example Fagulha subindo de um braseiro
 * ```ts
 * const fx = new ParticleEmitter({ rate: 24, direction: [0, 1, 0], spread: 0.5,
 *   speed: [1, 2.5], life: [0.6, 1.2], size: 0.18, gravity: -1.5, color: '#ffcf6a' })
 * scene.add(fx.object)
 * // no loop:
 * fx.update(dt, camera)
 * ```
 */

/** Faixa `[min, max]` sorteada por partícula, ou um valor fixo. */
export type ParticleRange = number | [number, number];

export interface ParticleEmitterOptions {
  /** Capacidade do pool — teto de partículas vivas ao mesmo tempo. Default 128. */
  max?: number;
  /** Emissão contínua, partículas por segundo. `0` = só `burst`. Default 0. */
  rate?: number;
  /** Emissão instantânea ao criar o emissor. Default 0. */
  burst?: number;
  /** `false` = emite por `life` máximo e para sozinho (efeito de evento). Default true. */
  loop?: boolean;
  /** Vida da partícula em segundos. Default `[0.6, 1.2]`. */
  life?: ParticleRange;
  /** Lado do quad, em unidades de mundo. Default `[0.12, 0.28]`. */
  size?: ParticleRange;
  /** Velocidade inicial. Default `[1, 2]`. */
  speed?: ParticleRange;
  /** Direção base da emissão (normalizada internamente). Default `[0, 1, 0]`. */
  direction?: [number, number, number];
  /** Abertura do cone em torno de `direction`, em radianos. Default 0.4. */
  spread?: number;
  /** Aceleração em Y (u/s²) — negativa cai, positiva sobe. Default 0. */
  gravity?: number;
  /** Fração da velocidade perdida por segundo (0 = nenhuma). Default 0. */
  drag?: number;
  /** Rotação da partícula no plano da tela (rad/s). Default 0. */
  spin?: ParticleRange;
  /** Cor do emissor (hex ou número). Default `#ffffff`. */
  color?: string | number;
  /** Opacidade do material. Default 1. */
  opacity?: number;
  /** `additive` = fogo/fagulha/brilho; `normal` = fumaça/poeira. Default additive. */
  blending?: 'additive' | 'normal';
  /** Textura do sprite. Ausente = disco suave gerado por código. */
  texture?: Texture;
}

/** Lado da textura default (disco com falloff radial). */
const DEFAULT_TEXTURE_SIZE = 64;
/** Expoente do falloff: quanto maior, mais concentrado o miolo do disco. */
const DEFAULT_TEXTURE_FALLOFF = 1.6;

// Temporários de módulo: a simulação roda todo frame pra cada partícula viva, e
// alocar aqui vira lixo pro GC — que é caro no host nativo (Hermes).
const _matrix = new Matrix4();
const _position = new Vector3();
const _scale = new Vector3();
const _billboard = new Quaternion();
const _spin = new Quaternion();
const _composed = new Quaternion();
const _dir = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _side = new Vector3();
const _forward = new Vector3(0, 0, 1);
const _worldUp = new Vector3(0, 1, 0);
/** Acima disso a direção é quase o próprio ±Y e `up` deixa de servir de base. */
const NEAR_VERTICAL = 0.9

/**
 * Disco com falloff radial como {@link DataTexture} — sem `canvas`, que não é
 * garantido no host nativo. É a textura default de qualquer emissor.
 */
export function createSoftDiscTexture(size = DEFAULT_TEXTURE_SIZE): Texture {
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const alpha = Math.round(255 * Math.pow(1 - d, DEFAULT_TEXTURE_FALLOFF));
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Sorteia dentro da faixa (valor fixo = a própria constante). */
function pick(range: ParticleRange | undefined, fallback: ParticleRange): number {
  const r = range ?? fallback;
  if (typeof r === 'number') return r;
  return r[0] + Math.random() * (r[1] - r[0]);
}

export class ParticleEmitter {
  /** Nó a adicionar na cena (contém o `InstancedMesh`). */
  readonly object: Object3D;

  private readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private readonly ownsTexture: boolean;
  private readonly opts: Required<
    Pick<ParticleEmitterOptions, 'max' | 'rate' | 'loop' | 'spread' | 'gravity' | 'drag'>
  > &
    ParticleEmitterOptions;

  // Pool plano: nada é alocado por partícula depois do construtor.
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  /** Vida restante (s); `<= 0` = slot livre. */
  private readonly life: Float32Array;
  private readonly lifeMax: Float32Array;
  private readonly size: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;

  private readonly direction = new Vector3(0, 1, 0);
  /** Sobra de emissão do frame (a taxa raramente dá partícula inteira por frame). */
  private pending = 0;
  private emitting: boolean;
  private disposed = false;

  constructor(options: ParticleEmitterOptions = {}) {
    const max = Math.max(1, Math.floor(options.max ?? 128));
    this.opts = {
      max,
      rate: options.rate ?? 0,
      loop: options.loop ?? true,
      spread: options.spread ?? 0.4,
      gravity: options.gravity ?? 0,
      drag: options.drag ?? 0,
      ...options,
    };
    if (options.direction) this.direction.fromArray(options.direction).normalize();
    this.emitting = this.opts.rate > 0;

    this.px = new Float32Array(max);
    this.py = new Float32Array(max);
    this.pz = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.life = new Float32Array(max);
    this.lifeMax = new Float32Array(max);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);

    this.ownsTexture = !options.texture;
    this.material = new MeshBasicMaterial({
      map: options.texture ?? createSoftDiscTexture(),
      color: new Color(options.color ?? 0xffffff),
      transparent: true,
      opacity: options.opacity ?? 1,
      blending: (options.blending ?? 'additive') === 'additive' ? AdditiveBlending : NormalBlending,
      // Partícula não escreve profundidade: dezenas de quads translúcidos se
      // recortariam entre si em ordem arbitrária.
      depthWrite: false,
      side: DoubleSide,
      // Efeito nunca é tingido pela névoa da cena — a fagulha some no fog e o
      // jogador acha que o efeito falhou.
      fog: false,
      toneMapped: false,
    });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), this.material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // o pool vive no espaço local; o bbox mente
    this.mesh.raycast = () => {}; // efeito NUNCA é física (SPEC-0169)
    this.object = this.mesh;

    if (options.burst) this.burst(options.burst);
  }

  /** Partículas vivas agora (diagnóstico e teste). */
  get alive(): number {
    return this.mesh.count;
  }

  /** O emissor ainda vai soltar partículas novas? */
  get active(): boolean {
    return this.emitting;
  }

  /** Dispara `n` partículas de uma vez (o "evento": pouso, coleta, clarão). */
  burst(n: number): void {
    for (let i = 0; i < n; i++) this.spawnOne();
  }

  /** Para de EMITIR; as vivas terminam a vida normalmente. */
  stop(): void {
    this.emitting = false;
  }

  /** Volta a emitir (só faz efeito se `rate > 0`). */
  start(): void {
    this.emitting = this.opts.rate > 0;
  }

  /**
   * Avança a simulação. `camera` orienta os quads (billboard); sem ela, os quads
   * mantêm a última orientação.
   */
  update(deltaSeconds: number, camera?: Camera): void {
    if (this.disposed) return;
    const dt = Math.max(0, deltaSeconds);

    if (this.emitting && this.opts.rate > 0) {
      this.pending += this.opts.rate * dt;
      while (this.pending >= 1) {
        this.pending -= 1;
        this.spawnOne();
      }
      if (!this.opts.loop) this.emitting = false;
    }

    if (camera) camera.getWorldQuaternion(_billboard);
    const drag = Math.max(0, 1 - this.opts.drag * dt);
    let visible = 0;

    for (let i = 0; i < this.opts.max; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) continue;

      this.vy[i]! += this.opts.gravity * dt;
      if (this.opts.drag > 0) {
        this.vx[i]! *= drag;
        this.vy[i]! *= drag;
        this.vz[i]! *= drag;
      }
      this.px[i]! += this.vx[i]! * dt;
      this.py[i]! += this.vy[i]! * dt;
      this.pz[i]! += this.vz[i]! * dt;
      this.rot[i]! += this.spin[i]! * dt;

      // Fade por ESCALA (ADR-0168): sem alpha por instância, quem apaga é o
      // encolhimento — a partícula nasce cheia e vai a zero no fim da vida.
      const t = this.life[i]! / Math.max(1e-6, this.lifeMax[i]!);
      const s = this.size[i]! * t;
      _position.set(this.px[i]!, this.py[i]!, this.pz[i]!);
      _scale.set(s, s, s);
      _spin.setFromAxisAngle(_forward, this.rot[i]!);
      _composed.copy(_billboard).multiply(_spin);
      _matrix.compose(_position, _composed, _scale);
      this.mesh.setMatrixAt(visible, _matrix);
      visible++;
    }

    this.mesh.count = visible;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Libera geometria, material e a textura gerada (se for a default). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.emitting = false;
    this.mesh.count = 0;
    this.mesh.geometry.dispose();
    if (this.ownsTexture) this.material.map?.dispose();
    this.material.dispose();
    this.object.parent?.remove(this.object);
  }

  /** Acha um slot livre e nasce uma partícula nele (nada é alocado aqui). */
  private spawnOne(): void {
    const max = this.opts.max;
    let slot = -1;
    for (let i = 0; i < max; i++) {
      if (this.life[i]! <= 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) return; // pool cheio: a partícula nova simplesmente não nasce

    const life = pick(this.opts.life, [0.6, 1.2]);
    this.life[slot] = life;
    this.lifeMax[slot] = life;
    this.size[slot] = pick(this.opts.size, [0.12, 0.28]);
    this.rot[slot] = Math.random() * Math.PI * 2;
    this.spin[slot] = pick(this.opts.spin, 0);

    // Direção: cone em torno de `direction`, com abertura `spread`.
    const speed = pick(this.opts.speed, [1, 2]);
    const spread = this.opts.spread;
    _dir.copy(this.direction);
    if (spread > 0) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * spread;
      const sin = Math.sin(phi);
      // Base ortonormal em torno da direção, pra abrir o cone em qualquer eixo.
      // Direção quase vertical precisa de outro vetor de apoio: o produto vetorial
      // com o próprio ±Y degenera em zero.
      _up.copy(Math.abs(_dir.y) > NEAR_VERTICAL ? _forward : _worldUp);
      _right.crossVectors(_dir, _up).normalize();
      _side.crossVectors(_right, _dir).normalize();
      _dir
        .multiplyScalar(Math.cos(phi))
        .addScaledVector(_right, sin * Math.cos(theta))
        .addScaledVector(_side, sin * Math.sin(theta))
        .normalize();
    }
    this.vx[slot] = _dir.x * speed;
    this.vy[slot] = _dir.y * speed;
    this.vz[slot] = _dir.z * speed;

    // Toda partícula nasce na ORIGEM do emissor e vive no espaço dele — mover o
    // emissor leva as vivas junto. Rastro de objeto em movimento (partícula que
    // fica pra trás) é pendência da v1: ver SPEC-0169.
    this.px[slot] = 0;
    this.py[slot] = 0;
    this.pz[slot] = 0;
  }
}

/**
 * Efeito PONTUAL que se limpa sozinho: dispara `burst` partículas na posição dada
 * e devolve o emissor (já adicionado ao `parent`). Use pro que é evento — pouso,
 * coleta, clarão de chegada.
 *
 * O chamador ainda precisa chamar `update(dt, camera)` no loop; quando
 * `emitter.alive === 0` e `!emitter.active`, pode `dispose()`.
 */
export function spawnParticles(
  parent: Object3D,
  options: ParticleEmitterOptions & { position?: [number, number, number] },
): ParticleEmitter {
  const emitter = new ParticleEmitter({ loop: false, ...options });
  if (options.position) emitter.object.position.fromArray(options.position);
  parent.add(emitter.object);
  return emitter;
}
