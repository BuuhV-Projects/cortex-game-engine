// Empacota o pack **Smallburg Village** num kit do engine. Layout específico (≠
// pack-2d-kit.mjs, que é "1 pasta = 1 char, tira simples"):
//
//  • CHARACTER = sistema modular em camadas, top-down 4 direções, frame 64×64.
//    Strips em `character/adult/<anim>/…` (idle 2 / walk 6 / run 4 frames; 4 linhas
//    = 4 direções). Gera uma FOLHA por personagem com animações `<anim>_<dir>`
//    (idle_down, walk_left, …) numa folha só (todas as direções têm o mesmo frame).
//  • PREMADE = body + camadas de roupa/cabelo compostas por célula (alpha-over),
//    resolvendo cada camada por **substrings de pasta** (os nomes de subpasta
//    variam por anim: shirt_solids / solid_shirts / shirt_solid) + sufixo de cor.
//  • ESTÁTICOS (commerce/housing/tileset) = cada PNG inteiro vira 1 asset sprite
//    estático (sem `sprite`), role por categoria.
//
// Uso: node pack-2d-village.mjs <srcDir> [outDir=kits/kit-smallburg-village]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { decodePNG, encodePNG, cropRGBA, blitRGBA, blitOver, scaleNearest } from './png.mjs';

const SRC = process.argv[2];
const OUT = process.argv[3] || 'kits/kit-smallburg-village';
if (!SRC) {
  console.error('uso: node pack-2d-village.mjs <srcDir> [outDir]');
  process.exit(1);
}

const ADULT = join(SRC, 'character', 'adult');
const F = 64;
const ANIMS = ['idle', 'walk', 'run'];
const FPS = { idle: 6, walk: 8, run: 12 };
const DIRS = ['down', 'right', 'left', 'up']; // linhas 0..3 (confirmado por contact-sheet)
const THEME = 'village';

mkdirSync(join(OUT, 'assets'), { recursive: true });
mkdirSync(join(OUT, 'thumbnails'), { recursive: true });

// ── Resolução de camada ───────────────────────────────────────────────────────
// `segs`: substrings de pasta sob character/adult/<anim>/ (match exato preferido,
// senão `includes` — desambigua `ties` vs `bow_ties`). `color`: sufixo do arquivo
// (`_<color>`), ou null = arquivo único (ignora `_all`/shadow), ou objeto por-anim.
function pickDir(dir, seg) {
  if (!existsSync(dir)) return null;
  const kids = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
  return (
    kids.find((d) => d.toLowerCase() === seg) ??
    kids.find((d) => d.toLowerCase().includes(seg)) ??
    null
  );
}
function resolveLayer(anim, layer) {
  let dir = join(ADULT, anim);
  for (const seg of layer.segs) {
    const child = pickDir(dir, seg);
    if (!child) return null;
    dir = join(dir, child);
  }
  const pngs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png') && !/_all\.png$/i.test(f));
  const color = layer.color && typeof layer.color === 'object' ? layer.color[anim] : layer.color;
  if (color == null) {
    return join(dir, pngs.find((f) => !/(shadow|_all)/i.test(f)) ?? pngs[0]);
  }
  const c = String(color).toLowerCase();
  // 1) sufixo exato `_<color>`
  let file = pngs.find((f) => f.slice(0, -4).toLowerCase().endsWith('_' + c));
  // 2) fallback: casa pelo 1º token (green_dark→green), tolerando typos do pack
  //    (idle/run usam `green_dark` mas walk só `green`; run tem `browm_dark` em vez
  //    de `brown_dark`). Mantém o matiz pretendido sem dropar a camada.
  if (!file) {
    const tok = c.split('_')[0];
    const alts = [tok, tok.replace('brown', 'browm')];
    file = pngs.find((f) => {
      const s = f.slice(0, -4).toLowerCase();
      return alts.some((t) => new RegExp('_' + t + '(_|$)').test(s));
    });
  }
  return file ? join(dir, file) : null;
}

// ── Monta uma folha de personagem (lista de camadas, baixo→topo; [0]=body) ──────
function buildCharacter(name, layers) {
  const perAnim = {};
  for (const anim of ANIMS) {
    const bodyFile = resolveLayer(anim, layers[0]);
    if (!bodyFile || !existsSync(bodyFile)) {
      console.error(`! ${name}: body ausente em ${anim} — pulando`);
      return null;
    }
    const body = decodePNG(readFileSync(bodyFile));
    if (body.width % F || body.height % F) {
      console.error(`! ${name}: body ${anim} não casa com ${F}px — pulando`);
      return null;
    }
    const imgs = [body];
    for (let i = 1; i < layers.length; i++) {
      const f = resolveLayer(anim, layers[i]);
      const tag = `${layers[i].segs.join('/')}=${layers[i].color ?? '·'}`;
      if (!f || !existsSync(f)) {
        console.warn(`  ~ ${name}/${anim}: camada ${tag} não encontrada — ignorada`);
        imgs.push(null);
        continue;
      }
      const im = decodePNG(readFileSync(f));
      if (im.width !== body.width || im.height !== body.height) {
        console.warn(`  ~ ${name}/${anim}: camada ${tag} grade diferente — ignorada`);
        imgs.push(null);
        continue;
      }
      imgs.push(im);
    }
    perAnim[anim] = { cols: body.width / F, imgs };
  }

  let total = 0;
  for (const a of ANIMS) total += perAnim[a].cols * DIRS.length;
  const sheetW = total * F;
  const sheet = Buffer.alloc(sheetW * F * 4);
  const animations = {};
  let frame = 0;
  for (const anim of ANIMS) {
    const { cols, imgs } = perAnim[anim];
    for (let d = 0; d < DIRS.length; d++) {
      const start = frame;
      for (let c = 0; c < cols; c++) {
        const cell = Buffer.alloc(F * F * 4); // transparente
        for (const im of imgs) {
          if (!im) continue;
          const sub = cropRGBA(im.data, im.width, c * F, d * F, F, F);
          blitOver(cell, F, sub, F, F, 0, 0);
        }
        blitRGBA(sheet, sheetW, cell, F, F, frame * F, 0);
        frame++;
      }
      animations[`${anim}_${DIRS[d]}`] = { frames: Array.from({ length: cols }, (_, i) => start + i), fps: FPS[anim] };
    }
  }

  const png = `${name}.png`;
  writeFileSync(join(OUT, 'assets', png), encodePNG(sheetW, F, sheet));
  writeFileSync(join(OUT, 'thumbnails', png), encodePNG(F, F, cropRGBA(sheet, sheetW, 0, 0, F, F)));
  console.log(`✓ ${name}: ${total} frames · ${Object.keys(animations).length} anims (${DIRS.length} dir)`);
  return {
    role: 'character',
    tags: [THEME, '2d', 'character'],
    sprite: { frameWidth: F, frameHeight: F, animations, initial: 'idle_down', pixelsPerUnit: 64 },
    thumb: `thumbnails/${png}`,
  };
}

// ── Specs ───────────────────────────────────────────────────────────────────
const body = (color) => ({ segs: ['body'], color });
const shoes = (color) => ({ segs: ['clothes', 'shoe'], color });
const pants = (color) => ({ segs: ['clothes', 'legs', 'pant'], color });
const skirt = (color) => ({ segs: ['clothes', 'legs', 'skirt'], color });
const shirtSolid = (color) => ({ segs: ['clothes', 'chest', 'solid'], color });
const shirtStripe = (color) => ({ segs: ['clothes', 'chest', 'strip'], color });
const jacket = (color) => ({ segs: ['clothes', 'chest', 'jacket'], color });
const overalls = (color) => ({ segs: ['clothes', 'full', 'overhall'], color });
const hazmat = () => ({ segs: ['clothes', 'full', 'hazmat'], color: null });
const hair = (style, color) => ({ segs: ['hairstyle', style], color });
const tie = (color) => ({ segs: ['clothes', 'acessor', 'ties'], color });
const bowtie = (color) => ({ segs: ['clothes', 'acessor', 'bow_ties'], color });

const DARK = { idle: 'black', walk: 'dark', run: 'dark' }; // pele escura: 'black' no idle, 'dark' no walk/run

const CHARACTERS = [
  // bodies (sem roupa)
  ['body_light', [body('light')]],
  ['body_brown', [body('brown')]],
  ['body_dark', [body(DARK)]],
  // premades compostos (body → shoes → pernas → torso → cabelo → acessório)
  ['premade_villager_green', [body('light'), shoes('brown'), pants('green_dark'), shirtSolid('green_light'), hair('short', 'brown_dark')]],
  ['premade_villager_red', [body('brown'), shoes('black'), skirt('red'), shirtStripe('white'), hair('long', 'black')]],
  ['premade_villager_blue', [body(DARK), shoes('blue_dark'), pants('blue_dark'), shirtSolid('blue_light'), hair('short', 'black')]],
  ['premade_dapper_brown', [body('light'), shoes('black'), pants('black'), jacket('brown'), hair('short', 'brown_dark'), tie('red')]],
  ['premade_worker_overalls', [body('brown'), shoes('brown'), overalls('blue'), hair('small', 'black')]],
  ['premade_scientist_hazmat', [body('light'), hazmat()]],
  ['premade_lady_pink', [body('light'), shoes('pink'), skirt('pink'), shirtSolid('white'), hair('long', 'blonde'), bowtie('red')]],
  ['premade_kid_yellow', [body('brown'), shoes('yellow'), pants('yellow'), shirtStripe('red'), hair('small', 'brown_light')]],
  ['premade_gent_blue', [body(DARK), shoes('black'), pants('white'), jacket('blue'), hair('short', 'black'), bowtie('blue')]],
];

// ── Estáticos de cenário ───────────────────────────────────────────────────────
const ENV_DIRS = ['commerce', 'housing', 'tileset_v2', 'tileset_v3_wip'];
function envRoleTags(rel) {
  const p = rel.replace(/\\/g, '/').toLowerCase();
  if (p.startsWith('commerce/')) return ['prop', [THEME, 'commerce']];
  if (p.startsWith('housing/')) return ['prop', [THEME, 'housing']];
  if (p.includes('flower_garden')) return ['decoration', [THEME, 'garden']];
  if (p.includes('bush')) return ['decoration', [THEME, 'foliage']];
  if (p.includes('stair')) return ['prop', [THEME, 'stairs']];
  if (p.includes('hills')) return ['tile', [THEME, 'wip']];
  return ['tile', [THEME, 'terrain']]; // outside_assets / terrain
}
function listEnv() {
  const out = [];
  const walk = (dir, rootRel) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const rel = rootRel ? `${rootRel}/${e}` : e;
      if (statSync(full).isDirectory()) {
        if (/old (version|v1\.2)/i.test(e)) continue; // pula duplicatas antigas
        walk(full, rel);
      } else if (e.toLowerCase().endsWith('.png') && !/(_all|-export)\.png$/i.test(e)) {
        out.push({ full, rel });
      }
    }
  };
  for (const d of ENV_DIRS) {
    const root = join(SRC, d);
    if (existsSync(root)) walk(root, d);
  }
  return out;
}

// ── Build ──────────────────────────────────────────────────────────────────────
const assets = {};
console.log('— personagens —');
for (const [name, layers] of CHARACTERS) {
  const a = buildCharacter(name, layers);
  if (a) assets[`assets/${name}.png`] = a;
}

console.log('— estáticos de cenário —');
const used = new Set(Object.keys(assets).map((k) => basename(k)));
let envCount = 0;
for (const { full, rel } of listEnv()) {
  let name = basename(full);
  if (used.has(name)) name = `${rel.split('/')[0]}_${name}`; // desambigua colisão por categoria
  used.add(name);
  copyFileSync(full, join(OUT, 'assets', name));
  // thumbnail (≤128px nearest); se não for RGBA8, aponta o thumb pro próprio asset
  let thumb = `assets/${name}`;
  try {
    const img = decodePNG(readFileSync(full));
    const s = Math.min(1, 128 / Math.max(img.width, img.height));
    const tw = Math.max(1, Math.round(img.width * s));
    const th = Math.max(1, Math.round(img.height * s));
    writeFileSync(join(OUT, 'thumbnails', name), encodePNG(tw, th, scaleNearest(img.data, img.width, img.height, tw, th)));
    thumb = `thumbnails/${name}`;
  } catch (e) {
    console.warn(`  ~ ${name}: thumbnail pulado (${e.message})`);
  }
  const [role, tags] = envRoleTags(rel);
  assets[`assets/${name}`] = { role, tags, thumb };
  envCount++;
}
console.log(`✓ ${envCount} estáticos`);

const kit = { version: 1, name: basename(OUT), module: 1, theme: THEME, assets };
writeFileSync(join(OUT, 'kit.json'), JSON.stringify(kit, null, 2));
console.log(`\nkit.json: ${Object.keys(assets).length} assets → ${OUT}`);
