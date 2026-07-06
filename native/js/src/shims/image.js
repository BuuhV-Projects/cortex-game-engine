// createImageBitmap sobre o decoder nativo (__cortexDecodeImage / stb).
// O bitmap resultante ({width, height, rgba}) é o formato que o
// copyExternalImageToTexture nativo espera como `source`.

function extractBytes(source) {
  if (source && source.__bytes) return source.__bytes;         // BlobLite
  if (source instanceof ArrayBuffer) return source;
  if (source && source.buffer instanceof ArrayBuffer) return source.buffer;
  return null;
}

export function installImageShims() {
  globalThis.createImageBitmap = function (source, options) {
    // Fonte JÁ decodificada (Image fake / outro bitmap): passa direto.
    if (source && source.rgba && source.width > 0) {
      return Promise.resolve({
        width: source.width,
        height: source.height,
        rgba: source.rgba,
        close: function () {},
      });
    }
    const bytes = extractBytes(source);
    if (!bytes) {
      print('[image] createImageBitmap: fonte não suportada (tipo=' +
        (source && source.constructor ? source.constructor.name : typeof source) + ')');
      return Promise.reject(new Error('createImageBitmap: fonte não suportada'));
    }
    const decoded = __cortexDecodeImage(bytes);
    if (!decoded) {
      print('[image] createImageBitmap: decode falhou (' + bytes.byteLength +
        ' bytes, magic=' + new Uint8Array(bytes, 0, 4).join(',') + ')');
      return Promise.reject(new Error('createImageBitmap: decode falhou'));
    }
    // imageOrientation 'flipY': invertemos aqui (uma vez, no decode) pra não
    // pagar flip por upload no copyExternalImageToTexture.
    if (options && options.imageOrientation === 'flipY') {
      const rowBytes = decoded.width * 4;
      const src = new Uint8Array(decoded.rgba);
      const dst = new Uint8Array(src.length);
      for (let y = 0; y < decoded.height; y++) {
        dst.set(
          src.subarray(rowBytes * y, rowBytes * (y + 1)),
          rowBytes * (decoded.height - 1 - y),
        );
      }
      decoded.rgba = dst.buffer;
    }
    return Promise.resolve({
      width: decoded.width,
      height: decoded.height,
      rgba: decoded.rgba,
      close: function () {},
    });
  };
  globalThis.ImageBitmap = function ImageBitmap() {};

  // ── Image/HTMLImageElement fake ───────────────────────────────────────────
  // O THREE.TextureLoader usa ImageLoader → createElementNS('img') + .src +
  // evento 'load' (skybox/environment, cáusticas da água, backgrounds...).
  // Este fake busca via fetch, decodifica no stb e HERDA de ImageBitmap —
  // o upload do three cai no copyExternalImageToTexture nativo (width/
  // height/rgba), sem canvas.
  function FakeImage() {
    this.width = 0;
    this.height = 0;
    this.rgba = null;
    this.complete = false;
    this.__listeners = {};
    this.__src = '';
  }
  FakeImage.prototype = Object.create(globalThis.ImageBitmap.prototype);
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
      fetch(url)
        .then(function (response) {
          if (!response.ok) throw new Error('Image: 404 ' + url);
          return response.arrayBuffer();
        })
        .then(function (bytes) {
          const decoded = __cortexDecodeImage(bytes);
          if (!decoded) throw new Error('Image: decode falhou ' + url);
          self.width = decoded.width;
          self.height = decoded.height;
          self.rgba = decoded.rgba;
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
