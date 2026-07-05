// Texto/binário: TextDecoder/TextEncoder (UTF-8) e atob/btoa (base64).
// O GLTFLoader usa TextDecoder pro chunk JSON do .glb e atob pra data URIs.

function utf8Decode(bytes) {
  let out = '';
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const b0 = bytes[i++];
    let code;
    if (b0 < 0x80) code = b0;
    else if (b0 < 0xe0) code = ((b0 & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b0 < 0xf0) {
      code = ((b0 & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    } else {
      code = ((b0 & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    }
    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function installTextShims() {
  globalThis.TextDecoder = function TextDecoder() {};
  globalThis.TextDecoder.prototype.decode = function (input) {
    if (!input) return '';
    const bytes = input instanceof Uint8Array
      ? input
      : new Uint8Array(input.buffer || input);
    return utf8Decode(bytes);
  };

  globalThis.TextEncoder = function TextEncoder() {};
  globalThis.TextEncoder.prototype.encode = function (text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
        code = 0x10000 + ((code - 0xd800) << 10) +
          (text.charCodeAt(++i) - 0xdc00);
      }
      if (code < 0x80) out.push(code);
      else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      else if (code < 0x10000) {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63),
          0x80 | (code & 63));
      } else {
        out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63),
          0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      }
    }
    return new Uint8Array(out);
  };

  globalThis.atob = function (base64) {
    let out = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < base64.length; i++) {
      const c = base64[i];
      if (c === '=' || c === '\n' || c === '\r') continue;
      const value = BASE64.indexOf(c);
      if (value < 0) continue;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }
    return out;
  };

  globalThis.btoa = function (binary) {
    let out = '';
    for (let i = 0; i < binary.length; i += 3) {
      const b0 = binary.charCodeAt(i);
      const b1 = i + 1 < binary.length ? binary.charCodeAt(i + 1) : NaN;
      const b2 = i + 2 < binary.length ? binary.charCodeAt(i + 2) : NaN;
      out += BASE64[b0 >> 2];
      out += BASE64[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
      out += isNaN(b1) ? '=' : BASE64[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
      out += isNaN(b2) ? '=' : BASE64[b2 & 63];
    }
    return out;
  };
}
