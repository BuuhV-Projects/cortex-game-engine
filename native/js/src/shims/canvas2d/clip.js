// Região de recorte do canvas 2D (SPEC-0313). `clip()` só GUARDA o caminho
// (já em px de dispositivo) e o clip anterior; a máscara (Uint8Array w×h,
// 0..255) é calculada na primeira rasterização que precisar dela — com a
// rasterização adiada, um canvas que ninguém lê nunca paga a máscara.
import { rasterizePath } from './raster.js';

const MAX_BYTE = 255;

export function createClip(subpaths, evenOdd, parent) {
  return { subpaths, evenOdd, parent, mask: null };
}

/** Máscara da região (interseção com os clips anteriores), ou null = sem recorte. */
export function resolveClip(clip, width, height) {
  if (!clip) return null;
  if (clip.mask) return clip.mask;
  const parent = resolveClip(clip.parent, width, height);
  const mask = new Uint8Array(width * height);
  rasterizePath(clip.subpaths, clip.evenOdd, width, height, (y, x0, x1, cov) => {
    const base = y * width;
    for (let x = x0; x < x1; x++) {
      const v = cov[x] * MAX_BYTE;
      mask[base + x] = parent ? (v * parent[base + x]) / MAX_BYTE : v;
    }
  });
  clip.mask = mask;
  return mask;
}
