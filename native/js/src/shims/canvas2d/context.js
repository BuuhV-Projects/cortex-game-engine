// CanvasRenderingContext2D do host nativo (SPEC-0313 / ADR-0312). Esta classe
// só orquestra: estado (state.js), caminho (path.js), cobertura (raster.js),
// traço (stroke.js), tinta (paint.js), composição (composite.js), bitmap
// (bitmap.js), texto (text.js) e sombra (shadow.js).
import * as mat from './matrix.js';
import { Path } from './path.js';
import { rasterizePath, rasterizeRect } from './raster.js';
import { strokeToPolygons } from './stroke.js';
import { CanvasGradient, resolvePaint } from './paint.js';
import { blendRow, blendColorRow, eraseRow } from './composite.js';
import { drawBitmap } from './bitmap.js';
import { createSurface, ImageData, readRegion, writeRegion } from './surface.js';
import { shadowActive, compositeShadow } from './shadow.js';
import { defaultState, cloneState, PROPERTIES } from './state.js';
import * as text from './text.js';

const MAX_BYTE = 255;
/** Direções da dilatação do strokeText (8 vizinhos + centro). */
const STROKE_TEXT_DIRECTIONS = 8;

/** Fonte de pixels de um argumento do drawImage: canvas 2D do host, Image/ImageBitmap do host. */
function bitmapSource(image) {
  if (image && image.__surface) return image.__surface;
  if (image && image.rgba && image.width > 0) {
    return { data: new Uint8Array(image.rgba), width: image.width, height: image.height };
  }
  if (image && image.width === 0) return null; // imagem ainda não carregou: no-op, como no browser
  throw new TypeError("drawImage: fonte não suportada no host (esperado canvas, Image ou ImageBitmap)");
}

/** Normaliza retângulo com largura/altura negativa (a spec faz o mesmo). */
function normalizeRect(x, y, w, h) {
  return w < 0 || h < 0 ? [w < 0 ? x + w : x, h < 0 ? y + h : y, Math.abs(w), Math.abs(h)] : [x, y, w, h];
}

/** Máscara do texto engordada em `radius` px (contorno do strokeText). */
function dilateMask(mask, radius) {
  const r = Math.max(1, Math.round(radius));
  const width = mask.width + 2 * r;
  const height = mask.height + 2 * r;
  const data = new Uint8Array(width * height * 4);
  const offsets = [[0, 0]];
  for (let k = 0; k < STROKE_TEXT_DIRECTIONS; k++) {
    const t = (k * Math.PI * 2) / STROKE_TEXT_DIRECTIONS;
    offsets.push([Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r)]);
  }
  for (const [ox, oy] of offsets) {
    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < mask.width; x++) {
        const a = mask.data[(y * mask.width + x) * 4 + 3];
        const j = ((y + r + oy) * width + (x + r + ox)) * 4 + 3;
        if (a > data[j]) data[j] = a;
      }
    }
  }
  return { data, width, height, pad: r };
}

export class CanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this._state = defaultState();
    this._stack = [];
    this._path = new Path();
    this._layer = null;
  }

  /** Reinício por redimensionar o canvas (o browser zera estado e caminho). */
  _reset() {
    this._state = defaultState();
    this._stack = [];
    this._path.reset();
    this._layer = null;
  }

  _surface() {
    return this.canvas.__surface;
  }

  getContextAttributes() {
    return { alpha: true, colorSpace: 'srgb', desynchronized: false, willReadFrequently: false };
  }

  // ── estado ────────────────────────────────────────────────────────────────
  save() {
    this._stack.push(cloneState(this._state));
  }

  restore() {
    if (this._stack.length > 0) this._state = this._stack.pop();
  }

  reset() {
    this._reset();
    this._surface().data.fill(0);
  }

  // ── transform ─────────────────────────────────────────────────────────────
  translate(x, y) { mat.translate(this._state.matrix, x, y); }
  scale(x, y) { mat.scale(this._state.matrix, x, y); }
  rotate(angle) { mat.rotate(this._state.matrix, angle); }
  transform(a, b, c, d, e, f) { mat.multiply(this._state.matrix, a, b, c, d, e, f); }
  resetTransform() { this._state.matrix = mat.identity(); }

  setTransform(a, b, c, d, e, f) {
    if (a === undefined) {
      this.resetTransform();
      return;
    }
    const m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f];
    if (mat.isFiniteMatrix(m)) this._state.matrix = m;
  }

  getTransform() {
    const [a, b, c, d, e, f] = this._state.matrix;
    return { a, b, c, d, e, f, m11: a, m12: b, m21: c, m22: d, m41: e, m42: f, is2D: true, isIdentity: a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0 };
  }

  // ── tintas ────────────────────────────────────────────────────────────────
  createLinearGradient(x0, y0, x1, y1) {
    return new CanvasGradient('linear', [x0, y0, x1, y1]);
  }

  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    if (r0 < 0 || r1 < 0) throw new RangeError('IndexSizeError: raio negativo');
    return new CanvasGradient('radial', [x0, y0, r0, x1, y1, r1]);
  }

  createPattern() {
    throw new Error('CanvasRenderingContext2D.createPattern: não suportado no host nativo (SPEC-0313)');
  }

  // ── linha ─────────────────────────────────────────────────────────────────
  setLineDash(segments) {
    if (!segments || segments.some((v) => !isFinite(v) || v < 0)) return;
    const list = Array.from(segments, Number);
    this._state.dash = list.length % 2 === 1 ? list.concat(list) : list;
  }

  getLineDash() {
    return this._state.dash.slice();
  }

  // ── caminho ───────────────────────────────────────────────────────────────
  beginPath() { this._path.reset(); }
  closePath() { this._path.closePath(); }
  moveTo(x, y) { if (isFinite(x + y)) this._path.moveTo(this._state.matrix, x, y); }
  lineTo(x, y) { if (isFinite(x + y)) this._path.lineTo(this._state.matrix, x, y); }
  rect(x, y, w, h) { if (isFinite(x + y + w + h)) this._path.rect(this._state.matrix, x, y, w, h); }

  arc(x, y, r, start, end, ccw) {
    if (isFinite(x + y + r + start + end)) this._path.ellipse(this._state.matrix, x, y, r, r, 0, start, end, !!ccw);
  }

  ellipse(x, y, rx, ry, rotation, start, end, ccw) {
    if (isFinite(x + y + rx + ry + rotation + start + end)) this._path.ellipse(this._state.matrix, x, y, rx, ry, rotation, start, end, !!ccw);
  }

  quadraticCurveTo(cpx, cpy, x, y) {
    if (isFinite(cpx + cpy + x + y)) this._path.quadraticCurveTo(this._state.matrix, cpx, cpy, x, y);
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (isFinite(c1x + c1y + c2x + c2y + x + y)) this._path.bezierCurveTo(this._state.matrix, c1x, c1y, c2x, c2y, x, y);
  }

  // ── pintura ───────────────────────────────────────────────────────────────
  /** Roda `paintInto(surface)` direto, ou numa camada quando há sombra. */
  _draw(paintInto) {
    const surface = this._surface();
    if (surface.width === 0 || surface.height === 0) return;
    if (!shadowActive(this._state)) {
      paintInto(surface);
      return;
    }
    if (!this._layer || this._layer.width !== surface.width || this._layer.height !== surface.height) {
      this._layer = createSurface(surface.width, surface.height);
    }
    const layer = this._layer;
    layer.data.fill(0);
    paintInto(layer);
    compositeShadow(surface, layer, this._state, this._state.clip);
    const rowBytes = surface.width * 4;
    for (let y = 0; y < surface.height; y++) {
      blendColorRow(surface, y, 0, surface.width, layer.data.subarray(y * rowBytes, (y + 1) * rowBytes), null, 1, null);
    }
  }

  _fillSubpaths(subpaths, evenOdd, style) {
    const s = this._state;
    const paint = resolvePaint(style, s.matrix);
    if (!paint) return;
    this._draw((surface) => {
      rasterizePath(subpaths, evenOdd, surface.width, surface.height, (y, x0, x1, cov) => {
        blendRow(surface, y, x0, x1, paint, cov, false, s.globalAlpha, s.clip);
      });
    });
  }

  _strokeSubpaths(subpaths) {
    const s = this._state;
    const k = mat.meanScale(s.matrix);
    const polygons = strokeToPolygons(subpaths, {
      hw: (s.lineWidth * k) / 2,
      cap: s.lineCap,
      join: s.lineJoin,
      miterLimit: s.miterLimit,
      dash: s.dash.map((v) => v * k),
      dashOffset: s.lineDashOffset * k,
    });
    this._fillSubpaths(polygons, false, s.strokeStyle);
  }

  fill(rule) {
    this._fillSubpaths(this._path.subpaths, rule === 'evenodd', this._state.fillStyle);
  }

  stroke() {
    this._strokeSubpaths(this._path.subpaths);
  }

  clip(rule) {
    const surface = this._surface();
    const { width, height } = surface;
    const mask = new Uint8Array(width * height);
    const old = this._state.clip;
    rasterizePath(this._path.subpaths, rule === 'evenodd', width, height, (y, x0, x1, cov) => {
      const base = y * width;
      for (let x = x0; x < x1; x++) {
        const v = cov[x] * MAX_BYTE;
        mask[base + x] = old ? (v * old[base + x]) / MAX_BYTE : v;
      }
    });
    this._state.clip = mask;
  }

  _rectSubpaths(x, y, w, h) {
    const p = new Path();
    p.rect(this._state.matrix, x, y, w, h);
    return p.subpaths;
  }

  fillRect(x, y, w, h) {
    if (!isFinite(x + y + w + h) || w === 0 || h === 0) return;
    const s = this._state;
    const m = s.matrix;
    if (!mat.isAxisAligned(m) || shadowActive(s)) {
      this._fillSubpaths(this._rectSubpaths(x, y, w, h), false, s.fillStyle);
      return;
    }
    const paint = resolvePaint(s.fillStyle, m);
    if (!paint) return;
    const surface = this._surface();
    const xa = m[0] * x + m[4];
    const xb = m[0] * (x + w) + m[4];
    const ya = m[3] * y + m[5];
    const yb = m[3] * (y + h) + m[5];
    rasterizeRect(Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb), surface.width, surface.height, (row, x0, x1, cov, rowFull) => {
      blendRow(surface, row, x0, x1, paint, cov, rowFull, s.globalAlpha, s.clip);
    });
  }

  strokeRect(x, y, w, h) {
    if (isFinite(x + y + w + h)) this._strokeSubpaths(this._rectSubpaths(x, y, w, h));
  }

  clearRect(x, y, w, h) {
    if (!isFinite(x + y + w + h) || w === 0 || h === 0) return;
    const s = this._state;
    const surface = this._surface();
    const erase = (row, x0, x1, cov, rowFull) => eraseRow(surface, row, x0, x1, cov, rowFull, s.clip);
    const m = s.matrix;
    if (!mat.isAxisAligned(m)) {
      rasterizePath(this._rectSubpaths(x, y, w, h), false, surface.width, surface.height, (row, x0, x1, cov) => erase(row, x0, x1, cov, false));
      return;
    }
    const xa = m[0] * x + m[4];
    const xb = m[0] * (x + w) + m[4];
    const ya = m[3] * y + m[5];
    const yb = m[3] * (y + h) + m[5];
    rasterizeRect(Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb), surface.width, surface.height, erase);
  }

  // ── imagem ────────────────────────────────────────────────────────────────
  drawImage(image, ...args) {
    const src = bitmapSource(image);
    if (!src || src.width === 0 || src.height === 0) return;
    let sx = 0, sy = 0, sw = src.width, sh = src.height, dx, dy, dw, dh;
    if (args.length === 2) [dx, dy, dw, dh] = [args[0], args[1], sw, sh];
    else if (args.length === 4) [dx, dy, dw, dh] = args;
    else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    else throw new TypeError('drawImage: número de argumentos inválido');
    [sx, sy, sw, sh] = normalizeRect(sx, sy, sw, sh);
    [dx, dy, dw, dh] = normalizeRect(dx, dy, dw, dh);
    if (!isFinite(sx + sy + sw + sh + dx + dy + dw + dh) || sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
    const s = this._state;
    const matrix = s.matrix.slice();
    mat.translate(matrix, dx, dy);
    mat.scale(matrix, dw / sw, dh / sh);
    mat.translate(matrix, -sx, -sy);
    const surface = this._surface();
    // desenhar o canvas nele mesmo: a fonte é o conteúdo de ANTES (spec)
    const source = src === surface ? { data: surface.data.slice(), width: src.width, height: src.height } : src;
    this._draw((target) => {
      drawBitmap(target, source, { rect: { sx, sy, sw, sh }, matrix, smooth: s.imageSmoothingEnabled, alpha: s.globalAlpha, clip: s.clip, tint: null });
    });
  }

  getImageData(sx, sy, sw, sh) {
    [sx, sy, sw, sh] = normalizeRect(Math.floor(sx), Math.floor(sy), Math.floor(sw), Math.floor(sh));
    if (sw === 0 || sh === 0) throw new RangeError('IndexSizeError: getImageData com largura/altura 0');
    return readRegion(this._surface(), sx, sy, sw, sh);
  }

  putImageData(image, dx, dy) {
    writeRegion(this._surface(), image, Math.floor(dx), Math.floor(dy));
  }

  createImageData(a, b) {
    return typeof a === 'object' ? new ImageData(a.width, a.height) : new ImageData(Math.abs(a), Math.abs(b));
  }

  // ── texto ─────────────────────────────────────────────────────────────────
  /** Matriz máscara(px) → dispositivo, ou null se não há o que desenhar. */
  _textMatrix(mask, devPx, scaleDev, x, y, maxWidth) {
    const s = this._state;
    const advance = text.maskAdvance(mask) / scaleDev;
    const squeeze = maxWidth !== undefined && advance > maxWidth ? Math.max(0, maxWidth) / advance : 1;
    if (squeeze === 0) return null;
    const startX = x + text.alignShift(s.textAlign, advance * squeeze);
    const baselineY = y + text.baselineShift(s.textBaseline, s.fontPx);
    const kx = squeeze / scaleDev;
    const ky = 1 / scaleDev;
    const matrix = s.matrix.slice();
    mat.multiply(matrix, kx, 0, 0, ky, startX - text.maskPadLeft() * kx, baselineY - text.maskBaseline(devPx) * ky);
    return matrix;
  }

  _drawText(value, x, y, maxWidth, style, outline) {
    const s = this._state;
    const scaleDev = mat.meanScale(s.matrix);
    const devPx = s.fontPx * scaleDev;
    if (!isFinite(x + y) || !(devPx > 0)) return;
    const mask = text.rasterText(String(value), devPx);
    if (!mask) return;
    const matrix = this._textMatrix(mask, devPx, scaleDev, x, y, maxWidth);
    const paint = resolvePaint(style, s.matrix);
    if (!matrix || !paint) return;
    let drawn = mask;
    if (outline) {
      drawn = dilateMask(mask, (s.lineWidth * scaleDev) / 2);
      mat.translate(matrix, -drawn.pad, -drawn.pad);
    }
    this._draw((target) => {
      drawBitmap(target, drawn, { rect: { sx: 0, sy: 0, sw: drawn.width, sh: drawn.height }, matrix, smooth: true, alpha: s.globalAlpha, clip: s.clip, tint: paint });
    });
  }

  fillText(value, x, y, maxWidth) {
    this._drawText(value, x, y, maxWidth, this._state.fillStyle, false);
  }

  /** Contorno aproximado: a máscara dilatada por lineWidth/2 (ponytail: não é o traço vetorial do glifo). */
  strokeText(value, x, y, maxWidth) {
    this._drawText(value, x, y, maxWidth, this._state.strokeStyle, true);
  }

  measureText(value) {
    const s = this._state;
    return text.measure(value, s.fontPx, s.textAlign, s.textBaseline);
  }
}

for (const name of Object.keys(PROPERTIES)) {
  Object.defineProperty(CanvasRenderingContext2D.prototype, name, Object.assign({ configurable: true }, PROPERTIES[name]));
}
