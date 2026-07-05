// fetch/Request/Headers/Response/Blob-lite sobre __cortexReadFile (nativo).
// Sem rede: "fetch" aqui é leitura do pacote do jogo (PC: pasta do exe;
// console: XPackage). data: URIs são decodificadas em JS.

function BlobLite(bytes, type) {
  this.__bytes = bytes; // ArrayBuffer
  this.size = bytes.byteLength;
  this.type = type || '';
}
BlobLite.prototype.arrayBuffer = function () {
  return Promise.resolve(this.__bytes);
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

function ResponseLite(url, bytes, ok, status) {
  this.url = url;
  this.ok = ok;
  this.status = status;
  this.statusText = ok ? 'OK' : 'Not Found';
  this.headers = new HeadersLite();
  this.__bytes = bytes;
}
ResponseLite.prototype.arrayBuffer = function () {
  return Promise.resolve(this.__bytes);
};
ResponseLite.prototype.text = function () {
  const decoder = new TextDecoder();
  return Promise.resolve(decoder.decode(new Uint8Array(this.__bytes)));
};
ResponseLite.prototype.json = function () {
  return this.text().then(JSON.parse);
};
ResponseLite.prototype.blob = function () {
  return Promise.resolve(new BlobLite(this.__bytes));
};
ResponseLite.prototype.clone = function () {
  return new ResponseLite(this.url, this.__bytes, this.ok, this.status);
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

export function installNetShims() {
  globalThis.AbortController = AbortControllerLite;
  globalThis.AbortSignal = AbortSignalLite;
  globalThis.Blob = BlobLite;
  globalThis.Headers = HeadersLite;
  globalThis.Request = RequestLite;
  globalThis.Response = ResponseLite;

  globalThis.fetch = function (input) {
    const url = typeof input === 'string' ? input : input.url;
    if (url.indexOf('data:') === 0) {
      return Promise.resolve(new ResponseLite(url, dataUriToBytes(url), true, 200));
    }
    const bytes = __cortexReadFile(url);
    if (bytes === null) {
      print('[fetch] NAO ENCONTRADO: ' + url);
      return Promise.resolve(new ResponseLite(url, new ArrayBuffer(0), false, 404));
    }
    return Promise.resolve(new ResponseLite(url, bytes, true, 200));
  };
}
