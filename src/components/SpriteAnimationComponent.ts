import { Component } from '../ecs/Component.js';
import type { Texture } from 'three';
import type { Spritesheet } from '../scene/Spritesheet.js';

/** Uma animação: sequência de frames (índices na spritesheet) + cadência. */
export interface SpriteAnim {
  /** Frames (índices na spritesheet), na ordem de exibição. */
  frames: number[];
  /** Frames por segundo. Default `10`. */
  fps?: number;
  /** Repete em loop? Default `true` (false = trava no último frame). */
  loop?: boolean;
}

/**
 * Estado de **animação de sprite** (spritesheet). Vai numa entidade ECS junto do
 * `Object3DComponent` do sprite; o {@link SpriteAnimationSystem} avança os frames
 * e aplica o recorte UV na `texture` (clonada do sprite). Troque a animação com
 * {@link SpriteAnimationComponent.play} (ex.: `idle` → `run` → `jump`).
 */
export class SpriteAnimationComponent extends Component {
  /** Nome da animação atual (ou `null`). */
  current: string | null = null;
  /** Tempo acumulado na animação atual (s). */
  time = 0;
  /** Índice do frame atual DENTRO da animação (não o índice na sheet). */
  frameIndex = -1;

  constructor(
    /** A spritesheet (grade de frames). */
    public readonly sheet: Spritesheet,
    /** Animações nomeadas. */
    public readonly anims: Record<string, SpriteAnim>,
    /** Textura do sprite (clonada da sheet) onde o frame é aplicado. */
    public readonly texture: Texture,
    /** Animação inicial. */
    initial?: string,
  ) {
    super();
    if (initial) this.play(initial);
  }

  /** Troca a animação (reinicia do frame 0). Sem efeito se já é a atual ou não existe. */
  play(name: string): void {
    if (this.current === name || !this.anims[name]) return;
    this.current = name;
    this.time = 0;
    this.frameIndex = -1; // força reaplicar no próximo tick
  }
}
