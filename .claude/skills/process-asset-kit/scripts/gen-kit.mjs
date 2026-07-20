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

  // ── Personagem modular (SPEC-0068): rig compartilhado + peças skinnadas ─────
  // role `rig` = esqueleto (+clips futuros); `character-part` = peça vestível,
  // tags = [slot, ...]; compostas em runtime via composeModularCharacter.
  if (/^rig$/.test(n)) return R('rig', ['skeleton'], []);
  if (/^body_/.test(n)) return R('character-part', ['body', 'humanoid'], []);
  if (/^ears_/.test(n)) return R('character-part', ['ears'], []);
  if (/^(male|female)_emotion_/.test(n)) return R('character-part', ['face', n.split('_')[0]], []);
  if (/^hairstyle_(male|female)/.test(n)) return R('character-part', ['hair', n.split('_')[1]], []);
  if (/^(beard|mustache)_/.test(n)) return R('character-part', ['facial-hair'], []);
  if (/^hat_/.test(n)) return R('character-part', ['hat'], []);
  if (/^(costume|outfit)_/.test(n)) return R('character-part', ['outfit'], []);
  if (/^outwear_/.test(n)) return R('character-part', ['outwear'], []);
  if (/^(pants|shorts)_/.test(n)) return R('character-part', ['pants'], []);
  if (/^shoe_/.test(n)) return R('character-part', ['shoes'], []);
  if (/^socks_/.test(n)) return R('character-part', ['socks'], []);
  if (/^gloves_/.test(n)) return R('character-part', ['gloves'], []);
  if (/^glasses_/.test(n)) return R('character-part', ['glasses'], []);
  if (/^(mask|earrings|headphones|bandage|clown_nose|pacifier)/.test(n)) return R('character-part', ['accessory'], []);

  // ── Personagens / inimigos / armas (KayKit + Quaternius) ───────────────────
  if (/^(barbarian|knight|mage|ranger|rogue|rogue_hooded)$/.test(n)) return R('character', ['hero', 'humanoid'], ['player']);
  if (/^character/.test(n)) return R('character', ['hero', 'humanoid'], ['player']); // Quaternius Character/_Gun
  if (/^skeleton_(mage|minion|rogue|warrior)/.test(n)) return R('enemy', ['skeleton', 'undead'], ['challenge']);
  if (/^(enemy|bee|crab)\b/.test(n)) return R('enemy', ['enemy'], ['challenge']);
  if (/^arrow_(bow|crossbow)/.test(n)) return R('prop', ['ammo', 'item'], []); // KayKit ammo
  if (/^(skeleton_)?(sword|axe|dagger|bow|crossbow|staff|wand|spellbook|quiver|mace|spear|blade)/.test(n)) return R('prop', ['weapon', 'item'], ['reward']);
  if (/^shield/.test(n)) return R('prop', ['shield', 'item'], ['reward']);
  if (/^(mug|smokebomb)/.test(n)) return R('prop', ['item'], []);

  // ── Quaternius Ultimate Platformer ─────────────────────────────────────────
  if (/^rockplatform/.test(n)) return R('platform', ['platform', 'rock'], [], { solid: true });
  if (/^stairs/.test(n)) return R('platform', ['platform', 'stairs'], ['guidance'], { solid: true });
  if (/^bridge/.test(n)) return R('connector', ['bridge'], ['guidance'], { solid: true });
  if (/^bouncer/.test(n)) return R('platform', ['platform', 'bounce'], ['challenge'], { solid: true });
  if (/^pipe/.test(n)) return R('prop', ['pipe', 'traversal'], []);
  if (/^cube_crate/.test(n)) return R('prop', ['container', 'crate'], ['resource', 'reward'], { solid: true });
  if (/^cube_spikes/.test(n)) return R('hazard', ['hazard', 'spikes'], ['challenge', 'hazard']);
  if (/^cube_(question|exclamation)/.test(n)) return R('prop', ['interactive', 'block'], ['reward'], { solid: true });
  if (/^cube_/.test(n)) return R('ground', ['terrain', /dirt/.test(n) ? 'dirt' : /grass/.test(n) ? 'grass' : 'stone'], [], { solid: true });
  if (/^star_outline|^heart_outline|^heart_half/.test(n)) return R('decoration', ['ui'], []);
  if (/^(coin|gem_|star|fruit$|key$|chest$)/.test(n)) return R('collectible', ['treasure'], ['reward']);
  if (/^heart/.test(n)) return R('collectible', ['health'], ['reward']);
  if (/^(hazard_|spikyball|thunder|skull)/.test(n)) return R('hazard', ['hazard'], ['challenge', 'hazard']);
  if (/^(bomb|cannon)/.test(n)) return R('hazard', ['hazard', 'explosive'], ['challenge']);
  if (/^goal_flag/.test(n)) return R('decoration', ['goal', 'flag'], ['guidance', 'landmark']);
  if (/^numbers_/.test(n)) return R('decoration', ['ui', 'number'], []);
  if (/^arrow(_up|_side|_down)?$/.test(n)) return R('decoration', ['guidance', 'sign'], ['guidance']);
  if (/^tower$/.test(n)) return R('prop', ['structure'], []);

  // ── Kenney kebab-case (platformer / survival) ──────────────────────────────
  if (/^block-|^platform/.test(n)) {
    const biome = n.includes('snow') ? 'snow' : 'grass';
    const moving = n.includes('moving');
    return R(moving ? 'platform' : 'ground', ['terrain', biome, ...(moving ? ['moving'] : [])], moving ? ['challenge'] : [], { solid: true });
  }
  if (/^floor\b|^floor-/.test(n)) return R('ground', ['terrain', 'floor'], [], { solid: true });
  if (/spike|^saw\b|^trap|^bomb\b/.test(n)) return R('hazard', ['hazard'], ['challenge', 'hazard']);
  if (/^coin-|^gem\b|^jewel\b|^key\b|^heart\b|^chest\b|^diamond/.test(n)) return R('collectible', ['treasure'], ['reward']);
  if (/^resource-/.test(n)) return R('collectible', ['resource', /wood|plank/.test(n) ? 'wood' : 'stone'], ['resource']);
  if (/^door|^lever\b|^button|^lock\b|^switch\b/.test(n)) return R('prop', ['interactive'], []);
  if (/^flowers?\b|^mushrooms?\b|^plant\b|^hedge/.test(n)) return R('decoration', ['forest', 'foliage'], []);
  if (/^sign|^flag\b|^arrow|^poles?\b/.test(n)) return R('decoration', ['guidance'], ['guidance']);
  if (/^campfire/.test(n)) return R('prop', ['camp', 'fire'], ['safe-zone']);
  if (/^bedroll|^structure/.test(n)) return R('prop', ['camp', 'shelter'], ['safe-zone'], { solid: true });
  if (/^tool-|^workbench/.test(n)) return R('prop', ['tool', 'item'], ['resource']);
  if (/^box\b|^box-/.test(n)) return R('prop', ['container', 'box'], ['resource', 'reward'], { solid: true });
  if (/^bottle|^fish\b|^fish-/.test(n)) return R('prop', ['item'], []);
  if (/^stones?\b/.test(n)) return R('prop', ['rock', 'stone'], ['cover'], { solid: true });
  if (/^signpost/.test(n)) return R('decoration', ['guidance'], ['guidance']);
  if (/^patch-grass/.test(n)) return R('decoration', ['foliage', 'grass'], []);
  if (/^rock-|^rock\b/.test(n)) return R('prop', ['rock', 'stone'], ['cover'], { solid: true });

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
    // Peça de personagem modular / rig não é posicionada na cena — sem âncoras.
    if (c.role !== 'character-part' && c.role !== 'rig') {
      const anchors = { top: { at: [0, +h.toFixed(3), 0], kind: 'surface', dir: [0, 1, 0] } };
      if (c.connectX) {
        anchors.edge_left = { at: [+(-w / 2).toFixed(3), 0, 0], kind: 'connect', dir: [-1, 0, 0] };
        anchors.edge_right = { at: [+(w / 2).toFixed(3), 0, 0], kind: 'connect', dir: [1, 0, 0] };
      }
      a.anchors = anchors;
    }
    a.thumb = `thumbnails/${name}.png`;
    assets[`assets/${name}.glb`] = a;
  }
  const kit = { version: 1, name: basename(dir), module: hexGrassW ? +hexGrassW.toFixed(3) : 1, theme: 'TBD', assets };
  writeFileSync(`${dir}/kit.json`, JSON.stringify(kit, null, 2));
  const byRole = {};
  for (const v of Object.values(assets)) byRole[v.role] = (byRole[v.role] ?? 0) + 1;
  console.log(`${kit.name}: ${Object.keys(assets).length} assets  module=${kit.module}  roles=${JSON.stringify(byRole)}`);
}
