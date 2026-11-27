// createImageBitmap sobre o decoder nativo (__cortexDecodeImage / stb).
// O bitmap resultante (width, height, rgba) é o formato que o
// copyExternalImageToTexture nativo espera como `source`. O `rgba` se solta
// depois do upload e se refaz dos bytes comprimidos (SPEC-0748 / ADR-0749).
import {
  decodePixels,
  definePixelAccessors,
  initPixels,
  installImageReleaseStats,
} from './image-pixels.js';

// Bytes comprimidos EXATOS da fonte. Vista parcial (ex.: um trecho do GLB
// inteiro) vira cópia só do trecho: o bitmap guarda esses bytes para o
// redecode, e guardar a vista prenderia o buffer maior.
function extractBytes(source) {
  if (source && source.__bytes) return source.__bytes;         // BlobLite
  if (source instanceof ArrayBuffer) return source;
  if (source && source.buffer instanceof ArrayBuffer) {
    const whole = source.byteOffset === 0 && source.byteLength === source.buffer.byteLength;
    return whole ? source.buffer : source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  }
  return null;
}

// Protótipo do bitmap do host. Não herda de ImageBitmap de propósito: o
// bitmap sempre foi um objeto simples para o three, e isso não muda.
const bitmapProto = {
  close() {
    this.__pixels = null;
    this.__cortexCompressed = null;
  },
};
definePixelAccessors(bitmapProto);

function makeBitmap(width, height, pixels, compressed, flipY) {
  const bitmap = Object.create(bitmapProto);
  bitmap.width = width;
  bitmap.height = height;
  initPixels(bitmap, pixels, compressed, flipY);
  return bitmap;
}

export function installImageShims() {
  installImageReleaseStats();
  globalThis.createImageBitmap = function (source, options) {
    // Fonte soltável (Image fake / outro bitmap): passa direto, sem forçar um
    // redecode. A posse dos pixels vai para o bitmap (a fonte fica só com os
    // bytes comprimidos): dois donos do mesmo buffer o prenderiam depois de o
    // bitmap soltar.
    if (source && source.__cortexCompressed && source.width > 0) {
      const bitmap = makeBitmap(source.width, source.height, source.__pixels,
        source.__cortexCompressed, source.__cortexFlipY);
      source.__pixels = null;
      return Promise.resolve(bitmap);
    }
    // Fonte JÁ decodificada sem bytes comprimidos (pixels à mão): como antes.
    if (source && source.rgba && source.width > 0) {
      return Promise.resolve(makeBitmap(source.width, source.height, source.rgba, null, false));
    }
    const bytes = extractBytes(source);
    if (!bytes) {
      print('[image] createImageBitmap: fonte não suportada (tipo=' +
        (source && source.constructor ? source.constructor.name : typeof source) + ')');
      return Promise.reject(new Error('createImageBitmap: fonte não suportada'));
    }
    // imageOrientation 'flipY': invertemos aqui (uma vez, no decode) pra não
    // pagar flip por upload no copyExternalImageToTexture. O redecode repete.
    const flipY = !!(options && options.imageOrientation === 'flipY');
    const decoded = decodePixels(bytes, flipY);
    if (!decoded) {
      print('[image] createImageBitmap: decode falhou (' + bytes.byteLength +
        ' bytes, magic=' + new Uint8Array(bytes, 0, 4).join(',') + ')');
      return Promise.reject(new Error('createImageBitmap: decode falhou'));
    }
    return Promise.resolve(makeBitmap(decoded.width, decoded.height, decoded.rgba, bytes, flipY));
  };
  globalThis.ImageBitmap = function ImageBitmap() {};

  // ── Image/HTMLImageElement fake ───────────────────────────────────────────
  // O THREE.TextureLoader usa ImageLoader → createElementNS('img') + .src +
  // evento 'load' (skybox/environment, cáusticas da água, backgrounds...).
  // Este fake busca via fetch, decodifica no stb e HERDA de ImageBitmap —
  // o upload do three cai no copyExternalImageToTexture nativo (width/
  // height/rgba), sem canvas.
  //
  // Cache por URL (SPEC-0188+): sem isso, telas revisitadas com frequência
  // (loading, água com cáusticas) refazem fetch+decode toda entrada de fase —
  // cada decode gera um ArrayBuffer RGBA novo no heap Hermes (ex.: 2048² =
  // 16.8 MB) que o GC não coleta com pressão suficiente durante o gameplay
  // (só há nudge explícito no reset de fase, ADR-0153) — o "external" do
  // GCBase::HeapInfo cresce sem limite e estoura o teto de heap (512 MB) numa
  // sessão longa. O decode do pipeline de kit (GLB/KTX2) já cacheia por URL
  // via SceneAssets — este é o mesmo padrão pro caminho Image/TextureLoader.
  // Desde a SPEC-0748 o cache guarda só { width, height, bytes } (o PNG/JPG
  // comprimido): o RGBA se solta no upload e se refaz quando alguém ler `rgba`.
  const decodedImageCache = new Map();
  function FakeImage() {
    this.width = 0;
    this.height = 0;
    initPixels(this, null, null, false);
    this.complete = false;
    this.__listeners = {};
    this.__src = '';
    // Elemento do DOM: código de HUD (ex.: Speedometer do engine) estiliza o
    // <img> — inerte no host, mas precisa existir (SPEC-0313).
    this.style = {};
  }
  FakeImage.prototype = Object.create(globalThis.ImageBitmap.prototype);
  definePixelAccessors(FakeImage.prototype);
  FakeImage.prototype.addEventListener = function (type, cb) {
    (this.__listeners[type] = this.__listeners[type] || []).push(cb);
  };
  FakeImage.prototype.removeEventListener = function (type, cb) {
    const list = this.__listeners[type];
    if (list) {
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    }
  };
  FakeImage.prototype.__emit = function (type) {
    const event = { type, target: this };
    for (const cb of (this.__listeners[type] || []).slice()) cb.call(this, event);
    const inline = this['on' + type];
    if (inline) inline.call(this, event);
  };
  Object.defineProperty(FakeImage.prototype, 'src', {
    get() { return this.__src; },
    set(url) {
      this.__src = url;
      const self = this;
      const cached = decodedImageCache.get(url);
      if (cached) {
        // Reentrada na mesma URL (fase/tela revisitada): reusa os bytes já
        // lidos — sem fetch e sem decode até alguém ler `rgba`. Ainda assíncrono
        // (Promise.resolve) pra manter o contrato de 'load' em microtask,
        // igual ao caminho de rede.
        Promise.resolve().then(function () {
          self.width = cached.width;
          self.height = cached.height;
          initPixels(self, null, cached.bytes, false);
          self.complete = true;
          self.__emit('load');
        });
        return;
      }
      fetch(url)
        .then(function (response) {
          if (!response.ok) throw new Error('Image: 404 ' + url);
          return response.arrayBuffer();
        })
        .then(function (bytes) {
          const decoded = decodePixels(bytes, false);
          if (!decoded) throw new Error('Image: decode falhou ' + url);
          decodedImageCache.set(url, { width: decoded.width, height: decoded.height, bytes });
          self.width = decoded.width;
          self.height = decoded.height;
          initPixels(self, decoded.rgba, bytes, false);
          self.complete = true;
          self.__emit('load');
        })
        .catch(function (error) {
          print('[image] ' + error);
          self.__emit('error');
        });
    },
  });
  globalThis.Image = FakeImage;
  globalThis.HTMLImageElement = FakeImage;
}
