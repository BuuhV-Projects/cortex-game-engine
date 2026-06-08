// Gera kit.json (vocabulário do design system, ADR-0053) a partir dos bbox
// capturados na conversão. Classifica cada asset em 3 eixos ortogonais:
//   role (natureza física) / tags (tema) / gameplayRole (função de design).
//
// Uso:  node gen-kit.mjs <sizes.json> <kitDir1> [kitDir2 ...]
//   - sizes.json: saída do convert.py ({ sizes: { name: [x,y,z] } })
//   - kitDir: pasta do kit (espera kitDir/assets/*.glb); name = basename(kitDir)
//
// As regras de classify() SÃO o vocabulário canônico (ADR-0053 §6): mantenha-as
// kit-independentes. Ajuste/expanda conforme novos tipos de asset aparecem.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';

const argv = process.argv.slice(2);
const sizesPath = argv[0];
const kitDirs = argv.slice(1);
if (!sizesPath || kitDirs.length === 0) {
  console.error('uso: node gen-kit.mjs <sizes.json> <kitDir1> [kitDir2 ...]');
  process.exit(1);
}
const { sizes } = JSON.parse(readFileSync(sizesPath, 'utf8'));

function classify(name) {
  const n = name.toLowerCase();
  const R = (role, tags, gameplayRole = [], extra = {}) => ({ role, tags, gameplayRole, ...extra });
  if (/^(copper|gold|iron|silver)_/.test(n)) return R('collectible', [n.split('_')[0], 'metal', 'treasure'], ['reward', 'resource']);
  if (/^resource_/.test(n)) return R('collectible', ['resource', n.includes('lumber') ? 'wood' : 'stone'], ['resource']);
  if (/^wood_log/.test(n)) return R('prop', ['wood', 'log', 'resource'], ['resource'], { solid: true });
  if (/^wood_plank/.test(n)) return R('prop', ['wood', 'plank', 'resource'], ['resource'], { solid: true });
  if (/^pallet/.test(n)) return R('prop', ['wood', 'pallet'], ['resource'], { solid: true });
  if (/^stone_brick/.test(n)) return R('prop', ['stone', 'brick', 'resource'], ['resource'], { solid: true });
  if (/^stone_chunk/.test(n)) return R('prop', ['stone', 'rubble'], ['resource'], { solid: true });
  if (/^textiles/.test(n)) return R('prop', ['cloth', 'resource'], ['resource']);
  if (/_barrel|^barrel|^fuel_/.test(n)) return R('prop', ['container', 'barrel'], ['resource'], { solid: true, shape: 'capsule' });
  if (/^crate/.test(n)) return R('prop', ['container', 'crate', 'wood'], ['resource', 'reward'], { solid: true });
  if (/^sack/.test(n)) return R('prop', ['container', 'sack'], ['resource']);
  if (/^bucket/.test(n)) return R('prop', ['container', 'bucket'], ['resource']);
  if (/^rock/.test(n)) return R('prop', ['rock', 'stone'], ['cover'], { solid: true });
  if (/^bush/.test(n)) return R('decoration', ['forest', 'foliage', 'bush'], ['cover']);
  if (/^grass/.test(n)) return R('decoration', ['forest', 'foliage', 'grass'], []);
  if (/^waterlily|^waterplant/.test(n)) return R('decoration', ['water', 'foliage'], []);
  if (/bare/.test(n)) return R('decoration', ['forest', 'tree', 'dead'], ['cover']);
  if (/^tree/.test(n)) return R('decoration', ['forest', 'tree'], ['cover', 'landmark']);
  if (/^mountain/.test(n)) return R('ground', ['terrain', 'mountain'], ['landmark'], { solid: true, shape: 'heightfield' });
  if (/^hill/.test(n)) return R('ground', ['terrain', 'hill'], [], { solid: true, shape: 'heightfield' });
  if (/^fence/.test(n)) return R('decoration', ['fence', 'boundary', n.includes('stone') ? 'stone' : 'wood'], ['guidance'], { solid: true, connectX: true });
  if (/^ladder/.test(n)) return R('prop', ['traversal', 'wood'], ['guidance']);
  if (/^tent/.test(n)) return R('prop', ['camp', 'shelter', 'cloth'], ['safe-zone'], { solid: true });
  if (/^cloud/.test(n)) return R('decoration', ['sky'], []);
  if (/^hex_water/.test(n)) return R('ground', ['hex', 'water'], ['hazard']);
  if (/^hex_river/.test(n)) return R('ground', ['hex', 'river', 'water'], ['guidance']);
  if (/^hex_coast/.test(n)) return R('ground', ['hex', 'coast', 'water'], []);
  if (/^hex_road/.test(n)) return R('ground', ['hex', 'road'], ['guidance', 'path']);
  if (/^hex_/.test(n)) return R('ground', ['hex', 'terrain', 'grass'], [], { solid: true });
  return R('prop', [], []);
}

const sizeClass = (s) => { const m = Math.max(...s); return m < 1.5 ? 'S' : m < 4 ? 'M' : 'L'; };

for (const dir of kitDirs) {
  const glbs = readdirSync(`${dir}/assets`).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
  const assets = {};
  let hexGrassW = null;
  for (const name of glbs.sort()) {
    const size = sizes[name];
    if (!size) { console.warn('sem size:', name); continue; }
    const c = classify(name);
    const [w, h] = size;
    if (/^hex_grass$/i.test(name)) hexGrassW = w;
    const a = { role: c.role, tags: [...c.tags, sizeClass(size)], size };
    if (c.gameplayRole.length) a.gameplayRole = c.gameplayRole;
    if (c.solid || c.shape) a.collider = { shape: c.shape ?? 'box', solid: c.solid ?? true };
    const anchors = { top: { at: [0, +h.toFixed(3), 0], kind: 'surface', dir: [0, 1, 0] } };
    if (c.connectX) {
      anchors.edge_left = { at: [+(-w / 2).toFixed(3), 0, 0], kind: 'connect', dir: [-1, 0, 0] };
      anchors.edge_right = { at: [+(w / 2).toFixed(3), 0, 0], kind: 'connect', dir: [1, 0, 0] };
    }
    a.anchors = anchors;
    a.thumb = `thumbnails/${name}.png`;
    assets[`assets/${name}.glb`] = a;
  }
  const kit = { version: 1, name: basename(dir), module: hexGrassW ? +hexGrassW.toFixed(3) : 1, theme: 'TBD', assets };
  writeFileSync(`${dir}/kit.json`, JSON.stringify(kit, null, 2));
  const byRole = {};
  for (const v of Object.values(assets)) byRole[v.role] = (byRole[v.role] ?? 0) + 1;
  console.log(`${kit.name}: ${Object.keys(assets).length} assets  module=${kit.module}  roles=${JSON.stringify(byRole)}`);
}
