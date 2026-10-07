// Estado de desenho do canvas 2D (SPEC-0313): o que save()/restore() empilham
// e as propriedades do contexto com a validação do browser (valor inválido é
// IGNORADO, fica o anterior — nunca lança).
import { parseColor, serializeColor } from './color.js';
import { identity } from './matrix.js';
import { CanvasGradient } from './paint.js';
import { parseFontSize, defaultFontPx } from './text.js';

const BLACK = [0, 0, 0, 1];
const TRANSPARENT_BLACK = [0, 0, 0, 0];
const DEFAULT_MITER_LIMIT = 10;
const DEFAULT_FONT = '10px sans-serif';

export function defaultState() {
  return {
    matrix: identity(),
    fillStyle: BLACK,
    strokeStyle: BLACK,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: DEFAULT_MITER_LIMIT,
    dash: [],
    lineDashOffset: 0,
    font: DEFAULT_FONT,
    fontPx: defaultFontPx(),
    textAlign: 'start',
    textBaseline: 'alphabetic',
    direction: 'inherit',
    shadowRgba: TRANSPARENT_BLACK,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    filter: 'none',
    clip: null,
  };
}

/** Cópia pra pilha do save(): arrays mutáveis copiados; clip por referência (restore volta a ele). */
export function cloneState(s) {
  const copy = Object.assign({}, s);
  copy.matrix = s.matrix.slice();
  copy.dash = s.dash.slice();
  return copy;
}

function style(name) {
  return {
    get() {
      const v = this._state[name];
      return v instanceof CanvasGradient ? v : serializeColor(v);
    },
    set(value) {
      if (value instanceof CanvasGradient) {
        this._state[name] = value;
        return;
      }
      const rgba = parseColor(value);
      if (rgba) this._state[name] = rgba;
    },
  };
}

function finite(name, isValid) {
  return {
    get() { return this._state[name]; },
    set(value) {
      const v = Number(value);
      if (isFinite(v) && isValid(v)) this._state[name] = v;
    },
  };
}

function oneOf(name, values) {
  return {
    get() { return this._state[name]; },
    set(value) {
      if (values.indexOf(value) >= 0) this._state[name] = value;
    },
  };
}

function plain(name, coerce) {
  return {
    get() { return this._state[name]; },
    set(value) { this._state[name] = coerce(value); },
  };
}

const anyNumber = () => true;

/** Propriedades do CanvasRenderingContext2D (instaladas no protótipo do contexto). */
export const PROPERTIES = {
  fillStyle: style('fillStyle'),
  strokeStyle: style('strokeStyle'),
  globalAlpha: finite('globalAlpha', (v) => v >= 0 && v <= 1),
  globalCompositeOperation: plain('globalCompositeOperation', String),
  lineWidth: finite('lineWidth', (v) => v > 0),
  lineCap: oneOf('lineCap', ['butt', 'round', 'square']),
  lineJoin: oneOf('lineJoin', ['miter', 'round', 'bevel']),
  miterLimit: finite('miterLimit', (v) => v > 0),
  lineDashOffset: finite('lineDashOffset', anyNumber),
  textAlign: oneOf('textAlign', ['start', 'end', 'left', 'right', 'center']),
  textBaseline: oneOf('textBaseline', ['top', 'hanging', 'middle', 'alphabetic', 'ideographic', 'bottom']),
  direction: oneOf('direction', ['ltr', 'rtl', 'inherit']),
  shadowBlur: finite('shadowBlur', (v) => v >= 0),
  shadowOffsetX: finite('shadowOffsetX', anyNumber),
  shadowOffsetY: finite('shadowOffsetY', anyNumber),
  imageSmoothingEnabled: plain('imageSmoothingEnabled', Boolean),
  imageSmoothingQuality: oneOf('imageSmoothingQuality', ['low', 'medium', 'high']),
  filter: plain('filter', String),
  shadowColor: {
    get() { return serializeColor(this._state.shadowRgba); },
    set(value) {
      const rgba = parseColor(value);
      if (rgba) this._state.shadowRgba = rgba;
    },
  },
  font: {
    get() { return this._state.font; },
    set(value) {
      const px = parseFontSize(value);
      if (px === null) return;
      this._state.font = String(value);
      this._state.fontPx = px;
    },
  },
};
