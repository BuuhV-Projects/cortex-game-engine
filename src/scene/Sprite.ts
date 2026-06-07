import {
  Texture,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  NearestFilter,
  DoubleSide,
  SRGBColorSpace,
  type ColorRepresentation,
} from 'three';

/**
 * Configura a textura pra **pixel art**: amostragem **nearest** (sem borrar ao
 * escalar) e sem mipmaps. Retorna a própria textura (encadeável).
 */
export function pixelate(texture: Texture): Texture {
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Opções de {@link createSprite}. */
export interface SpriteOptions {
  /** Largura em **unidades de mundo**. Default: `texturaPx.width / pixelsPerUnit`. */
  width?: number;
  /** Altura em unidades de mundo. Default: `texturaPx.height / pixelsPerUnit`. */
  height?: number;
  /** Px por unidade pra dimensionar a partir do tamanho da textura. Default `100`. */
  pixelsPerUnit?: number;
  /** Aplica nearest filter (pixel art). Default `true`. */
  pixelated?: boolean;
  /** Recorte por alpha (0 = sem corte; 0.5 bom pra borda dura). Default `0.5`. */
  alphaTest?: number;
  /** Tint multiplicado na textura. Default branco. */
  color?: ColorRepresentation;
}

/**
 * Cria um **sprite 2D**: um quad (`PlaneGeometry`) no plano XY com a textura como
 * material **unlit** (`MeshBasicMaterial`, sem iluminação/tonemap), transparente e
 * com **nearest filter** (pixel nítido). Encaixa numa entidade ECS via
 * `Object3DComponent` igual qualquer mesh; combine com `Game({ projection:
 * 'orthographic' })` pra um jogo pixel.
 *
 * O tamanho vem em unidades de mundo: passe `width`/`height`, ou deixe derivar do
 * tamanho em px da textura ÷ `pixelsPerUnit`. Ex.: textura 16×16, `pixelsPerUnit:
 * 16` → sprite de 1×1 unidade.
 *
 * @example
 * const tex = await new AssetLoader().loadTexture('hero.png', { pixelated: true })
 * const hero = createSprite(tex, { pixelsPerUnit: 16 })
 * game.scene.add(hero)
 */
export function createSprite(texture: Texture, options: SpriteOptions = {}): Mesh {
  if (options.pixelated !== false) pixelate(texture);
  texture.colorSpace = SRGBColorSpace;

  const ppu = options.pixelsPerUnit ?? 100;
  const img = texture.image as { width?: number; height?: number } | undefined;
  const width = options.width ?? (img?.width ?? 16) / ppu;
  const height = options.height ?? (img?.height ?? 16) / ppu;

  const geometry = new PlaneGeometry(width, height);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: options.alphaTest ?? 0.5,
    color: options.color ?? 0xffffff,
    side: DoubleSide,
    toneMapped: false,
  });
  return new Mesh(geometry, material);
}
