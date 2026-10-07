// Elemento <canvas> 2D do host (SPEC-0313). É um elemento do dom-lite (style,
// eventos, getBoundingClientRect) com pixels de verdade:
// - width/height: atribuir (mesmo o mesmo valor) limpa os pixels e o estado;
// - getContext('2d') → sempre o mesmo CanvasRenderingContext2D;
// - `rgba`/`width`/`height` = contrato do ImageBitmap do host: o three sobe o
//   canvas pelo copyExternalImageToTexture nativo sem saber que é um canvas.
import { makeInertElement } from '../dom-lite.js';
import { CanvasRenderingContext2D } from './context.js';
import { createSurface } from './surface.js';

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;

/** Construtor só pro `instanceof HTMLCanvasElement` (como no browser, não se constrói). */
export function HTMLCanvasElement() {
  throw new TypeError('Illegal constructor');
}

function resize(element, width, height) {
  element.__cortexVersion++; // pixels zerados = conteúdo novo (SPEC-0317)
  element.__surface = createSurface(width, height);
  if (element.__context) element.__context._reset();
}

export function createCanvasElement(width, height) {
  const element = makeInertElement('canvas');
  Object.setPrototypeOf(element, HTMLCanvasElement.prototype);
  element.__surface = createSurface(width === undefined ? DEFAULT_WIDTH : width, height === undefined ? DEFAULT_HEIGHT : height);
  element.__context = null;
  // Versão do conteúdo: sobe a cada operação de pixel/redimensionamento. A UI de
  // runtime (UiCanvas, ADR-0316) só re-sobe a textura quando ela muda.
  element.__cortexVersion = 0;
  Object.defineProperty(element, 'width', {
    get() { return element.__surface.width; },
    set(value) { resize(element, Number(value), element.__surface.height); },
    enumerable: true,
  });
  Object.defineProperty(element, 'height', {
    get() { return element.__surface.height; },
    set(value) { resize(element, element.__surface.width, Number(value)); },
    enumerable: true,
  });
  // ImageBitmap do host: o copyExternalImageToTexture nativo lê width/height/rgba.
  // Ler os pixels rasteriza o que estiver na fila (rasterização adiada).
  Object.defineProperty(element, 'rgba', {
    get() {
      if (element.__context) element.__context._flush();
      return element.__surface.buffer;
    },
  });
  element.getContext = function (type) {
    if (type !== '2d') return null;
    if (!element.__context) element.__context = new CanvasRenderingContext2D(element);
    return element.__context;
  };
  element.toDataURL = function () {
    throw new Error('HTMLCanvasElement.toDataURL: não suportado no host nativo (SPEC-0313)');
  };
  element.toBlob = function () {
    throw new Error('HTMLCanvasElement.toBlob: não suportado no host nativo (SPEC-0313)');
  };
  // <canvas width="180"> via innerHTML chega por setAttribute (dom-lite).
  const setAttribute = element.setAttribute;
  element.setAttribute = function (name, value) {
    if (name === 'width' || name === 'height') element[name] = Number(value);
    else setAttribute(name, value);
  };
  return element;
}
