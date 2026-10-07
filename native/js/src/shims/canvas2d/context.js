// CanvasRenderingContext2D do host nativo (SPEC-0313 / ADR-0312). Esta classe
// só orquestra: estado (state.js), caminho (path.js), cobertura (raster.js),
// traço (stroke.js), tinta (paint.js), composição (composite.js), bitmap
// (bitmap.js), texto (text.js), sombra (shadow.js) e recorte (clip.js).
//
// RASTERIZAÇÃO ADIADA: estado, transform e caminho rodam na hora (são baratos
// e o jogo pode lê-los); as operações que mexem em PIXEL entram numa fila com
// uma foto do estado e só rodam quando alguém lê os pixels — upload pro three
// (`canvas.rgba`), getImageData, ou drawImage usando este canvas como fonte.
// Um canvas que ninguém lê (radar/mapa DOM do DDD 61, invisíveis no host)
// custa só a gravação. A observação é idêntica à execução imediata.
import * as mat from './matrix.js';
import { Path } from './path.js';
import { rasterizePath, rasterizeRect } from './raster.js';
import { strokeToPolygons } from './stroke.js';
import { CanvasGradient, resolvePaint } from './paint.js';
import { blendRow, blendColorRow, eraseRow, packColor } from './composite.js';
import { drawBitmap } from './bitmap.js';
import { createSurface, ImageData, readRegion, writeRegion } from './surface.js';
import { shadowActive, compositeShadow, paintedBox, clearBox } from './shadow.js';
import { createClip, resolveClip } from './clip.js';
import { defaultState, cloneState, PROPERTIES } from './state.js';
import * as text from './text.js';

const MAX_BYTE = 255;
/** Direções da dilatação do strokeText (8 vizinhos + centro). */
const STROKE_TEXT_DIRECTIONS = 8;
/** Teto da fila de um canvas que nunca é lido nem limpo por inteiro (rasteriza ao passar). */
const MAX_PENDING_OPS = 20000;

/**
 * Pixels de um argumento do drawImage. Canvas 2D do host: rasteriza o que estiver
 * pendente e marca o buffer como COMPARTILHADO — se a fonte for pintada de novo
 * antes de a fila de quem leu rodar, ela troca de buffer (cópia na escrita) e a
 * leitura enxerga o conteúdo da hora da chamada, como no browser.
 */
function bitmapSource(image) {
  if (image && image.__surface) {
    if (image.__context) image.__context._flush();
    const surface = image.__surface;
    surface.shared = true;
    return { data: surface.data, width: surface.width, height: surface.height };
  }
  if (image && image.rgba && image.width > 0) {
    return { data: new Uint8Array(image.rgba), width: image.width, height: image.height };
  }
  if (image && image.width === 0) return null; // imagem ainda não carregou: no-op, como no browser
  throw new TypeError('drawImage: fonte não suportada no host (esperado canvas, Image ou ImageBitmap)');
}

/** Antes de escrever num buffer que alguém ainda vai ler: copia (cópia na escrita). */
function detachIfShared(surface) {
  if (!surface.shared) return;
  const buffer = surface.buffer.slice(0);
  surface.buffer = buffer;
  surface.data = new Uint8ClampedArray(buffer);
  surface.u32 = new Uint32Array(buffer);
  surface.shared = false;
}

/** Normaliza retângulo com largura/altura negativa (a spec faz o mesmo). */
function normalizeRect(x, y, w, h) {
  return w < 0 || h < 0 ? [w < 0 ? x + w : x, h < 0 ? y + h : y, Math.abs(w), Math.abs(h)] : [x, y, w, h];
}

/** Cópia profunda dos subcaminhos (o caminho vivo continua crescendo depois da chamada). */
function copySubpaths(subpaths) {
  return subpaths.map((sp) => ({ pts: sp.pts.slice(), closed: sp.closed }));
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

/** Retângulo de dispositivo [x0,y0,x1,y1] de um rect com matriz sem rotação. */
function deviceRect(m, x, y, w, h) {
  const xa = m[0] * x + m[4];
  const xb = m[0] * (x + w) + m[4];
  const ya = m[3] * y + m[5];
  const yb = m[3] * (y + h) + m[5];
  return [Math.min(xa, xb), Math.min(ya, yb), Math.max(xa, xb), Math.max(ya, yb)];
}

/** Retângulo de dispositivo com bordas inteiras (sem antialias a fazer). */
function isPixelAligned(r) {
  return r[0] === Math.floor(r[0]) && r[1] === Math.floor(r[1]) && r[2] === Math.floor(r[2]) && r[3] === Math.floor(r[3]);
}

/** fillRect opaco alinhado ao pixel: Uint32Array.fill por linha, nada mais. */
function fillAlignedOpaque(surface, r, rgba) {
  const x0 = Math.max(0, r[0]);
  const x1 = Math.min(surface.width, r[2]);
  const y0 = Math.max(0, r[1]);
  const y1 = Math.min(surface.height, r[3]);
  if (x1 <= x0 || y1 <= y0) return;
  const color = packColor(rgba[0], rgba[1], rgba[2], MAX_BYTE);
  for (let y = y0; y < y1; y++) surface.u32.fill(color, y * surface.width + x0, y * surface.width + x1);
}

function coversSurface(r, surface) {
  return r[0] <= 0 && r[1] <= 0 && r[2] >= surface.width && r[3] >= surface.height;
}

export class CanvasRenderingContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this._state = defaultState();
    this._stack = [];
    this._path = new Path();
    this._layer = null;
    this._queue = [];
    this._snap = null;
  }

  /** Reinício por redimensionar o canvas (o browser zera estado e caminho). */
  _reset() {
    this._state = defaultState();
    this._stack = [];
    this._path.reset();
    this._layer = null;
    this._queue.length = 0;
    this._snap = null;
  }

  _surface() {
    return this.canvas.__surface;
  }

  // ── fila adiada ───────────────────────────────────────────────────────────
  /** Foto do estado pra fila — reaproveitada até o estado mudar (`_snap = null`). */
  _snapshot() {
    if (!this._snap) this._snap = cloneState(this._state);
    return this._snap;
  }

  _enqueue(op) {
    // Toda operação de pixel muda o conteúdo: a UI de runtime re-sobe o canvas
    // quando a versão muda (ADR-0315 / SPEC-0317).
    this.canvas.__cortexVersion++;
    this._queue.push(op);
    if (this._queue.length >= MAX_PENDING_OPS) this._flush();
  }

  /** Roda as operações pendentes (chamado por quem LÊ os pixels). */
  _flush() {
    const queue = this._queue;
    if (queue.length === 0) return;
    this._queue = [];
    const surface = this._surface();
    detachIfShared(surface);
    for (let i = 0; i < queue.length; i++) queue[i](surface);
  }

  /** O que veio antes some debaixo de uma limpeza/pintura opaca do canvas inteiro. */
  _dropPending() {
    this._queue.length = 0;
  }

  getContextAttributes() {
    return { alpha: true, colorSpace: 'srgb', desynchronized: false, willReadFrequently: false };
  }

  // ── estado ────────────────────────────────────────────────────────────────
  save() {
    this._stack.push(cloneState(this._state));
  }

  restore() {
    if (this._stack.length === 0) return;
    this._state = this._stack.pop();
    this._snap = null;
  }

  reset() {
    this._reset();
    this._enqueue((surface) => surface.data.fill(0));
  }

  // ── transform ─────────────────────────────────────────────────────────────
  translate(x, y) { mat.translate(this._state.matrix, x, y); this._snap = null; }
  scale(x, y) { mat.scale(this._state.matrix, x, y); this._snap = null; }
  rotate(angle) { mat.rotate(this._state.matrix, angle); this._snap = null; }
  transform(a, b, c, d, e, f) { mat.multiply(this._state.matrix, a, b, c, d, e, f); this._snap = null; }
  resetTransform() { this._state.matrix = mat.identity(); this._snap = null; }

  setTransform(a, b, c, d, e, f) {
    if (a === undefined) {
      this.resetTransform();
      return;
    }
    const m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f];
    if (!mat.isFiniteMatrix(m)) return;
    this._state.matrix = m;
    this._snap = null;
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
    this._snap = null;
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

  // ── pintura (rodam na fila, com o estado `s` da hora da chamada) ─────────────
  /** Roda `paintInto(alvo, clipMask)` direto, ou numa camada quando há sombra. */
  _draw(surface, s, paintInto) {
    if (surface.width === 0 || surface.height === 0) return;
    const clip = resolveClip(s.clip, surface.width, surface.height);
    if (!shadowActive(s)) {
      paintInto(surface, clip);
      return;
    }
    if (!this._layer || this._layer.width !== surface.width || this._layer.height !== surface.height) {
      this._layer = createSurface(surface.width, surface.height);
    }
    const layer = this._layer; // invariante: chega limpa (só a caixa usada é zerada no fim)
    const touched = paintInto(layer, clip); // caixa conhecida (bitmap/texto) ou varre a camada
    const box = touched === undefined ? paintedBox(layer) : touched;
    if (box && (box.x1 <= box.x0 || box.y1 <= box.y0)) return;
    if (!box) return;
    compositeShadow(surface, layer, s, clip, box);
    const rowBytes = surface.width * 4;
    for (let y = box.y0; y < box.y1; y++) {
      blendColorRow(surface, y, box.x0, box.x1, layer.data.subarray(y * rowBytes, (y + 1) * rowBytes), null, 1, null);
    }
    clearBox(layer, box);
  }

  _fillSubpaths(surface, s, subpaths, evenOdd, style) {
    const paint = resolvePaint(style, s.matrix);
    if (!paint) return;
    this._draw(surface, s, (target, clip) => {
      rasterizePath(subpaths, evenOdd, target.width, target.height, (y, x0, x1, cov) => {
        blendRow(target, y, x0, x1, paint, cov, false, s.globalAlpha, clip);
      });
    });
  }

  _strokePolygons(s, subpaths) {
    const k = mat.meanScale(s.matrix);
    return strokeToPolygons(subpaths, {
      hw: (s.lineWidth * k) / 2,
      cap: s.lineCap,
      join: s.lineJoin,
      miterLimit: s.miterLimit,
      dash: s.dash.map((v) => v * k),
      dashOffset: s.lineDashOffset * k,
    });
  }

  fill(rule) {
    const s = this._snapshot();
    const subpaths = copySubpaths(this._path.subpaths);
    const evenOdd = rule === 'evenodd';
    this._enqueue((surface) => this._fillSubpaths(surface, s, subpaths, evenOdd, s.fillStyle));
  }

  stroke() {
    const s = this._snapshot();
    const subpaths = copySubpaths(this._path.subpaths);
    this._enqueue((surface) => this._fillSubpaths(surface, s, this._strokePolygons(s, subpaths), false, s.strokeStyle));
  }

  clip(rule) {
    this._state.clip = createClip(copySubpaths(this._path.subpaths), rule === 'evenodd', this._state.clip);
    this._snap = null;
  }

  _rectSubpaths(m, x, y, w, h) {
    const p = new Path();
    p.rect(m, x, y, w, h);
    return p.subpaths;
  }

  fillRect(x, y, w, h) {
    if (!isFinite(x + y + w + h) || w === 0 || h === 0) return;
    const s = this._snapshot();
    const m = s.matrix;
    if (!mat.isAxisAligned(m) || shadowActive(s)) {
      const subpaths = this._rectSubpaths(m, x, y, w, h);
      this._enqueue((surface) => this._fillSubpaths(surface, s, subpaths, false, s.fillStyle));
      return;
    }
    const r = deviceRect(m, x, y, w, h);
    const style = s.fillStyle;
    const opaqueCover = !s.clip && s.globalAlpha >= 1 && !(style instanceof CanvasGradient) && style[3] >= 1 && coversSurface(r, this._surface());
    if (opaqueCover) this._dropPending();
    if (isPixelAligned(r) && !s.clip && s.globalAlpha >= 1 && !(style instanceof CanvasGradient) && style[3] >= 1) {
      this._enqueue((surface) => fillAlignedOpaque(surface, r, style));
      return;
    }
    this._enqueue((surface) => {
      const paint = resolvePaint(style, m);
      if (!paint) return;
      const clip = resolveClip(s.clip, surface.width, surface.height);
      rasterizeRect(r[0], r[1], r[2], r[3], surface.width, surface.height, (row, x0, x1, cov, rowFull) => {
        blendRow(surface, row, x0, x1, paint, cov, rowFull, s.globalAlpha, clip);
      });
    });
  }

  strokeRect(x, y, w, h) {
    if (!isFinite(x + y + w + h)) return;
    const s = this._snapshot();
    const subpaths = this._rectSubpaths(s.matrix, x, y, w, h);
    this._enqueue((surface) => this._fillSubpaths(surface, s, this._strokePolygons(s, subpaths), false, s.strokeStyle));
  }

  clearRect(x, y, w, h) {
    if (!isFinite(x + y + w + h) || w === 0 || h === 0) return;
    const s = this._snapshot();
    const m = s.matrix;
    if (!mat.isAxisAligned(m)) {
      const subpaths = this._rectSubpaths(m, x, y, w, h);
      this._enqueue((surface) => {
        const clip = resolveClip(s.clip, surface.width, surface.height);
        rasterizePath(subpaths, false, surface.width, surface.height, (row, x0, x1, cov) => eraseRow(surface, row, x0, x1, cov, false, clip));
      });
      return;
    }
    const r = deviceRect(m, x, y, w, h);
    if (!s.clip && coversSurface(r, this._surface())) {
      this._dropPending(); // limpar tudo: o que estava na fila nunca será visto
      this._enqueue((surface) => surface.u32.fill(0));
      return;
    }
    this._enqueue((surface) => {
      const clip = resolveClip(s.clip, surface.width, surface.height);
      rasterizeRect(r[0], r[1], r[2], r[3], surface.width, surface.height, (row, x0, x1, cov, rowFull) => eraseRow(surface, row, x0, x1, cov, rowFull, clip));
    });
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
    const s = this._snapshot();
    const matrix = s.matrix.slice();
    mat.translate(matrix, dx, dy);
    mat.scale(matrix, dw / sw, dh / sh);
    mat.translate(matrix, -sx, -sy);
    this._enqueue((surface) => {
      // fonte = este canvas: o buffer já foi trocado na escrita (detach) se mudou depois
      this._draw(surface, s, (target, clip) => {
        return drawBitmap(target, src, { rect: { sx, sy, sw, sh }, matrix, smooth: s.imageSmoothingEnabled, alpha: s.globalAlpha, clip, tint: null });
      });
    });
  }

  getImageData(sx, sy, sw, sh) {
    [sx, sy, sw, sh] = normalizeRect(Math.floor(sx), Math.floor(sy), Math.floor(sw), Math.floor(sh));
    if (sw === 0 || sh === 0) throw new RangeError('IndexSizeError: getImageData com largura/altura 0');
    this._flush();
    return readRegion(this._surface(), sx, sy, sw, sh);
  }

  putImageData(image, dx, dy) {
    const copy = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
    this._enqueue((surface) => writeRegion(surface, copy, Math.floor(dx), Math.floor(dy)));
  }

  createImageData(a, b) {
    return typeof a === 'object' ? new ImageData(a.width, a.height) : new ImageData(Math.abs(a), Math.abs(b));
  }

  // ── texto ─────────────────────────────────────────────────────────────────
  /** Matriz máscara(px) → dispositivo, ou null se não há o que desenhar. */
  _textMatrix(s, mask, devPx, scaleDev, x, y, maxWidth) {
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

  _drawText(value, x, y, maxWidth, outline) {
    const s = this._snapshot();
    const scaleDev = mat.meanScale(s.matrix);
    const devPx = s.fontPx * scaleDev;
    if (!isFinite(x + y) || !(devPx > 0)) return;
    const str = String(value);
    this._enqueue((surface) => {
      const mask = text.rasterText(str, devPx);
      if (!mask) return;
      const matrix = this._textMatrix(s, mask, devPx, scaleDev, x, y, maxWidth);
      const paint = resolvePaint(outline ? s.strokeStyle : s.fillStyle, s.matrix);
      if (!matrix || !paint) return;
      let drawn = mask;
      if (outline) {
        drawn = dilateMask(mask, (s.lineWidth * scaleDev) / 2);
        mat.translate(matrix, -drawn.pad, -drawn.pad);
      }
      this._draw(surface, s, (target, clip) => {
        return drawBitmap(target, drawn, { rect: { sx: 0, sy: 0, sw: drawn.width, sh: drawn.height }, matrix, smooth: true, alpha: s.globalAlpha, clip, tint: paint });
      });
    });
  }

  fillText(value, x, y, maxWidth) {
    this._drawText(value, x, y, maxWidth, false);
  }

  /** Contorno aproximado: a máscara dilatada por lineWidth/2 (ponytail: não é o traço vetorial do glifo). */
  strokeText(value, x, y, maxWidth) {
    this._drawText(value, x, y, maxWidth, true);
  }

  measureText(value) {
    const s = this._state;
    return text.measure(value, s.fontPx, s.textAlign, s.textBaseline);
  }
}

for (const name of Object.keys(PROPERTIES)) {
  const accessor = PROPERTIES[name];
  Object.defineProperty(CanvasRenderingContext2D.prototype, name, {
    configurable: true,
    get: accessor.get,
    // toda escrita de propriedade invalida a foto do estado usada pela fila
    set(value) {
      accessor.set.call(this, value);
      this._snap = null;
    },
  });
}
