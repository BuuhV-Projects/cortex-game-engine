// Cataloga BACKDROPS 2D (jpg/png) num kit.json (role 'background', ADR-0053).
// Diferente dos glb: sem bbox/conversão — a própria imagem é o thumbnail.
// Tags derivadas do nome `background_<tema>_<n>` (ou o basename).
//
// Uso:  node gen-backgrounds.mjs <imagesDir> [kitName]
//   - escreve <imagesDir>/kit.json catalogando os .jpg/.png da pasta.
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const dir = process.argv[2];
const kitName = process.argv[3] ?? basename(dir);
if (!dir) {
  console.error('uso: node gen-backgrounds.mjs <kitDir> [kitName]');
  process.exit(1);
}

// Layout padrão do kit: imagens em <kitDir>/assets/ → chaves `assets/<file>`.
// Fallback: imagens soltas em <kitDir> (chaves só o nome).
const hasAssets = existsSync(`${dir}/assets`);
const scanDir = hasAssets ? `${dir}/assets` : dir;
const prefix = hasAssets ? 'assets/' : '';
const imgs = readdirSync(scanDir)
  .filter((f) => /\.(jpe?g|png)$/i.test(f))
  .sort();

const assets = {};
for (const f of imgs) {
  const stem = f.replace(/\.[^.]+$/, '');
  // `background_<tema>_<n>` → tema; senão, palavras do nome.
  const m = stem.match(/^background[_-]([a-z]+)/i);
  const theme = m ? m[1].toLowerCase() : stem.replace(/[_-]?\d+$/, '').toLowerCase();
  assets[`${prefix}${f}`] = {
    role: 'background',
    tags: [theme, '2d', 'backdrop'],
    thumb: `${prefix}${f}`, // a própria imagem é a prévia (já é 2D)
  };
}

const kit = { version: 1, name: kitName, theme: 'multi', assets };
writeFileSync(`${dir}/kit.json`, JSON.stringify(kit, null, 2));

const themes = [...new Set(Object.values(assets).flatMap((a) => a.tags[0]))];
console.log(`${kitName}: ${imgs.length} backdrops, ${themes.length} temas (${themes.join(', ')})`);
