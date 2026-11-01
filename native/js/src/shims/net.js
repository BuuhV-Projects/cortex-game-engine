// fetch/Request/Headers/Response/Blob-lite sobre __cortexReadFile (nativo).
// Sem rede: "fetch" aqui é leitura do pacote do jogo (PC: pasta do exe;
// console: XPackage). data: URIs são decodificadas em JS.

// Assinatura da spec: new Blob(parts[], { type }) — o three cria blobs de
// texturas embutidas assim (new Blob([bufferView], { type: mimeType })).
// Uso interno (Response.blob) passa ArrayBuffer direto — aceita os dois.
function BlobLite(parts, options) {
  let bytes;
  if (parts instanceof ArrayBuffer) {
    bytes = parts;
  } else {
    const arrays = (parts || []).map(function (part) {
      if (part instanceof ArrayBuffer) return new Uint8Array(part);
      if (part && part.buffer instanceof ArrayBuffer) {
        return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
      }
      const text = String(part);
      return new TextEncoder().encode(text);
    });
    let total = 0;
    for (const a of arrays) total += a.length;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
      merged.set(a, offset);
      offset += a.length;
    }
    bytes = merged.buffer;
  }
  this.__bytes = bytes;
  this.size = bytes.byteLength;
  this.type = (options && options.type) || (typeof options === 'string' ? options : '');
}
BlobLite.prototype.arrayBuffer = function () {
  return Promise.resolve(this.__bytes);
};
BlobLite.prototype.text = function () {
  return Promise.resolve(new TextDecoder().decode(new Uint8Array(this.__bytes)));
};
// Um chunk só com os bytes inteiros (SPEC-0651).
BlobLite.prototype.stream = function () {
  const bytes = new Uint8Array(this.__bytes);
  return new globalThis.ReadableStream({
    start: function (controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
};

function HeadersLite(init) {
  this.__map = {};
  if (init) for (const k in init) this.__map[k.toLowerCase()] = String(init[k]);
}
HeadersLite.prototype.get = function (name) {
  const v = this.__map[String(name).toLowerCase()];
  return v === undefined ? null : v;
};
HeadersLite.prototype.set = function (name, value) {
  this.__map[String(name).toLowerCase()] = String(value);
};
HeadersLite.prototype.has = function (name) {
  return this.get(name) !== null;
};

function RequestLite(input, init) {
  this.url = typeof input === 'string' ? input : input.url;
  this.headers = (init && init.headers instanceof HeadersLite)
    ? init.headers
    : new HeadersLite(init && init.headers);
  this.method = (init && init.method) || 'GET';
  this.credentials = (init && init.credentials) || 'same-origin';
  this.signal = init && init.signal;
}

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_SUCCESS_END = 300;

function isStream(body) {
  return !!body && typeof body.getReader === 'function';
}

function bodyBytes(body) {
  if (body === null || body === undefined) return new ArrayBuffer(0);
  if (body instanceof ArrayBuffer) return body;
  if (body instanceof BlobLite) return body.__bytes;
  return new BlobLite([body]).__bytes;
}

function readStreamBytes(stream) {
  const reader = stream.getReader();
  const parts = [];
  function step() {
    return reader.read().then(function (result) {
      if (result.done) return new BlobLite(parts).__bytes;
      parts.push(result.value);
      return step();
    });
  }
  return step();
}

// Assinatura do navegador: new Response(body?, init?) — body pode ser
// ReadableStream (SPEC-0651). ⚠️ `body` só existe quando o corpo é stream: o
// FileLoader do three troca pro caminho de streaming se `response.body.getReader`
// existir, e o fetch do host entrega bytes prontos.
function ResponseLite(body, init) {
  const options = init || {};
  this.status = options.status === undefined ? HTTP_OK : options.status;
  this.ok = this.status >= HTTP_OK && this.status < HTTP_SUCCESS_END;
  this.statusText = options.statusText === undefined ? '' : String(options.statusText);
  this.headers = options.headers instanceof HeadersLite
    ? options.headers
    : new HeadersLite(options.headers);
  this.url = '';
  if (isStream(body)) {
    this.body = body;
    this.__bytes = null;
  } else {
    this.__bytes = bodyBytes(body);
  }
}
ResponseLite.prototype.arrayBuffer = function () {
  if (this.__bytes !== null) return Promise.resolve(this.__bytes);
  const response = this;
  return readStreamBytes(this.body).then(function (bytes) {
    response.__bytes = bytes;
    return bytes;
  });
};
ResponseLite.prototype.text = function () {
  return this.arrayBuffer().then(function (bytes) {
    return new TextDecoder().decode(new Uint8Array(bytes));
  });
};
ResponseLite.prototype.json = function () {
  return this.text().then(JSON.parse);
};
ResponseLite.prototype.blob = function () {
  return this.arrayBuffer().then(function (bytes) { return new BlobLite(bytes); });
};
ResponseLite.prototype.clone = function () {
  if (this.__bytes === null) throw new TypeError('Response.clone: stream body is not supported');
  const copy = new ResponseLite(this.__bytes, this);
  copy.url = this.url;
  return copy;
};

// Resposta do fetch do host (arquivo do pacote, data:, blob:).
function makeResponse(url, bytes, ok, status) {
  const response = new ResponseLite(bytes, { status: status, statusText: ok ? 'OK' : 'Not Found' });
  response.url = url;
  return response;
}

// URL-lite + object URLs (blob:) — o GLTFLoader cria object URLs pra
// texturas EMBUTIDAS (bufferView → Blob → createObjectURL → fetch).
const objectUrls = new Map();
let nextObjectUrl = 1;

function URLLite(url, base) {
  const path = String(url);
  this.href = base && path.indexOf(':') < 0
    ? String(base).replace(/\/[^/]*$/, '/') + path
    : path;
  this.pathname = this.href.replace(/^[a-z]+:/i, '').split('?')[0];
  this.search = this.href.indexOf('?') >= 0
    ? this.href.slice(this.href.indexOf('?'))
    : '';
}
URLLite.prototype.toString = function () { return this.href; };
URLLite.createObjectURL = function (blob) {
  const key = 'blob:cortex/' + nextObjectUrl++;
  objectUrls.set(key, blob);
  return key;
};
URLLite.revokeObjectURL = function (key) {
  objectUrls.delete(key);
};

function dataUriToBytes(url) {
  const comma = url.indexOf(',');
  const meta = url.substring(5, comma);
  const payload = url.substring(comma + 1);
  const binary = meta.indexOf('base64') >= 0
    ? atob(payload)
    : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function AbortSignalLite() {
  this.aborted = false;
}
AbortSignalLite.prototype.addEventListener = function () {};
AbortSignalLite.prototype.removeEventListener = function () {};

function AbortControllerLite() {
  this.signal = new AbortSignalLite();
}
AbortControllerLite.prototype.abort = function () {
  this.signal.aborted = true;
};
// AbortSignal.any([...]) — o three usa pra combinar signals no ImageBitmapLoader.
AbortSignalLite.any = function (signals) {
  const combined = new AbortSignalLite();
  for (const s of signals || []) if (s && s.aborted) combined.aborted = true;
  return combined;
};
AbortSignalLite.timeout = function () { return new AbortSignalLite(); };

export function installNetShims() {
  globalThis.AbortController = AbortControllerLite;
  globalThis.AbortSignal = AbortSignalLite;
  globalThis.URL = URLLite;
  // Despejo dos object URLs (ADR-0153): o GLTFLoader cria `blob:` pra texturas
  // embutidas e nem sempre revoga — os bytes ficavam retidos no Map. O engine
  // chama isto junto do despejo de caches de asset (clearSceneAssetCaches),
  // quando nenhum blob: antigo é mais alcançável.
  globalThis.__cortexClearObjectUrls = function () { objectUrls.clear(); };
  globalThis.Blob = BlobLite;
  globalThis.Headers = HeadersLite;
  globalThis.Request = RequestLite;
  globalThis.Response = ResponseLite;

  globalThis.fetch = function (input) {
    const url = typeof input === 'string' ? input : input.url;
    if (url.indexOf('data:') === 0) {
      return Promise.resolve(makeResponse(url, dataUriToBytes(url), true, HTTP_OK));
    }
    if (url.indexOf('blob:') === 0) {
      const blob = objectUrls.get(url);
      if (!blob) {
        return Promise.resolve(makeResponse(url, new ArrayBuffer(0), false, HTTP_NOT_FOUND));
      }
      return Promise.resolve(makeResponse(url, blob.__bytes, true, HTTP_OK));
    }
    const bytes = __cortexReadFile(url);
    if (bytes === null) {
      print('[fetch] NAO ENCONTRADO: ' + url);
      return Promise.resolve(makeResponse(url, new ArrayBuffer(0), false, HTTP_NOT_FOUND));
    }
    return Promise.resolve(makeResponse(url, bytes, true, HTTP_OK));
  };
}
