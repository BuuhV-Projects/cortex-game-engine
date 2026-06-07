import { Texture, Mesh, SRGBColorSpace } from 'three';
import { createSprite, pixelate } from './Sprite.js';
import { SpriteAnimationComponent, type SpriteAnim } from '../components/SpriteAnimationComponent.js';

/** Opções de {@link Spritesheet}. */
export interface SpritesheetOptions {
  /** Largura de um frame, em **px** da textura. */
  frameWidth: number;
  /** Altura de um frame, em px. */
  frameHeight: number;
  /** Colunas (frames por linha). Default: `floor(texW / frameWidth)`. */
  columns?: number;
  /** Linhas. Default: `floor(texH / frameHeight)`. */
  rows?: number;
}

/**
 * **Spritesheet**: uma textura dividida numa grade de frames de tamanho fixo. O
 * frame `index` (linha-a-linha, da esquerda pra direita, **0 = topo-esquerda**)
 * vira um recorte UV aplicável a uma textura (offset/repeat). Use com
 * {@link createAnimatedSprite} + {@link SpriteAnimationComponent}.
 */
export class Spritesheet {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;

  constructor(
    /** Textura da folha (carregue com `loadTexture(url, { pixelated: true })`). */
    readonly texture: Texture,
    opts: SpritesheetOptions,
  ) {
    this.frameWidth = opts.frameWidth;
    this.frameHeight = opts.frameHeight;
    const img = texture.image as { width?: number; height?: number } | undefined;
    this.columns = opts.columns ?? Math.max(1, Math.floor((img?.width ?? opts.frameWidth) / opts.frameWidth));
    this.rows = opts.rows ?? Math.max(1, Math.floor((img?.height ?? opts.frameHeight) / opts.frameHeight));
  }

  /** Total de frames da grade. */
  get count(): number {
    return this.columns * this.rows;
  }

  /**
   * Aplica o recorte UV do frame `index` numa textura (define `offset`/`repeat`).
   * V é invertido (origem do three é embaixo) pra `0` ser o topo-esquerda.
   */
  applyFrame(texture: Texture, index: number): void {
    const col = index % this.columns;
    const row = Math.floor(index / this.columns);
    texture.repeat.set(1 / this.columns, 1 / this.rows);
    texture.offset.set(col / this.columns, 1 - (row + 1) / this.rows);
  }
}

/** Opções de {@link createAnimatedSprite}. */
export interface AnimatedSpriteOptions {
  /** Px por unidade pra dimensionar o sprite a partir do tamanho do frame. Default `100`. */
  pixelsPerUnit?: number;
  /** Largura em unidades (sobrescreve o cálculo por `pixelsPerUnit`). */
  width?: number;
  /** Altura em unidades. */
  height?: number;
  /** Animação inicial. */
  initial?: string;
  /** Recorte por alpha. Default `0.5`. */
  alphaTest?: number;
}

/**
 * Cria um **sprite animado**: o mesh (quad do tamanho de UM frame) + o
 * {@link SpriteAnimationComponent} pronto pra entrar numa entidade ECS (com
 * `Object3DComponent(sprite)`). A textura é **clonada** da sheet (pra cada sprite
 * animar independente). Registre o {@link SpriteAnimationSystem} no world.
 *
 * @example
 * const sheet = new Spritesheet(tex, { frameWidth: 16, frameHeight: 16 })
 * const { sprite, animation } = createAnimatedSprite(sheet, {
 *   idle: { frames: [0, 1], fps: 4 },
 *   run: { frames: [2, 3, 4, 5], fps: 12 },
 * }, { pixelsPerUnit: 16, initial: 'idle' })
 * game.scene.add(sprite)
 * const e = game.world.createEntity()
 * e.addComponent(new Object3DComponent(sprite)); e.addComponent(animation)
 */
export function createAnimatedSprite(
  sheet: Spritesheet,
  anims: Record<string, SpriteAnim>,
  options: AnimatedSpriteOptions = {},
): { sprite: Mesh; animation: SpriteAnimationComponent } {
  const texture = sheet.texture.clone();
  texture.needsUpdate = true;
  pixelate(texture);
  texture.colorSpace = SRGBColorSpace;
  sheet.applyFrame(texture, 0); // recorte inicial (senão mostra a folha inteira)

  const ppu = options.pixelsPerUnit ?? 100;
  const sprite = createSprite(texture, {
    width: options.width ?? sheet.frameWidth / ppu,
    height: options.height ?? sheet.frameHeight / ppu,
    pixelated: false, // já aplicado acima
    alphaTest: options.alphaTest,
  });
  const animation = new SpriteAnimationComponent(sheet, anims, texture, options.initial);
  return { sprite, animation };
}
