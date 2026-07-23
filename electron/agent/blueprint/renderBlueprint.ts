/**
 * Motor de render do BLUEPRINT DE FASE (orientado a gameplay) — porta em TS da
 * skill `blueprint-fase` (`.claude/skills/blueprint-fase/scripts/render_blueprint.mjs`).
 * Mantenha os DOIS em sincronia: a skill é a ferramenta do dev (Claude Code); este
 * módulo é o que a tool `generate_blueprint` do Chat IA usa. Lógica idêntica —
 * só a origem das thumbnails muda (aqui vem por callback, não leitura de disco).
 *
 * A IA compõe o `blueprint.json` (design + COMPORTAMENTO de cada peça); este
 * módulo faz a renderização DETERMINÍSTICA: deriva a cor do `behavior`, escreve o
 * script + params de cada peça de gameplay, a legenda com o nome de arquivo exato,
 * e avisa quando um asset não casa com o comportamento de gameplay ativo declarado.
 */

/** Semântica de um asset lida do kit.json (role/tags/size/gameplayRole). */
export interface KitAsset {
  role?: string
  tags?: string[]
  size?: number[]
  gameplayRole?: string[]
}

/** Uma peça posicionada no blueprint (o que a IA compõe). */
export interface BlueprintPiece {
  asset: string
  x: number
  y: number
  behavior?: string
  script?: string
  params?: Record<string, string | number>
  note?: string
  scale?: number
  px?: number
  flag?: string
  flagColor?: string
  category?: string
}

export interface BlueprintZone {
  label: string
  kind?: string
  x: number
  y: number
  w: number
  h: number
}

export interface BlueprintStep {
  n: number | string
  title: string
  desc?: string
}

/** O documento de blueprint que a IA compõe. */
export interface BlueprintDoc {
  kit?: string
  title?: string
  subtitleKick?: string
  subtitle?: string
  orientation?: 'top-down' | 'side-scroller'
  canvas?: { w: number; h: number }
  grid?: number
  pxPerUnit?: number
  steps?: BlueprintStep[]
  zones?: BlueprintZone[]
  pathD?: string
  pieces?: BlueprintPiece[]
}

export interface RenderResult {
  html: string
  width: number
  height: number
  warnings: string[]
  counts: Record<string, number>
}

/** Resolve o data-URI (base64) da thumbnail de um asset, ou null se não achar. */
export type ThumbResolver = (assetName: string) => string | null

// ── 6 categorias de legenda (cor) ─────────────────────────────────────────────
const CATS: Record<string, { label: string; color: string }> = {
  collectible: { label: 'Coletável / power-up', color: '#f5c451' },
  hazard: { label: 'Perigo (✕)', color: '#f0587e' },
  mechanism: { label: 'Mecanismo / plataforma', color: '#9b7be8' },
  objective: { label: 'Chave · Objetivo', color: '#5ed0e0' },
  terrain: { label: 'Terreno / neutro', color: '#3d7bd6' },
  decoration: { label: 'Decoração', color: '#6b6f8a' },
}
const CAT_ORDER = ['collectible', 'hazard', 'mechanism', 'objective', 'terrain', 'decoration']

// ── VOCABULÁRIO DE COMPORTAMENTO (o que a peça FAZ no jogo) ────────────────────
// behavior → categoria (cor) + script sugerido + role/tags do kit que DEVE casar.
interface BehaviorDef {
  cat: string
  script: string | null
  roles: string[]
  tags?: string[]
}
const BEHAVIORS: Record<string, BehaviorDef> = {
  spawn: { cat: 'objective', script: 'PontoInicio', roles: ['prop', 'decoration', 'ground'] },
  goal: { cat: 'objective', script: 'Chegada', roles: ['prop', 'ground'], tags: ['goal', 'trophy'] },
  checkpoint: { cat: 'objective', script: 'Checkpoint', roles: ['prop'], tags: ['checkpoint', 'gate'] },
  collectible: { cat: 'collectible', script: 'Moeda', roles: ['collectible'] },
  hazard: { cat: 'hazard', script: 'Perigo', roles: ['hazard'] },
  'hazard-spinner': { cat: 'hazard', script: 'MarteloGiratorio', roles: ['hazard', 'platform'], tags: ['rotating', 'sweeper', 'pendulum'] },
  'hazard-chaser': { cat: 'hazard', script: 'Drone', roles: ['prop', 'hazard'], tags: ['vehicle', 'ufo'] },
  launcher: { cat: 'mechanism', script: 'Trampolim', roles: ['platform'], tags: ['bounce'] },
  platform: { cat: 'mechanism', script: null, roles: ['platform', 'connector'] },
  'platform-moving': { cat: 'mechanism', script: 'Patrulha', roles: ['platform', 'ground', 'connector'] },
  conveyor: { cat: 'mechanism', script: 'Esteira', roles: ['platform'], tags: ['conveyor'] },
  'rotating-platform': { cat: 'mechanism', script: 'PlataformaGiratoria', roles: ['platform'], tags: ['rotating', 'disc'] },
  saw: { cat: 'hazard', script: 'Serra', roles: ['hazard'], tags: ['spikes', 'rotating'] },
  crusher: { cat: 'hazard', script: 'Prensa', roles: ['prop', 'hazard'], tags: ['barrier', 'bar'] },
  blocker: { cat: 'mechanism', script: null, roles: ['prop', 'decoration'], tags: ['barrier', 'boundary', 'fence'] },
  ground: { cat: 'terrain', script: null, roles: ['ground'] },
  decoration: { cat: 'decoration', script: null, roles: ['decoration', 'prop'] },
}
const PASSIVE_BEHAVIORS = new Set(['decoration', 'blocker', 'ground'])

// role/tags → categoria (FALLBACK quando a peça não declara `behavior`).
function categoryOf(asset: KitAsset | undefined): string {
  const role = asset?.role ?? 'prop'
  const tags = asset?.tags ?? []
  const has = (...t: string[]): boolean => t.some((x) => tags.includes(x))
  if (has('key', 'goal', 'checkpoint', 'trophy', 'gate')) return 'objective'
  if (role === 'collectible') return 'collectible'
  if (role === 'hazard') return 'hazard'
  if (role === 'platform' || role === 'connector') return 'mechanism'
  if (role === 'ground') return 'terrain'
  return 'decoration'
}

function fmtParams(params: Record<string, string | number> | undefined): string {
  if (!params || typeof params !== 'object') return ''
  return Object.entries(params)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ')
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

const MIN_PX = 26
const MAX_PX = 320

function pieceWidth(piece: BlueprintPiece, asset: KitAsset | undefined, pxPerUnit: number): number {
  if (piece.px) return piece.px
  const size = asset?.size
  const maxDim = size ? Math.max(size[0]!, size[2]!) : 2
  const base = Math.max(MIN_PX, Math.min(MAX_PX, maxDim * pxPerUnit))
  return base * (piece.scale ?? 1)
}

/**
 * Renderiza o blueprint num HTML self-contained (thumbnails já embutidas via
 * `resolveThumb`) + devolve dimensões pra rasterizar e avisos de validação.
 */
export function renderBlueprintHtml(
  bp: BlueprintDoc,
  kitAssets: Map<string, KitAsset>,
  resolveThumb: ThumbResolver,
): RenderResult {
  const canvas = bp.canvas ?? { w: 1920, h: 1080 }
  const pxPerUnit = bp.pxPerUnit ?? 7
  const usedCats = new Set<string>()
  const warnings: string[] = []

  const lookupAsset = (name: string): KitAsset | undefined =>
    kitAssets.get(name) ?? kitAssets.get(name.replace(/\.glb$/i, ''))

  const piecesHTML = (bp.pieces ?? [])
    .map((p) => {
      const name = p.asset
      const asset = lookupAsset(name)
      if (!asset) warnings.push(`asset fora do kit: ${name}`)
      const uri = resolveThumb(name)
      if (!uri) warnings.push(`sem thumbnail: ${name}`)

      const beh = p.behavior ? BEHAVIORS[p.behavior] : null
      if (p.behavior && !beh) warnings.push(`behavior desconhecido: "${p.behavior}" (${name})`)
      const cat = beh?.cat ?? p.category ?? categoryOf(asset)
      usedCats.add(cat)

      if (beh && asset && p.behavior && !PASSIVE_BEHAVIORS.has(p.behavior)) {
        const role = asset.role ?? 'prop'
        const tags = asset.tags ?? []
        const roleOk = beh.roles.includes(role)
        const tagOk = !beh.tags || beh.tags.some((t) => tags.includes(t))
        if (!roleOk && !tagOk) {
          warnings.push(
            `propósito duvidoso: ${name} (role "${role}") como "${p.behavior}" — esperado role ${beh.roles.join('/')}${beh.tags ? ' ou tag ' + beh.tags.join('/') : ''}`,
          )
        }
      }

      const color = CATS[cat]?.color ?? '#6b6f8a'
      const w = pieceWidth(p, asset, pxPerUnit)
      const isHazard = cat === 'hazard'
      const mark = isHazard ? ' <span class="x">✕</span>' : ''
      const note = p.note ? `<span class="note">${esc(p.note)}</span>` : ''
      const scriptName = p.script ?? beh?.script ?? null
      const params = fmtParams(p.params)
      const behLine = scriptName
        ? `<span class="beh">${esc(scriptName)}${params ? ` <em>${esc(params)}</em>` : ''}</span>`
        : ''
      const flag = p.flag
        ? `<span class="flag" style="--fc:${p.flagColor ?? '#7ee081'}">${esc(p.flag)}</span>`
        : ''
      const img = uri
        ? `<img src="${uri}" width="${w.toFixed(0)}" alt="${esc(name)}">`
        : `<div class="ph" style="width:${w.toFixed(0)}px;height:${w.toFixed(0)}px"></div>`
      return `<div class="piece" style="left:${p.x}px;top:${p.y}px;--w:${w.toFixed(0)}px;--c:${color}">
      ${flag}${img}
      <div class="lbl"><b>${esc(name)}</b>${mark}${behLine}${note}</div>
    </div>`
    })
    .join('\n')

  const zonesHTML = (bp.zones ?? [])
    .map((z) => {
      const cat = z.kind ?? 'terrain'
      const color = CATS[cat]?.color ?? CATS.terrain!.color
      return `<div class="zone" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;--zc:${color}">
      <span class="ztag">${esc(z.label)}</span>
    </div>`
    })
    .join('\n')

  const pathSVG = bp.pathD
    ? `<svg class="pathlayer" viewBox="0 0 ${canvas.w} ${canvas.h}" preserveAspectRatio="none">
       <path d="${esc(bp.pathD)}" class="ppath"/>
     </svg>`
    : ''

  const stepsHTML = (bp.steps ?? [])
    .map(
      (s) => `<div class="step"><span class="sn">${esc(s.n)}</span>
      <div><b>${esc(s.title)}</b><small>${esc(s.desc ?? '')}</small></div></div>`,
    )
    .join('\n')

  const legendHTML = CAT_ORDER.filter((c) => usedCats.has(c))
    .map((c) => `<span class="leg"><i style="background:${CATS[c]!.color}"></i>${esc(CATS[c]!.label)}</span>`)
    .join('\n')

  const grid = bp.grid ?? 44
  const pieceCount = (bp.pieces ?? []).length
  const title = bp.title ?? 'Blueprint de Fase'
  const kitName = bp.kit ?? ''
  const orient = bp.orientation === 'top-down' ? 'Vista de cima (top-down) — zonas' : 'Side-scroller'

  const HEADER_H = 150
  const STEPS_H = (bp.steps ?? []).length ? 120 : 0
  const FOOTER_H = 64
  const totalH = HEADER_H + STEPS_H + canvas.h + 20 + FOOTER_H

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
</div>`

  const counts: Record<string, number> = {}
  for (const p of bp.pieces ?? []) {
    const cat = (p.behavior && BEHAVIORS[p.behavior]?.cat) ?? p.category ?? categoryOf(lookupAsset(p.asset))
    counts[cat] = (counts[cat] ?? 0) + 1
  }

  return { html, width: canvas.w, height: totalH, warnings: [...new Set(warnings)], counts }
}
