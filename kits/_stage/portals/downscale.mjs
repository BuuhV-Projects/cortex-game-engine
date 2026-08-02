// Reduz as texturas do kit (o pack entrega TUDO em 2048²) e recomprime.
// Um portal ocupa uma fração da tela numa warp room; 2K por peça estoura a VRAM
// do host nativo sem ganho visível. Uso: node downscale.mjs <assetsDir> [max]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2];
const MAX = Number(process.argv[3] ?? 1024);
if (!dir) { console.error('uso: node downscale.mjs <assetsDir> [max]'); process.exit(1); }

let before = 0;
let after = 0;
const files = readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f));

for (const file of files) {
  const path = join(dir, file);
  const src = readFileSync(path);
  before += src.length;
  const meta = await sharp(src).metadata();
  if (Math.max(meta.width, meta.height) <= MAX) {
    after += src.length;
    console.log(`${file}: ${meta.width}x${meta.height} (mantida)`);
    continue;
  }
  const out = await sharp(src)
    .resize(MAX, MAX, { fit: 'inside', kernel: 'lanczos3' })
    // Alpha é essencial aqui: quase toda textura do pack é recorte/energia.
    .png({ compressionLevel: 9, effort: 10 })
    .toBuffer();
  writeFileSync(path, out);
  after += out.length;
  console.log(`${file}: ${meta.width}x${meta.height} -> ${MAX} | ${(src.length / 1024) | 0}KB -> ${(out.length / 1024) | 0}KB`);
}

console.log(`\n${files.length} texturas | ${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB`);
