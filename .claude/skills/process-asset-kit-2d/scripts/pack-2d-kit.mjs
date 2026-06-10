// Empacota um pack de personagens 2D num kit do engine (sprite node + kit.json).
// Cada personagem é uma subpasta com strips de animação (<char>_idle.png, _run,
// _walk, …). Dois formatos de strip:
//
//  • TIRA simples (1 linha): a largura é múltipla da largura do frame; os frames
//    ficam em fila. (frameSize omitido → infere pelo MDC das larguras.)
//  • GRADE top-down (N linhas = direções, ex.: Smallburg): passe `frameSize` (px,
//    frame quadrado) e a linha a usar em `row` (default 0 = frente). Extrai só
//    aquela direção de cada strip — vira um personagem de FRENTE animado.
//
// Saída: <kitDir>/assets/<char>.png (1 folha por personagem) + thumbnails/ + kit.json.
// Uso: node pack-2d-kit.mjs <srcDir> <kitDir> <kitName> [theme] [frameSize] [row]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decodePNG, encodePNG, cropRGBA, blitRGBA } from './png.mjs';

const [srcDir, kitDir, kitName, theme = 'TBD', frameSizeArg = '0', rowArg = '0'] = process.argv.slice(2);
if (!srcDir || !kitDir || !kitName) {
  console.error('uso: node pack-2d-kit.mjs <srcDir> <kitDir> <kitName> [theme] [frameSize] [row]');
  process.exit(1);
}
const frameSize = Number(frameSizeArg) | 0; // 0 = tira simples (infere); >0 = grade quadrada
const pickRow = Number(rowArg) | 0;

const ANIM_ORDER = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'attack', 'hit', 'death'];
const FPS = { idle: 6, walk: 8, run: 12, jump: 10, fall: 10, land: 10, attack: 12, hit: 10, death: 8 };
const animFps = (name) => FPS[name] ?? 10;
const animRank = (name) => {
  const i = ANIM_ORDER.indexOf(name);
  return i < 0 ? ANIM_ORDER.length + name.charCodeAt(0) / 256 : i;
};
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

mkdirSync(join(kitDir, 'assets'), { recursive: true });
mkdirSync(join(kitDir, 'thumbnails'), { recursive: true });

const chars = readdirSync(srcDir).filter((d) => statSync(join(srcDir, d)).isDirectory() && !d.startsWith('.') && d !== '__MACOSX');
const assets = {};

for (const char of chars.sort()) {
  const dir = join(srcDir, char);
  const pngs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png') && !f.startsWith('.'));
  if (pngs.length === 0) continue;

  // Cada arquivo = uma animação (nome = último token de <...>_<anim>.png).
  const strips = pngs
    .map((file) => {
      const img = decodePNG(readFileSync(join(dir, file)));
      const stem = basename(file, '.png');
      return { anim: stem.slice(stem.lastIndexOf('_') + 1).toLowerCase(), img };
    })
    .sort((a, b) => animRank(a.anim) - animRank(b.anim));

  // Frame: grade quadrada (frameSize) extraindo `pickRow`, ou tira simples (MDC).
  let frameW;
  let frameH;
  const rows = []; // { anim, frames: [{sx,sy}], count }
  if (frameSize > 0) {
    frameW = frameH = frameSize;
    let bad = false;
    for (const { anim, img } of strips) {
      if (img.height % frameSize || img.width % frameSize) { bad = true; break; }
      const nRows = img.height / frameSize;
      const nCols = img.width / frameSize;
      if (pickRow >= nRows) { bad = true; break; }
      rows.push({ anim, img, count: nCols, sy: pickRow * frameSize });
    }
    if (bad) { console.error(`! ${char}: não casa com frame ${frameSize}px — pulando`); continue; }
  } else {
    frameH = strips[0].img.height;
    if (strips.some((s) => s.img.height !== frameH)) { console.error(`! ${char}: alturas diferentes — pulando`); continue; }
    frameW = strips.map((s) => s.img.width).reduce((a, b) => gcd(a, b));
    for (const { anim, img } of strips) rows.push({ anim, img, count: img.width / frameW, sy: 0 });
  }

  // Folha única: frames de todas as anims em fila horizontal.
  const total = rows.reduce((n, r) => n + r.count, 0);
  const sheetW = total * frameW;
  const sheet = Buffer.alloc(sheetW * frameH * 4);
  const animations = {};
  let frame = 0;
  for (const r of rows) {
    for (let c = 0; c < r.count; c++) {
      const cell = cropRGBA(r.img.data, r.img.width, c * frameW, r.sy, frameW, frameH);
      blitRGBA(sheet, sheetW, cell, frameW, frameH, (frame + c) * frameW, 0);
    }
    animations[r.anim] = { frames: Array.from({ length: r.count }, (_, i) => frame + i), fps: animFps(r.anim) };
    frame += r.count;
  }

  const name = `character_${char.replace(/[^\w-]/g, '_')}.png`;
  writeFileSync(join(kitDir, 'assets', name), encodePNG(sheetW, frameH, sheet));
  writeFileSync(join(kitDir, 'thumbnails', name), encodePNG(frameW, frameH, cropRGBA(sheet, sheetW, 0, 0, frameW, frameH)));

  assets[`assets/${name}`] = {
    role: 'character',
    tags: [theme, '2d', 'character'],
    sprite: {
      frameWidth: frameW,
      frameHeight: frameH,
      animations,
      initial: animations['idle'] ? 'idle' : Object.keys(animations)[0],
    },
    thumb: `thumbnails/${name}`,
  };
  console.log(`✓ ${char}: ${frameW}×${frameH} · ${total} frames · ${Object.keys(animations).join('/')}`);
}

writeFileSync(join(kitDir, 'kit.json'), JSON.stringify({ version: 1, name: kitName, theme, assets }, null, 2));
console.log(`\nkit.json: ${Object.keys(assets).length} personagem(ns) → ${kitDir}`);
