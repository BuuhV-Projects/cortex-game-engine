// Região de recorte do canvas 2D (SPEC-0313). `clip()` só GUARDA o caminho
// (já em px de dispositivo) e o clip anterior; a máscara (Uint8Array w×h,
// 0..255) é calculada na primeira rasterização que precisar dela — com a
// rasterização adiada, um canvas que ninguém lê nunca paga a máscara.
import { rasterizePath } from './raster.js';

const MAX_BYTE = 255;

export function createClip(subpaths, evenOdd, parent) {
  return { subpaths, evenOdd, parent, mask: null };
}

/**
 * Última máscara de clip SEM pai (só leitura depois de pronta). Jogo que recorta o
 * MESMO caminho todo quadro (o círculo do radar, ADR-0315) reaproveita a máscara
 * em vez de rasterizá-la de novo.
 */
let lastRoot = null;

function samePaths(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i].pts;
    const pb = b[i].pts;
    if (pa.length !== pb.length) return false;
    for (let j = 0; j < pa.length; j++) if (pa[j] !== pb[j]) return false;
  }
  return true;
}

function cachedRootMask(clip, width, height) {
  const c = lastRoot;
  if (!c || c.width !== width || c.height !== height || c.evenOdd !== clip.evenOdd) return null;
  return samePaths(c.subpaths, clip.subpaths) ? c.mask : null;
}

/** Máscara da região (interseção com os clips anteriores), ou null = sem recorte. */
export function resolveClip(clip, width, height) {
  if (!clip) return null;
  if (clip.mask) return clip.mask;
  if (!clip.parent) {
    const hit = cachedRootMask(clip, width, height);
    if (hit) {
      clip.mask = hit;
      return hit;
    }
  }
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
  if (!parent) lastRoot = { subpaths: clip.subpaths, evenOdd: clip.evenOdd, width, height, mask };
  return mask;
}
