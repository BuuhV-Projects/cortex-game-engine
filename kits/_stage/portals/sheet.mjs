// Contact sheet rotulado do kit: agrupa por FAMÍLIA e imprime o tamanho medido
// embaixo de cada peça. É o que resolve naming opaco e escala de uma vez — a
// thumbnail isolada não diz se `pool_blue` é poça de chão ou disco em pé.
// Uso: node sheet.mjs <kitDir> <sizes.json> <saida.png>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import sharp from 'sharp';

const [kitDir, sizesPath, outPath] = process.argv.slice(2);
if (!kitDir || !sizesPath || !outPath) {
  console.error('uso: node sheet.mjs <kitDir> <sizes.json> <saida.png>');
  process.exit(1);
}

const sizes = JSON.parse(readFileSync(sizesPath, 'utf8')).sizes;
const thumbsDir = join(kitDir, 'thumbnails');

// Famílias na ordem em que importam pra decisão (molduras primeiro).
const FAMILIES = [
  ['MOLDURAS — porta / arco', (n) => /^(doorway|archway)/.test(n)],
  ['MOLDURAS — futurista', (n) => /^futuristic_(black|white)$/.test(n)],
  ['MOLDURAS — pilares', (n) => /^pillar_/.test(n)],
  ['BASE — plataforma de pedra', (n) => /^stoneplatform/.test(n)],
  ['VÃO — discos e portais planos', (n) => /^(circle_|futuristic_circle)/.test(n)],
  ['VÃO — poças', (n) => /^pool_/.test(n)],
  ['EFEITO — brilhos', (n) => /^glare/.test(n)],
  ['EFEITO — runas', (n) => /^rune_/.test(n)],
  ['AMBIENTE', (n) => /^(mist|grass|bellflower)/.test(n)],
];

const all = readdirSync(thumbsDir).filter((f) => f.endsWith('.png')).map((f) => basename(f, '.png'));
const used = new Set();
const groups = [];
for (const [title, match] of FAMILIES) {
  const items = all.filter((n) => match(n) && !used.has(n)).sort();
  items.forEach((n) => used.add(n));
  if (items.length) groups.push({ title, items });
}
const rest = all.filter((n) => !used.has(n)).sort();
if (rest.length) groups.push({ title: 'OUTROS', items: rest });

const CELL = 200;
const LABEL_H = 40;
const HEADER_H = 34;
const COLS = 6;
const PAD = 14;
const BG = '#20222c';

// Altura total: cada grupo = cabeçalho + linhas de células.
let y = PAD;
const layout = [];
for (const g of groups) {
  const rows = Math.ceil(g.items.length / COLS);
  layout.push({ ...g, y, rows });
  y += HEADER_H + rows * (CELL + LABEL_H) + PAD;
}
const W = PAD * 2 + COLS * CELL;
const H = y;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svgParts = [`<rect width="${W}" height="${H}" fill="${BG}"/>`];
const composites = [];

for (const g of layout) {
  svgParts.push(
    `<text x="${PAD}" y="${g.y + 22}" font-family="DejaVu Sans, Arial" font-size="19" font-weight="bold" fill="#ffd24e">${esc(g.title)}</text>`,
    `<rect x="${PAD}" y="${g.y + 28}" width="${W - PAD * 2}" height="2" fill="#3d4152"/>`,
  );
  g.items.forEach((name, i) => {
    const cx = PAD + (i % COLS) * CELL;
    const cy = g.y + HEADER_H + Math.floor(i / COLS) * (CELL + LABEL_H);
    composites.push({ input: join(thumbsDir, `${name}.png`), left: cx, top: cy });
    const s = sizes[name];
    const dims = s ? `${s[0]} x ${s[1]} x ${s[2]}` : '(sem medida)';
    svgParts.push(
      `<text x="${cx + CELL / 2}" y="${cy + CELL + 16}" text-anchor="middle" font-family="DejaVu Sans, Arial" font-size="13" fill="#ffffff">${esc(name)}</text>`,
      `<text x="${cx + CELL / 2}" y="${cy + CELL + 32}" text-anchor="middle" font-family="DejaVu Sans, Arial" font-size="11" fill="#8f96ad">${dims}</text>`,
    );
  });
}

const base = sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`));
// As thumbs são 256²; a célula é 200 — redimensiona antes de compor.
const resized = await Promise.all(
  composites.map(async (c) => ({ ...c, input: await sharp(c.input).resize(CELL, CELL, { fit: 'inside' }).toBuffer() })),
);
writeFileSync(outPath, await base.composite(resized).png().toBuffer());
console.log(`sheet: ${outPath} (${W}x${H}, ${composites.length} assets, ${layout.length} grupos)`);
