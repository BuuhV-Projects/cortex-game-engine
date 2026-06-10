// Inspeciona a grade de um spritesheet: imprime as faixas (X e Y) com conteúdo
// (alpha>0), separadas por gutters transparentes — revela colunas/linhas e o
// tamanho do frame. Use pra decidir frameSize/row no pack-2d-kit.mjs.
// Uso: node inspect-grid.mjs <arquivo.png> [...mais arquivos]
import { readFileSync } from 'node:fs';
import { decodePNG } from './png.mjs';

const ranges = (empty) => {
  const r = [];
  let st = -1;
  for (let i = 0; i <= empty.length; i++) {
    if (i < empty.length && !empty[i]) { if (st < 0) st = i; }
    else if (st >= 0) { r.push(`${st}-${i - 1}`); st = -1; }
  }
  return r;
};

for (const file of process.argv.slice(2)) {
  const { width: w, height: h, data } = decodePNG(readFileSync(file));
  const colEmpty = [];
  const rowEmpty = [];
  for (let x = 0; x < w; x++) { let s = 0; for (let y = 0; y < h; y++) s += data[(y * w + x) * 4 + 3]; colEmpty.push(s === 0); }
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += data[(y * w + x) * 4 + 3]; rowEmpty.push(s === 0); }
  const cols = ranges(colEmpty);
  const rows = ranges(rowEmpty);
  console.log(`${file}  ${w}x${h}`);
  console.log(`  colunas com conteúdo (${cols.length}): ${cols.join(' ')}`);
  console.log(`  linhas com conteúdo  (${rows.length}): ${rows.join(' ')}`);
  if (rows.length > 1) console.log(`  → grade: ~${rows.length} linhas; frame ≈ ${Math.round(h / rows.length)}px (passe frameSize)`);
}
