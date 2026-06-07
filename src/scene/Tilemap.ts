import {
  Texture,
  Mesh,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  SRGBColorSpace,
} from 'three';
import type { World } from '../ecs/World.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Collider2DComponent } from '../components/Collider2DComponent.js';
import { pixelate } from './Sprite.js';

/** Opções de {@link buildTilemap}. */
export interface TilemapOptions {
  /** Textura do tileset (grade de tiles). */
  tileset: Texture;
  /** Largura de um tile no tileset, em **px**. */
  tileWidth: number;
  /** Altura de um tile, em px. */
  tileHeight: number;
  /** Colunas no tileset. Default: `texW / tileWidth`. */
  tilesetColumns?: number;
  /**
   * Grade do mapa: `data[linha][coluna]` = índice do tile no tileset (0-based,
   * topo-esquerda). **`< 0` (ex.: -1) = vazio**.
   */
  data: number[][];
  /** Tamanho de um tile em **unidades de mundo**. Default `1`. */
  tileSize?: number;
  /** Canto superior-esquerdo do mapa, em unidades. Default `[0, 0]`. */
  origin?: [number, number];
  /** Recorte por alpha. Default `0.5`. */
  alphaTest?: number;
}

/** Resultado de {@link buildTilemap}. */
export interface Tilemap {
  /** Mesh único da camada — adicione em `game.scene.add(mesh)`. */
  mesh: Mesh;
  /**
   * Cria colliders (box) pros tiles **sólidos**, mesclando runs horizontais por
   * linha (menos entidades). `isSolid` decide quais índices colidem (default:
   * qualquer tile não-vazio). Os colliders são entidades `Transform + Collider2D`.
   */
  addColliders(world: World, isSolid?: (tileIndex: number) => boolean): void;
}

/**
 * Constrói uma **camada de tilemap**: um único `Mesh` (geometria mesclada) onde
 * cada célula não-vazia é um quad com UV recortado no tileset. Unlit + nearest
 * (pixel art). Ideal pra níveis 2D por tiles. Veja {@link Tilemap.addColliders}
 * pra colisão.
 *
 * @example
 * const tex = await new AssetLoader().loadTexture('tiles.png', { pixelated: true })
 * const map = buildTilemap({ tileset: tex, tileWidth: 16, tileHeight: 16, tileSize: 1,
 *   data: [[-1,-1,-1],[0,0,0],[1,2,1]] })
 * game.scene.add(map.mesh)
 * map.addColliders(game.world) // chão sólido
 */
export function buildTilemap(options: TilemapOptions): Tilemap {
  const { tileset, tileWidth, tileHeight, data } = options;
  const tileSize = options.tileSize ?? 1;
  const [ox, oy] = options.origin ?? [0, 0];
  pixelate(tileset);
  tileset.colorSpace = SRGBColorSpace;

  const img = tileset.image as { width?: number; height?: number } | undefined;
  const cols = options.tilesetColumns ?? Math.max(1, Math.floor((img?.width ?? tileWidth) / tileWidth));
  const rows = Math.max(1, Math.floor((img?.height ?? tileHeight) / tileHeight));
  const uw = 1 / cols;
  const vh = 1 / rows;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = tileSize / 2;

  for (let r = 0; r < data.length; r++) {
    const rowArr = data[r]!;
    for (let c = 0; c < rowArr.length; c++) {
      const t = rowArr[c]!;
      if (t < 0) continue; // vazio
      const cx = ox + c * tileSize + half;
      const cy = oy - r * tileSize - half;
      const base = positions.length / 3;
      // Cantos (BL, BR, TR, TL).
      positions.push(cx - half, cy - half, 0, cx + half, cy - half, 0, cx + half, cy + half, 0, cx - half, cy + half, 0);
      // UV do tile `t` (V invertido: topo-esquerda = índice 0).
      const tc = t % cols;
      const tr = Math.floor(t / cols);
      const u0 = tc * uw;
      const u1 = (tc + 1) * uw;
      const v1 = 1 - tr * vh;
      const v0 = 1 - (tr + 1) * vh;
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions.length ? positions : [0, 0, 0], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs.length ? uvs : [0, 0], 2));
  geometry.setIndex(indices.length ? indices : [0, 0, 0]);
  geometry.computeBoundingSphere();

  const material = new MeshBasicMaterial({
    map: tileset,
    transparent: true,
    alphaTest: options.alphaTest ?? 0.5,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);

  return {
    mesh,
    addColliders(world: World, isSolid: (tileIndex: number) => boolean = (t) => t >= 0): void {
      for (let r = 0; r < data.length; r++) {
        const rowArr = data[r]!;
        let runStart = -1;
        const flush = (cEnd: number): void => {
          if (runStart < 0) return;
          const len = cEnd - runStart;
          const e = world.createEntity();
          const cx = ox + (runStart + len / 2) * tileSize;
          const cy = oy - r * tileSize - half;
          e.addComponent(new TransformComponent(cx, cy, 0));
          e.addComponent(new Collider2DComponent((len * tileSize) / 2, half, true, false));
          runStart = -1;
        };
        for (let c = 0; c < rowArr.length; c++) {
          if (isSolid(rowArr[c]!) && rowArr[c]! >= 0) {
            if (runStart < 0) runStart = c;
          } else {
            flush(c);
          }
        }
        flush(rowArr.length);
      }
    },
  };
}
