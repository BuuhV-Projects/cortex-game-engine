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
    const bytes = extractBytes(source);
    if (!bytes) {
      return Promise.reject(new Error('createImageBitmap: fonte não suportada'));
    }
    const decoded = __cortexDecodeImage(bytes);
    if (!decoded) {
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
}
