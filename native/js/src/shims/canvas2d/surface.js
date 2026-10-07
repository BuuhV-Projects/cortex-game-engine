// Buffer de pixels do canvas 2D (SPEC-0313): RGBA8, alfa NÃO pré-multiplicado,
// linhas de cima pra baixo — o mesmo layout do getImageData e do ImageBitmap
// do host (`{ width, height, rgba }`) que o copyExternalImageToTexture sobe.

/** Lado máximo aceito (o mesmo teto prático do Chromium). */
const MAX_SIDE = 32767;

export function createSurface(width, height) {
  const w = Math.max(0, Math.min(MAX_SIDE, Math.floor(width) || 0));
  const h = Math.max(0, Math.min(MAX_SIDE, Math.floor(height) || 0));
  const buffer = new ArrayBuffer(w * h * 4);
  return {
    width: w,
    height: h,
    buffer,
    data: new Uint8ClampedArray(buffer),
    u32: new Uint32Array(buffer),
  };
}

/** ImageData (construtor fiel: (w, h) ou (data, w, h?)). */
export function ImageData(a, b, c) {
  if (typeof a === 'number') {
    this.width = a;
    this.height = b;
    this.data = new Uint8ClampedArray(a * b * 4);
  } else {
    this.data = a;
    this.width = b;
    this.height = c !== undefined ? c : a.length / 4 / b;
  }
  this.colorSpace = 'srgb';
}

/** Copia a região [sx, sx+sw)×[sy, sy+sh) (fora do canvas = transparente). */
export function readRegion(surface, sx, sy, sw, sh) {
  const out = new ImageData(sw, sh);
  for (let y = 0; y < sh; y++) {
    const srcY = sy + y;
    if (srcY < 0 || srcY >= surface.height) continue;
    const x0 = Math.max(0, sx);
    const x1 = Math.min(surface.width, sx + sw);
    if (x1 <= x0) continue;
    const from = (srcY * surface.width + x0) * 4;
    out.data.set(surface.data.subarray(from, from + (x1 - x0) * 4), (y * sw + (x0 - sx)) * 4);
  }
  return out;
}

/** putImageData: cópia direta (sem transform/alpha/clip, como na spec). */
export function writeRegion(surface, image, dx, dy) {
  for (let y = 0; y < image.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= surface.height) continue;
    const x0 = Math.max(0, dx);
    const x1 = Math.min(surface.width, dx + image.width);
    if (x1 <= x0) continue;
    const from = (y * image.width + (x0 - dx)) * 4;
    surface.data.set(image.data.subarray(from, from + (x1 - x0) * 4), (ty * surface.width + x0) * 4);
  }
}
