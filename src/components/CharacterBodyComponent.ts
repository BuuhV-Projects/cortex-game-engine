import { Component } from '../ecs/Component.js';

/** Opções do {@link CharacterBodyComponent} (estilo UPBGE "Character"). */
export interface CharacterBodyOptions {
  /** Raio da cápsula de colisão. Default `0.4`. */
  radius?: number;
  /** Altura total da cápsula (pés→topo). Default `1.8`. */
  height?: number;
  /** Gravidade (unidades/s²) que puxa o personagem pra baixo. Default `30`. */
  gravity?: number;
  /** **Step Height** — altura máxima de degrau que o personagem sobe andando. Default `0.4`. */
  stepHeight?: number;
  /** **Jump Force** — velocidade vertical aplicada ao pular. Default `9`. */
  jumpForce?: number;
  /** **Fall Speed Max** — velocidade máxima de queda. Default `25`. */
  fallSpeedMax?: number;
  /** **Max Jumps** — nº máximo de pulos antes de tocar o chão (1 = sem double-jump). Default `1`. */
  maxJumps?: number;
  /**
   * **Altura do chão (Y)** — piso plano de **fallback** onde o personagem aterra se
   * NÃO houver geometria embaixo (rede de segurança contra cair no vazio). O chão
   * principal vem da **colisão real** (raycast na cena) do {@link CharacterPhysicsSystem}.
   * Default `-Infinity` = sem rede. O editor/data-driven usam `0` por padrão.
   */
  groundY?: number;
  /**
   * **Offset dos pés** — distância da ORIGEM do mesh até a sua BASE (pés). Modelos com
   * origem nos pés = `0`; primitivas (cilindro/box/esfera) têm origem no **centro**, então
   * `footOffset = altura/2`. A física ancora os **pés** (`transform.y − footOffset`) no
   * chão; sem isso o mesh **afunda** metade da altura. O {@link buildScene} calcula do
   * bounds do mesh. Default `0`.
   */
  footOffset?: number;
}

/**
 * **Corpo de personagem** (player/NPC) — uma **cápsula** com física vertical de
 * character controller (estilo UPBGE "Character"): gravidade, pulo (Jump Force /
 * Max Jumps), queda limitada (Fall Speed Max) e Step Height. Move-se no plano
 * (X/Z ou X/Y) por input próprio; o {@link CharacterPhysicsSystem} cuida do Y
 * (gravidade/pulo) e o {@link TerrainCollisionSystem} o mantém EM CIMA do terreno
 * (anda em morros, não atravessa). O pivô fica nos **pés** (`transform.y` = base).
 *
 * @example
 * player.addComponent(new CharacterBodyComponent({ radius: 0.4, height: 1.8, jumpForce: 9 }))
 * // pular (ex.: no input de espaço):
 * player.getComponent(CharacterBodyComponent)!.jump()
 */
export class CharacterBodyComponent extends Component {
  readonly radius: number;
  readonly height: number;
  readonly gravity: number;
  readonly stepHeight: number;
  readonly jumpForce: number;
  readonly fallSpeedMax: number;
  readonly maxJumps: number;
  /** Piso plano onde aterra (sem raycast). `-Infinity` = sem piso. */
  groundY: number;
  /** Distância da origem do mesh até os pés (base). `0` = origem nos pés. */
  footOffset: number;

  /** Velocidade vertical atual (unidades/s). Integrada pela gravidade/pulo. */
  velocityY = 0;
  /** `true` quando os pés estão no chão (terreno/colisão). Zera os pulos. */
  grounded = false;
  /** Pulos já usados desde o último contato com o chão. */
  jumpsUsed = 0;
  /** Pedido de pulo pendente (consumido pelo {@link CharacterPhysicsSystem}). */
  jumpQueued = false;

  constructor(options: CharacterBodyOptions = {}) {
    super();
    this.radius = options.radius ?? 0.4;
    this.height = options.height ?? 1.8;
    this.gravity = options.gravity ?? 30;
    this.stepHeight = options.stepHeight ?? 0.4;
    this.jumpForce = options.jumpForce ?? 9;
    this.fallSpeedMax = options.fallSpeedMax ?? 25;
    this.maxJumps = options.maxJumps ?? 1;
    this.groundY = options.groundY ?? -Infinity;
    this.footOffset = options.footOffset ?? 0;
  }

  /** Pede um pulo — aplicado no próximo tick se ainda houver pulos disponíveis. */
  jump(): void {
    this.jumpQueued = true;
  }
}
