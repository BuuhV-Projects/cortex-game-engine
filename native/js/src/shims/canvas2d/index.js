// Canvas 2D do host nativo (SPEC-0313 / ADR-0312) — instala os globais do
// browser e registra a fábrica de <canvas> no dom-lite. Mapa dos módulos:
//   canvas-element.js  <canvas> (width/height/getContext/rgba)
//   context.js         CanvasRenderingContext2D (orquestra; rasterização ADIADA até ler pixels)
//   clip.js            recorte com máscara calculada sob demanda
//   state.js           estado do save/restore + propriedades validadas
//   matrix.js          matriz afim
//   path.js            caminho em px de dispositivo (curvas achatadas)
//   raster.js          cobertura por sub-scanline (polígono e retângulo)
//   stroke.js          traço → polígonos (junções, pontas, tracejado)
//   paint.js           CanvasGradient e resolução de fillStyle/strokeStyle
//   composite.js       source-over numa linha (caminho rápido uint32)
//   bitmap.js          drawImage / máscara de texto transformados
//   text.js            métrica e layout de texto (raster = __cortexRasterText)
//   shadow.js          sombra com blur de caixa
//   surface.js         buffer RGBA, ImageData, get/putImageData
//   color.js           cor CSS → RGBA
import { registerElementFactory } from '../dom-lite.js';
import { createCanvasElement, HTMLCanvasElement } from './canvas-element.js';
import { CanvasRenderingContext2D } from './context.js';
import { CanvasGradient } from './paint.js';
import { ImageData } from './surface.js';

export function installCanvas2d() {
  registerElementFactory('canvas', () => createCanvasElement());
  globalThis.HTMLCanvasElement = HTMLCanvasElement;
  globalThis.CanvasRenderingContext2D = CanvasRenderingContext2D;
  globalThis.CanvasGradient = CanvasGradient;
  globalThis.ImageData = ImageData;
  globalThis.OffscreenCanvas = function OffscreenCanvas(width, height) {
    return createCanvasElement(width, height);
  };
}

export { createCanvasElement };
