// Reescreve GLBs pra referenciar textura EXTERNA compartilhada em vez de embutida:
// extrai a imagem embutida uma vez pra <assetsDir>/<nome>.png, troca images[i]
// por { uri }, remove o bufferView da imagem e reconstrói o chunk BIN (offsets
// realinhados a 4 bytes). Economiza o atlas repetido em cada peça do kit.
// Uso: node externalize-texture.mjs <assetsDir>
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('uso: node externalize-texture.mjs <assetsDir>'); process.exit(1); }

const MAGIC = 0x46546c67;
const pad4 = (n) => (n + 3) & ~3;

let savedTotal = 0;
let count = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const path = join(dir, file);
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== MAGIC) { console.warn(`${file}: nao e GLB, pulando`); continue; }

  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const bin = buf.subarray(binStart, binStart + binLen);

  const embedded = (json.images ?? [])
    .map((img, i) => ({ img, i }))
    .filter(({ img }) => img.bufferView !== undefined);
  if (embedded.length === 0) continue;

  const dropBVs = new Set();
  for (const { img } of embedded) {
    const bv = json.bufferViews[img.bufferView];
    const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const texName = `${(img.name ?? 'texture').replace(/[^\w.-]/g, '_')}.${ext}`;
    const texPath = join(dir, texName);
    if (!existsSync(texPath)) {
      writeFileSync(texPath, bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
      console.log(`extraida: ${texName} (${(bv.byteLength / 1024).toFixed(0)}KB)`);
    }
    dropBVs.add(img.bufferView);
    delete img.bufferView;
    delete img.mimeType;
    img.uri = texName;
  }

  // Reconstroi o BIN sem os bufferViews das imagens; remapeia indices.
  const keep = json.bufferViews.map((_, i) => i).filter((i) => !dropBVs.has(i));
  const remap = new Map(keep.map((old, neu) => [old, neu]));
  const chunks = [];
  let offset = 0;
  const newBVs = [];
  for (const old of keep) {
    const bv = json.bufferViews[old];
    const bytes = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    offset = pad4(offset);
    newBVs.push({ ...bv, byteOffset: offset });
    chunks.push({ at: offset, bytes });
    offset += bv.byteLength;
  }
  const newBin = Buffer.alloc(pad4(offset));
  for (const c of chunks) c.bytes.copy(newBin, c.at);
  json.bufferViews = newBVs;
  json.buffers = [{ byteLength: newBin.length }];

  const fixRef = (o) => {
    if (o && o.bufferView !== undefined) {
      const neu = remap.get(o.bufferView);
      if (neu === undefined) throw new Error(`${file}: referencia a bufferView removido`);
      o.bufferView = neu;
    }
  };
  for (const acc of json.accessors ?? []) {
    fixRef(acc);
    if (acc.sparse) { fixRef(acc.sparse.indices); fixRef(acc.sparse.values); }
  }
  for (const img of json.images ?? []) fixRef(img);

  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = Buffer.alloc(pad4(jsonBuf.length), 0x20);
  jsonBuf.copy(jsonPad);
  const total = 12 + 8 + jsonPad.length + 8 + newBin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonPad.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonPad.copy(out, 20);
  out.writeUInt32LE(newBin.length, 20 + jsonPad.length);
  out.writeUInt32LE(0x004e4942, 24 + jsonPad.length); // 'BIN\0'
  newBin.copy(out, 28 + jsonPad.length);

  savedTotal += buf.length - out.length;
  count++;
  writeFileSync(path, out);
}
console.log(`reescritos: ${count} GLBs | economia total: ${(savedTotal / 1048576).toFixed(1)}MB`);
