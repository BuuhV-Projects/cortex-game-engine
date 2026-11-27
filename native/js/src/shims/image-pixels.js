// Pixels soltáveis de imagem PNG/JPG (SPEC-0748 / ADR-0749).
//
// O RGBA cru de uma imagem decodificada só precisa existir até o upload: o
// copyExternalImageToTexture nativo copia na hora (wgpuQueueWriteTexture).
// Este módulo dá ao bitmap e ao Image fake um `rgba` que se solta depois do
// upload e se refaz dos bytes comprimidos (PNG/JPG) se alguém pedir de novo.

const BYTES_PER_PIXEL = 4;
const BYTES_PER_MB = 1024 * 1024;

// Contadores da soltura (SPEC-0748), em globalThis.__cortexImageReleaseStats
// e na linha `[image] img-solto=…` da saída do host: o objeto é mutado no
// lugar, nunca trocado. `released`/`releasedBytes` contam cada
// objeto uma vez só (a 1ª soltura); `pending` é quantos esperam o prazo.
export const imageReleaseStats = { released: 0, releasedBytes: 0, redecodes: 0, pending: 0 };

export function installImageReleaseStats() {
  globalThis.__cortexImageReleaseStats = imageReleaseStats;
}

// Resumo legível dos contadores (`img-solto=N/MB img-redecode=N pendentes=N`).
export function formatImageReleaseStats() {
  const mb = imageReleaseStats.releasedBytes / BYTES_PER_MB;
  return 'img-solto=' + imageReleaseStats.released + '/' + mb.toFixed(1) + 'MB' +
    ' img-redecode=' + imageReleaseStats.redecodes + ' pendentes=' + imageReleaseStats.pending;
}

// Intervalo mínimo entre duas linhas `[image]` na saída do host. A linha só
// sai quando um contador mudou: depois do carregamento ela fica quieta, e um
// `img-redecode` que não para de subir aponta textura reenviada em loop.
export const STATS_PRINT_INTERVAL_MS = 10000;
let lastPrint = -Infinity;
let lastPrinted = '';

function printStatsIfChanged(now) {
  if (now - lastPrint < STATS_PRINT_INTERVAL_MS) return;
  const line = formatImageReleaseStats();
  if (line === lastPrinted) return;
  lastPrint = now;
  lastPrinted = line;
  if (typeof print === 'function') print('[image] ' + line);
}

function flipRows(rgba, width, height) {
  const rowBytes = width * BYTES_PER_PIXEL;
  const src = new Uint8Array(rgba);
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    dst.set(src.subarray(rowBytes * y, rowBytes * (y + 1)), rowBytes * (height - 1 - y));
  }
  return dst.buffer;
}

// Decodifica `bytes` (PNG/JPG) no stb do host e inverte as linhas se `flipY`.
// Devolve { width, height, rgba } ou null.
export function decodePixels(bytes, flipY) {
  const decoded = __cortexDecodeImage(bytes);
  if (!decoded) return null;
  const rgba = flipY ? flipRows(decoded.rgba, decoded.width, decoded.height) : decoded.rgba;
  return { width: decoded.width, height: decoded.height, rgba };
}

// Põe no objeto o estado inicial dos pixels: `pixels` (ArrayBuffer RGBA ou
// null) e os bytes comprimidos que os reproduzem (null = não soltável).
export function initPixels(target, pixels, compressed, flipY) {
  target.__pixels = pixels;
  target.__cortexCompressed = compressed;
  target.__cortexFlipY = !!flipY;
}

// Acessor `rgba` + `__cortexReleasePixels` num protótipo. Os objetos que o
// usam guardam o estado em __pixels / __cortexCompressed / __cortexFlipY.
export function definePixelAccessors(proto) {
  Object.defineProperty(proto, 'rgba', {
    configurable: true,
    get() {
      if (this.__pixels) return this.__pixels;
      if (!this.__cortexCompressed) return null;
      const decoded = decodePixels(this.__cortexCompressed, this.__cortexFlipY);
      if (!decoded) {
        print('[image] redecode falhou (' + this.__cortexCompressed.byteLength + ' bytes)');
        return null;
      }
      imageReleaseStats.redecodes++;
      this.__pixels = decoded.rgba;
      // Volta para a fila de soltura: uma leitura fora do upload (drawImage do
      // canvas 2D) também se solta depois do prazo; um upload logo em seguida
      // só renova o prazo.
      markUploaded(this);
      return this.__pixels;
    },
    // Pixels atribuídos à mão viram a fonte da verdade: não há bytes
    // comprimidos que os reproduzam, então o objeto deixa de ser soltável.
    set(value) {
      this.__pixels = value;
      this.__cortexCompressed = null;
    },
  });
  proto.__cortexReleasePixels = function () {
    if (!this.__cortexCompressed || !this.__pixels) return;
    if (!this.__cortexCounted) {
      this.__cortexCounted = true;
      imageReleaseStats.released++;
      imageReleaseStats.releasedBytes += this.__pixels.byteLength;
    }
    this.__pixels = null;
  };
}

// Prazo sem upload antes de soltar os pixels. O three cria uma textura de GPU
// por objeto Texture, e os clones de uma imagem (GLTFLoader por material,
// estradas, sprites) sobem logo depois da primeira: dentro do prazo eles
// reaproveitam o RGBA em vez de pagar um decode cada (ADR-0749). Cada upload
// renova o prazo.
export const RELEASE_DELAY_MS = 3000;
// De quanto em quanto tempo a fila de pendentes é varrida (no queue.submit).
export const SWEEP_INTERVAL_MS = 500;

const pendingRelease = new Set();
let lastSweep = 0;

function nowMs() {
  return globalThis.performance ? globalThis.performance.now() : Date.now();
}

// Marca o upload de `image` e põe na fila de soltura.
export function markUploaded(image) {
  image.__cortexUploadedAt = nowMs();
  pendingRelease.add(image);
  imageReleaseStats.pending = pendingRelease.size;
}

// Solta os pixels de quem passou do prazo sem upload novo. `force` solta
// todos na hora (teste, troca de fase).
export function sweepPendingReleases(force) {
  const now = nowMs();
  if (!force && now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const image of pendingRelease) {
    if (!force && now - image.__cortexUploadedAt < RELEASE_DELAY_MS) continue;
    image.__cortexReleasePixels();
    pendingRelease.delete(image);
  }
  imageReleaseStats.pending = pendingRelease.size;
  printStatsIfChanged(now);
}

// Embrulha a GPUQueue: o copyExternalImageToTexture marca a fonte para soltar
// (o nativo já copiou os pixels pela fila) e o submit varre os vencidos. Fila
// já embrulhada não muda.
export function wrapQueueRelease(queue) {
  if (!queue || queue.__cortexReleaseWrapped || !queue.copyExternalImageToTexture) return queue;
  const nativeCopy = queue.copyExternalImageToTexture;
  queue.copyExternalImageToTexture = function (source, destination, size) {
    const result = nativeCopy.call(this, source, destination, size);
    const image = source && source.source;
    if (image && typeof image.__cortexReleasePixels === 'function') markUploaded(image);
    return result;
  };
  const nativeSubmit = queue.submit;
  if (typeof nativeSubmit === 'function') {
    queue.submit = function () {
      const result = nativeSubmit.apply(this, arguments);
      sweepPendingReleases(false);
      return result;
    };
  }
  queue.__cortexReleaseWrapped = true;
  return queue;
}
