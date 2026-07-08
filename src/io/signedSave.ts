/**
 * **Save assinado + ofuscado** (anti-adulteração) — ADR-0107.
 *
 * Embrulha um payload de texto (ex.: o JSON do save do jogo) num container
 * opaco `CXS1.<dados>.<assinatura>` que:
 * - **não parece JSON** (o payload é XOR-ofuscado com um keystream derivado da
 *   chave e depois base64) → editar no bloco de notas não leva a lugar nenhum;
 * - **detecta adulteração** via HMAC-SHA256 do texto claro → qualquer byte
 *   mexido (dados OU assinatura) faz {@link decodeSignedSave} devolver `null`.
 *
 * **Limite honesto (vale pra QUALQUER engine):** a `secret` fica embutida no
 * jogo, então quem tem MUITO empenho a extrai e forja um save. O objetivo é
 * **subir a barra** (edição casual falha) e **detectar** a fraude — não é
 * segurança de verdade (só save no SERVIDOR seria). Bom o suficiente pra
 * single-player. Cada jogo passa sua própria `secret` (crackear um não ajuda no
 * outro).
 *
 * JS puro (usa {@link hmacSha256}) — roda igual no browser/Studio e no host
 * nativo (Hermes, sem WebCrypto).
 *
 * @example
 * const token = encodeSignedSave(JSON.stringify(save), 'meu-jogo/v1/chave');
 * localStorage.setItem('save', token);
 * // …outra sessão…
 * const json = decodeSignedSave(localStorage.getItem('save') ?? '', 'meu-jogo/v1/chave');
 * const save = json ? JSON.parse(json) : novoSave(); // null = ausente/adulterado
 */
import { hmacSha256, sha256, bytesEqual } from './hmacSha256.js';

const MAGIC = 'CXS1';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1]! : 0;
    const b2 = has2 ? bytes[i + 2]! : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += has1 ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += has2 ? B64[b2 & 63] : '=';
  }
  return out;
}

function fromBase64(str: string): Uint8Array {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, ''); // descarta '=' e ruído
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]!);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

// Keystream determinístico a partir da chave: blocos k_i = SHA256(secret‖"cxs-obf"‖i).
// XOR do payload com ele apenas OFUSCA (não é a camada de segurança — o HMAC é).
function keystream(secret: Uint8Array, length: number): Uint8Array {
  const tag = enc.encode('cxs-obf');
  const out = new Uint8Array(length);
  const idx = new Uint8Array(4);
  const idv = new DataView(idx.buffer);
  for (let off = 0, block = 0; off < length; block++) {
    idv.setUint32(0, block, false);
    const kb = sha256(concat(concat(secret, tag), idx));
    const n = Math.min(32, length - off);
    out.set(kb.subarray(0, n), off);
    off += n;
  }
  return out;
}

function xor(data: Uint8Array, mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i]! ^ mask[i]!;
  return out;
}

/**
 * Codifica `payload` num token assinado + ofuscado (`CXS1.<b64>.<b64>`).
 * Passe a `secret` do jogo (embutida). Ver notas de segurança no topo do módulo.
 */
export function encodeSignedSave(payload: string, secret: string): string {
  const s = enc.encode(secret);
  const p = enc.encode(payload);
  const mac = hmacSha256(s, p); // assina o TEXTO CLARO
  const obf = xor(p, keystream(s, p.length));
  return `${MAGIC}.${toBase64(obf)}.${toBase64(mac)}`;
}

/**
 * Decodifica um token de {@link encodeSignedSave} com a MESMA `secret`.
 * Devolve o payload original, ou `null` se o token estiver **ausente**, num
 * **formato desconhecido** (ex.: save legado em JSON puro) ou **adulterado**
 * (assinatura não confere). O chamador trata `null` como "sem save".
 */
export function decodeSignedSave(token: string, secret: string): string | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== MAGIC) return null;
  try {
    const s = enc.encode(secret);
    const obf = fromBase64(parts[1]!);
    const mac = fromBase64(parts[2]!);
    const p = xor(obf, keystream(s, obf.length));
    if (!bytesEqual(mac, hmacSha256(s, p))) return null; // adulterado
    return dec.decode(p);
  } catch {
    return null;
  }
}
