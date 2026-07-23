// Renderiza um BLUEPRINT de fase (HTML self-contained) a partir de um layout
// projetado pela IA (`blueprint.json`) + um kit curado (`kit.json` + thumbnails).
//
// SINCRONIA: este script (skill do Claude Code) tem um GÊMEO em TS usado pela tool
// `generate_blueprint` do Chat IA do Studio —
// `electron/agent/blueprint/renderBlueprint.ts` (ADR-0142). A lógica de render é a
// mesma (paridade HTML byte-a-byte); mude os DOIS juntos (BEHAVIORS/CATS/layout).
//
// Divisão de trabalho (igual ao gen-kit): a IA faz o DESIGN (posiciona as peças,
// define zonas e passos); ESTE script faz a RENDERIZAÇÃO determinística — embute
// as thumbnails em base64 (self-contained, sem host externo → serve de Artifact),
// deriva a cor de cada peça do `role`/`tags` do kit.json, e a legenda de CADA peça
// é SEMPRE o nome exato do arquivo (regra do blueprint). Ver SKILL.md.
//
// Uso:  node render_blueprint.mjs <blueprint.json> <kitDir> <out.html>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [bpPath, kitDir, outPath] = process.argv.slice(2);
if (!bpPath || !kitDir || !outPath) {
  console.error('uso: node render_blueprint.mjs <blueprint.json> <kitDir> <out.html>');
  process.exit(1);
}
const bp = JSON.parse(readFileSync(bpPath, 'utf8'));
const kit = JSON.parse(readFileSync(join(kitDir, 'kit.json'), 'utf8'));

// ── 6 categorias de legenda (cor) — espelham o blueprint de referência. ────────
const CATS = {
  collectible: { label: 'Coletável / power-up', color: '#f5c451' },
  hazard: { label: 'Perigo (✕)', color: '#f0587e' },
  mechanism: { label: 'Mecanismo / plataforma', color: '#9b7be8' },
  objective: { label: 'Chave · Objetivo', color: '#5ed0e0' },
  terrain: { label: 'Terreno / neutro', color: '#3d7bd6' },
  decoration: { label: 'Decoração', color: '#6b6f8a' },
};
const CAT_ORDER = ['collectible', 'hazard', 'mechanism', 'objective', 'terrain', 'decoration'];

// ── VOCABULÁRIO DE COMPORTAMENTO (o que a peça FAZ no jogo) ────────────────────
// Cada `behavior` amarra a peça a um PROPÓSITO de gameplay: a categoria (cor), o
// script/componente sugerido do engine e o `role`/`gameplayRole` do kit que DEVE
// casar (senão o render avisa). É o coração do blueprint orientado a gameplay:
// cada objeto na cena existe por uma função, não por estética. Ver SKILL.md.
const BEHAVIORS = {
  spawn:           { cat: 'objective',   script: 'PontoInicio',      roles: ['prop', 'decoration', 'ground'] },
  goal:            { cat: 'objective',   script: 'Chegada',          roles: ['prop', 'ground'],  tags: ['goal', 'trophy'] },
  checkpoint:      { cat: 'objective',   script: 'Checkpoint',       roles: ['prop'],            tags: ['checkpoint', 'gate'] },
  collectible:     { cat: 'collectible', script: 'Moeda',            roles: ['collectible'] },
  hazard:          { cat: 'hazard',      script: 'Perigo',           roles: ['hazard'] },
  'hazard-spinner':{ cat: 'hazard',      script: 'MarteloGiratorio', roles: ['hazard', 'platform'], tags: ['rotating', 'sweeper', 'pendulum'] },
  'hazard-chaser': { cat: 'hazard',      script: 'Drone',            roles: ['prop', 'hazard'],  tags: ['vehicle', 'ufo'] },
  launcher:        { cat: 'mechanism',   script: 'Trampolim',        roles: ['platform'],        tags: ['bounce'] },
  platform:        { cat: 'mechanism',   script: null,               roles: ['platform', 'connector'] },
  'platform-moving':{ cat: 'mechanism',  script: 'Patrulha',         roles: ['platform', 'ground', 'connector'] },
  conveyor:        { cat: 'mechanism',   script: 'Esteira',          roles: ['platform'],        tags: ['conveyor'] },
  'rotating-platform':{ cat: 'mechanism',script: 'PlataformaGiratoria',roles: ['platform'],      tags: ['rotating', 'disc'] },
  saw:             { cat: 'hazard',      script: 'Serra',            roles: ['hazard'],          tags: ['spikes', 'rotating'] },
  crusher:         { cat: 'hazard',      script: 'Prensa',           roles: ['prop', 'hazard'],  tags: ['barrier', 'bar'] },
  blocker:         { cat: 'mechanism',   script: null,               roles: ['prop', 'decoration'], tags: ['barrier', 'boundary', 'fence'] },
  ground:          { cat: 'terrain',     script: null,               roles: ['ground'] },
  decoration:      { cat: 'decoration',  script: null,               roles: ['decoration', 'prop'] },
};

// role/tags → categoria (FALLBACK quando a peça não declara `behavior`).
function categoryOf(asset) {
  const role = asset?.role ?? 'prop';
  const tags = asset?.tags ?? [];
  const has = (...t) => t.some((x) => tags.includes(x));
  if (has('key', 'goal', 'checkpoint', 'trophy', 'gate')) return 'objective';
  if (role === 'collectible') return 'collectible';
  if (role === 'hazard') return 'hazard';
  if (role === 'platform' || role === 'connector') return 'mechanism';
  if (role === 'ground') return 'terrain';
  return 'decoration'; // decoration + prop genérico
}

// Formata params de gameplay compactos: {raio:1.8} → "raio 1.8"
function fmtParams(params) {
  if (!params || typeof params !== 'object') return '';
  return Object.entries(params).map(([k, v]) => `${k} ${v}`).join(' · ');
}

// ── Thumbnails → data-URI (self-contained). Cache por asset. ────────────────────
const thumbCache = new Map();
function thumbURI(name) {
  if (thumbCache.has(name)) return thumbCache.get(name);
  const p = join(kitDir, 'thumbnails', `${name}.png`);
  let uri = null;
  if (existsSync(p)) uri = `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  thumbCache.set(name, uri);
  return uri;
}

// ── Escala: px da thumb derivada do bbox real (leitura de escala automática). ──
const canvas = bp.canvas ?? { w: 1920, h: 1080 };
const pxPerUnit = bp.pxPerUnit ?? 7; // 1 unidade de mundo ≈ 7px
const MIN_PX = 26;
const MAX_PX = 320;
function pieceWidth(piece, asset) {
  if (piece.px) return piece.px;
  const size = asset?.size;
  const maxDim = size ? Math.max(size[0], size[2]) : 2; // planta (X,Z)
  const base = Math.max(MIN_PX, Math.min(MAX_PX, maxDim * pxPerUnit));
  return base * (piece.scale ?? 1);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usedCats = new Set();
const warnings = [];

// ── Peças (posicionadas por centro x,y em px; y cresce pra baixo). ─────────────
const piecesHTML = (bp.pieces ?? [])
  .map((p) => {
    const name = p.asset;
    const asset = kit.assets?.[`assets/${name}.glb`] ?? kit.assets?.[name];
    if (!asset) warnings.push(`asset fora do kit.json: ${name}`);
    const uri = thumbURI(name);
    if (!uri) warnings.push(`sem thumbnail: ${name}`);

    // Comportamento → categoria (cor) + script sugerido. `behavior` VENCE tudo;
    // `category` explícita é fallback legado; senão deriva do kit (role/tags).
    const beh = p.behavior ? BEHAVIORS[p.behavior] : null;
    if (p.behavior && !beh) warnings.push(`behavior desconhecido: "${p.behavior}" (${name})`);
    const cat = beh?.cat ?? p.category ?? categoryOf(asset);
    usedCats.add(cat);
    // AVISO de propósito: o asset escolhido casa com o comportamento pedido?
    // (role/gameplayRole/tags do kit — evita escolher peça por estética.) Só
    // avisa em comportamentos de GAMEPLAY ATIVO — usar um asset como decor/parede
    // é rebaixamento seguro e não merece ruído.
    const PASSIVE = new Set(['decoration', 'blocker', 'ground']);
    if (beh && asset && !PASSIVE.has(p.behavior)) {
      const role = asset.role ?? 'prop';
      const tags = asset.tags ?? [];
      const roleOk = beh.roles.includes(role);
      const tagOk = !beh.tags || beh.tags.some((t) => tags.includes(t));
      if (!roleOk && !tagOk) {
        warnings.push(`propósito duvidoso: ${name} (role "${role}") como "${p.behavior}" — esperado role ${beh.roles.join('/')}${beh.tags ? ' ou tag ' + beh.tags.join('/') : ''}`);
      }
    }
    const color = CATS[cat]?.color ?? '#6b6f8a';
    const w = pieceWidth(p, asset);
    const isHazard = cat === 'hazard';
    const mark = isHazard ? ' <span class="x">✕</span>' : '';
    const note = p.note ? `<span class="note">${esc(p.note)}</span>` : '';
    // Linha de COMPORTAMENTO: script + params (o que o dev/Chat IA crava). Só
    // aparece quando há script real (peça de gameplay), não em decor/ground puro.
    const scriptName = p.script ?? beh?.script ?? null;
    const params = fmtParams(p.params);
    const behLine = scriptName
      ? `<span class="beh">${esc(scriptName)}${params ? ` <em>${esc(params)}</em>` : ''}</span>`
      : '';
    const flag = p.flag
      ? `<span class="flag" style="--fc:${p.flagColor ?? '#7ee081'}">${esc(p.flag)}</span>`
      : '';
    const img = uri
      ? `<img src="${uri}" width="${w.toFixed(0)}" alt="${esc(name)}">`
      : `<div class="ph" style="width:${w.toFixed(0)}px;height:${w.toFixed(0)}px"></div>`;
    // label = NOME EXATO DO ARQUIVO (regra do blueprint), nunca traduzido.
    return `<div class="piece" style="left:${p.x}px;top:${p.y}px;--w:${w.toFixed(0)}px;--c:${color}">
      ${flag}${img}
      <div class="lbl"><b>${esc(name)}</b>${mark}${behLine}${note}</div>
    </div>`;
  })
  .join('\n');

// ── Zonas (top-down): retângulos hachurados com rótulo. ───────────────────────
const zonesHTML = (bp.zones ?? [])
  .map((z) => {
    const cat = z.kind ?? 'terrain';
    const color = CATS[cat]?.color ?? CATS.terrain.color;
    return `<div class="zone" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;--zc:${color}">
      <span class="ztag">${esc(z.label)}</span>
    </div>`;
  })
  .join('\n');

// ── Caminho do jogador: string SVG path (a IA escreve M/L/Q…). ────────────────
const pathSVG = bp.pathD
  ? `<svg class="pathlayer" viewBox="0 0 ${canvas.w} ${canvas.h}" preserveAspectRatio="none">
       <path d="${esc(bp.pathD)}" class="ppath"/>
     </svg>`
  : '';

// ── Passos (painel numerado no topo). ─────────────────────────────────────────
const stepsHTML = (bp.steps ?? [])
  .map(
    (s) => `<div class="step"><span class="sn">${esc(s.n)}</span>
      <div><b>${esc(s.title)}</b><small>${esc(s.desc ?? '')}</small></div></div>`,
  )
  .join('\n');

// ── Legenda de cores (só as categorias usadas). ───────────────────────────────
const legendHTML = CAT_ORDER.filter((c) => usedCats.has(c))
  .map((c) => `<span class="leg"><i style="background:${CATS[c].color}"></i>${esc(CATS[c].label)}</span>`)
  .join('\n');

const grid = bp.grid ?? 44;
const pieceCount = (bp.pieces ?? []).length;
const title = bp.title ?? 'Blueprint de Fase';
const kitName = bp.kit ?? kit.name ?? '';
const orient = bp.orientation === 'top-down' ? 'Vista de cima (top-down) — zonas' : 'Side-scroller';

// Altura total determinística (pro rasterizador cortar certo): header + steps +
// stage + rodapé. steps assume 1 linha (5 chips de ~250px cabem em 1840).
const HEADER_H = 150;
const STEPS_H = (bp.steps ?? []).length ? 120 : 0;
const FOOTER_H = 64;
const totalH = HEADER_H + STEPS_H + canvas.h + 20 + FOOTER_H;

const html = `<!--BP_W:${canvas.w} BP_H:${totalH}-->
<div class="bp-root">
<style>
  .bp-root { --bg:#0e0b1e; --bg2:#141033; --ink:#e8e6f5; --dim:#9a96c0; --line:#2a2547;
    font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; color:var(--ink);
    background:var(--bg); width:${canvas.w}px; position:relative; margin:0 auto; }
  .bp-root * { box-sizing:border-box; }
  .head { padding:28px 34px 6px; }
  .kick { letter-spacing:.32em; font-size:12px; color:var(--dim); text-transform:uppercase; }
  .head h1 { margin:6px 0 4px; font-size:34px; font-weight:800; }
  .head h1 span { color:#b49bff; }
  .head p { margin:0; max-width:760px; color:var(--dim); font-size:14px; line-height:1.5; }
  .steps { display:flex; gap:12px; padding:16px 34px 8px; flex-wrap:wrap; }
  .step { display:flex; gap:10px; align-items:flex-start; background:var(--bg2);
    border:1px solid var(--line); border-radius:12px; padding:10px 14px; min-width:190px; max-width:250px; }
  .step .sn { flex:none; width:22px; height:22px; border-radius:50%; background:#2b2560;
    color:#c9bcff; font-size:12px; font-weight:700; display:grid; place-items:center;
    border:1px solid #4a3fa0; }
  .step b { font-size:13px; display:block; }
  .step small { color:var(--dim); font-size:11.5px; line-height:1.35; }
  .stage { position:relative; margin:10px 22px; height:${canvas.h}px;
    background:radial-gradient(120% 100% at 50% 0%, #1a1440 0%, #0c0a1c 70%);
    border:1px solid var(--line); border-radius:16px; overflow:hidden;
    background-image:
      linear-gradient(var(--line) 1px, transparent 1px),
      linear-gradient(90deg, var(--line) 1px, transparent 1px),
      radial-gradient(120% 100% at 50% 0%, #1a1440 0%, #0c0a1c 70%);
    background-size:${grid}px ${grid}px, ${grid}px ${grid}px, 100% 100%;
    background-blend-mode:soft-light, soft-light, normal; }
  .zone { position:absolute; border:1.5px dashed var(--zc); border-radius:12px;
    background:color-mix(in srgb, var(--zc) 7%, transparent);
    background-image:repeating-linear-gradient(45deg, color-mix(in srgb,var(--zc) 10%,transparent) 0 8px, transparent 8px 16px); }
  .ztag { position:absolute; top:8px; left:10px; font-size:11px; color:var(--zc);
    background:#0e0b1ecc; padding:2px 8px; border-radius:6px; letter-spacing:.04em; }
  .pathlayer { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
  .ppath { fill:none; stroke:#f2b64a; stroke-width:3; stroke-dasharray:9 8;
    stroke-linecap:round; opacity:.9; filter:drop-shadow(0 0 5px #f2b64a55); }
  .piece { position:absolute; transform:translate(-50%,-50%); width:var(--w);
    display:flex; flex-direction:column; align-items:center; }
  .piece img, .piece .ph { display:block; filter:drop-shadow(0 6px 10px #0008); }
  .piece .ph { border:1.5px dashed var(--c); border-radius:8px; }
  .lbl { margin-top:2px; font-size:10.5px; line-height:1.15; text-align:center; }
  .lbl b { color:var(--c); font-weight:700; white-space:nowrap; }
  .lbl .x { color:#f0587e; font-weight:700; }
  .lbl .beh { display:block; max-width:150px; margin:1px auto 0; font-size:9.5px;
    font-weight:700; color:var(--c); letter-spacing:.02em; opacity:.92; line-height:1.12; }
  .lbl .beh em { font-style:normal; font-weight:500; color:var(--dim); }
  .lbl .note { display:block; max-width:150px; margin:0 auto; color:var(--dim);
    font-size:9.5px; line-height:1.12; }
  .flag { position:absolute; top:-20px; left:50%; transform:translateX(-50%);
    background:var(--fc); color:#0c0a1c; font-size:10px; font-weight:800;
    padding:2px 9px; border-radius:20px; white-space:nowrap; letter-spacing:.04em;
    box-shadow:0 0 12px var(--fc); z-index:3; }
  .foot { display:flex; gap:20px; align-items:center; flex-wrap:wrap;
    padding:10px 34px 26px; font-size:12px; color:var(--dim); }
  .foot .lt { letter-spacing:.2em; text-transform:uppercase; font-size:11px; color:var(--ink); }
  .leg { display:inline-flex; gap:7px; align-items:center; }
  .leg i { width:12px; height:12px; border-radius:3px; display:inline-block; }
  .meta { margin-left:auto; color:#6b6f8a; }
</style>
<div class="head">
  <div class="kick">${esc(kitName.toUpperCase())} · LEVEL DESIGN · ${esc(bp.subtitleKick ?? 'BLUEPRINT')}</div>
  <h1>${esc(title.split('—')[0])}${title.includes('—') ? '<span>—' + esc(title.split('—')[1]) + '</span>' : ''}</h1>
  <p>${esc(bp.subtitle ?? '')}</p>
</div>
${stepsHTML ? `<div class="steps">${stepsHTML}</div>` : ''}
<div class="stage">
  ${zonesHTML}
  ${pathSVG}
  ${piecesHTML}
</div>
<div class="foot">
  <span class="lt">Legenda</span>
  ${legendHTML}
  <span class="meta">${esc(orient)} · grade ${grid}px · nomes de arquivo exatos · ${pieceCount} peças</span>
</div>
</div>`;

writeFileSync(outPath, html);
const counts = {};
for (const c of usedCats) counts[c] = 0;
for (const p of bp.pieces ?? []) {
  const asset = kit.assets?.[`assets/${p.asset}.glb`];
  const cat = BEHAVIORS[p.behavior]?.cat ?? p.category ?? categoryOf(asset);
  counts[cat] = (counts[cat] ?? 0) + 1;
}
console.log(`blueprint: ${pieceCount} peças  cats=${JSON.stringify(counts)}  → ${outPath}`);
if (warnings.length) {
  console.warn(`AVISOS (${warnings.length}):`);
  for (const w of [...new Set(warnings)].slice(0, 30)) console.warn('  -', w);
}
