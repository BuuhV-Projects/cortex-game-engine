// Codec PNG mínimo (8-bit RGBA, não-interlaçado) usando só `zlib` do Node — pra
// empacotar spritesheets sem dependência externa. decode() entende os 5 filtros;
// encode() escreve com filtro 0 (none). Suficiente pra packs de sprite (Kenney/
// Smallburg etc., que vêm RGBA8). NÃO cobre palette/grayscale/interlace.
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ── CRC32 (tabela padrão PNG) ─────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Decodifica um PNG RGBA8 → `{ width, height, data: Buffer(w*h*4) }`. */
export function decodePNG(buffer) {
  if (!buffer.subarray(0, 8).equals(SIG)) throw new Error('não é PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (off < buffer.length) {
    const len = buffer.readUInt32BE(off);
    const type = buffer.toString('ascii', off + 4, off + 8);
    const data = buffer.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bit = data[8];
      const color = data[9];
      const interlace = data[12];
      if (bit !== 8 || color !== 6 || interlace !== 0) {
        throw new Error(`PNG não suportado (bit=${bit} color=${color} interlace=${interlace}); precisa RGBA8 sem interlace`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len; // len + type(4) + data + crc(4)
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride); // linha anterior (zeros na primeira)
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = out.subarray(y * stride, y * stride + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0; // pixel à esquerda
      const b = prev[x]; // pixel acima
      const c = x >= bpp ? prev[x - bpp] : 0; // diagonal
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: v = (v + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`filtro PNG desconhecido: ${filter}`);
      }
      cur[x] = v;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

function paeth(a, b, c) {
  const pp = a + b - c;
  const pa = Math.abs(pp - a);
  const pb = Math.abs(pp - b);
  const pc = Math.abs(pp - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Codifica RGBA8 (`Buffer w*h*4`) → PNG (filtro 0). */
export function encodePNG(width, height, data) {
  const bpp = 4;
  const stride = width * bpp;
  const rawLen = height * (stride + 1);
  const raw = Buffer.alloc(rawLen);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro none
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // 10,11,12 = compression/filter/interlace = 0

  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Recorta uma sub-região RGBA (sx,sy,sw,sh) de uma imagem → novo Buffer RGBA. */
export function cropRGBA(src, srcW, sx, sy, sw, sh) {
  const out = Buffer.alloc(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const from = ((sy + y) * srcW + sx) * 4;
    src.copy(out, y * sw * 4, from, from + sw * 4);
  }
  return out;
}

/** Cola uma imagem RGBA (src sw×sh) num destino RGBA (dst dw×dh) na posição (dx,dy). */
export function blitRGBA(dst, dw, src, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const from = y * sw * 4;
    const to = ((dy + y) * dw + dx) * 4;
    src.copy(dst, to, from, from + sw * 4);
  }
}
