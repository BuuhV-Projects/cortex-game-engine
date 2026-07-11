/**
 * **Fatiador de trechos** (spec 0005) — corta os mapas-demo autorados dos packs
 * (coleção `Demonstration` dos `.blend`, exportada pra JSON pelo
 * `blender_export_scene.py` da skill level-design-plataforma) em PEÇAS DE
 * ENCAIXAR: segmentos de percurso normalizados que o compositor
 * (`scenes/trechosCompose.ts`) encadeia pra montar fases novas.
 *
 * Anatomia dos dois demos (medida, não chutada): cada um traz **3 percursos
 * paralelos completos** — no Deathrun correndo em +X (faixas z≈−35/−1.5/+34),
 * no Chocolate correndo em −Z (faixas x≈−316/+17/+350). O fatiador separa os
 * percursos por faixa, gira tudo pra progressão = +X, e corta cada percurso nos
 * VÃOS naturais da pista (trecho ≥ MIN_LEN; sem vão, corta no ponto mais
 * "magro" perto do alvo de ~35 m — a cadência de checkpoint da skill).
 *
 * Cada trecho sai como `assets/chunks/<mundo>/<id>.json`:
 *   { id, world, kit, length, entryY, exitY, difficulty, pieces: [...] }
 * com peças em coordenadas LOCAIS (entrada da pista em x=0) e um catálogo
 * `catalog.json` por mundo. GLBs que faltam no kit do jogo são copiados
 * on-demand da pasta-fonte do pack.
 *
 * Uso: node tools/slice_trechos.mjs <demo-deathrun.json> <demo-chocolate.json>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const [deathrunDemoPath, chocolateDemoPath] = process.argv.slice(2)
if (!deathrunDemoPath || !chocolateDemoPath) {
  console.error('uso: node tools/slice_trechos.mjs <demo-deathrun.json> <demo-chocolate.json>')
  process.exit(2)
}

/** Comprimento mínimo/alvo de um trecho (m) — cadência da skill: ~30–40 m. */
const MIN_LEN = 18
const TARGET_LEN = 35

/** Peças de gameplay: eixo-alinhadas SEMPRE (regra R1 — ver lint_chunks.mjs). */
const GAMEPLAY_CATS = new Set(['checkpoint', 'finish', 'trampoline', 'cannon'])
/** Tombamento máximo (rad) de peça de moldura antes de virar "destroço" (R2). */
const TILT_MAX = 30 * (Math.PI / 180)

/** Diário das regras: o que foi normalizado/removido (impresso no fim). */
const normalized = []
const dropped = []
const trimmed = []

// ── Geometria de rotação (mesma convenção Euler XYZ do three.js) ─────────────
// Euler tem representações EQUIVALENTES: (−172°, 1°, 1°) é um giro de yaw com
// flip, e a peça renderiza EM PÉ. Tombamento de verdade se mede pela MATRIZ:
// o ângulo entre o "pra cima" local da peça e o do mundo (|dot| ignora flip —
// cerca de cabeça pra baixo é visualmente idêntica).

function quatFromEulerXYZ([x, y, z]) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2)
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  }
}
function rotateVec(q, v) {
  const tx = 2 * (q.y * v[2] - q.z * v[1])
  const ty = 2 * (q.z * v[0] - q.x * v[2])
  const tz = 2 * (q.x * v[1] - q.y * v[0])
  return [
    v[0] + q.w * tx + (q.y * tz - q.z * ty),
    v[1] + q.w * ty + (q.z * tx - q.x * tz),
    v[2] + q.w * tz + (q.x * ty - q.y * tx),
  ]
}
/** Tombamento (rad): ângulo do UP local vs UP do mundo, ignorando flip. */
function tiltOf(rot) {
  const up = rotateVec(quatFromEulerXYZ(rot), [0, 1, 0])
  return Math.acos(Math.min(1, Math.abs(up[1])))
}
/** Yaw EFETIVO (rad): pra onde o +X local aponta no plano XZ (mira de canhão). */
function yawOf(rot) {
  const fwd = rotateVec(quatFromEulerXYZ(rot), [1, 0, 0])
  return Math.atan2(-fwd[2], fwd[0])
}

// ── Configuração por mundo ────────────────────────────────────────────────────

const WORLDS = [
  {
    id: 'ilhas',
    demo: deathrunDemoPath,
    kitDir: join(ROOT, 'assets/kit'),
    kitUrl: 'assets/kit',
    sourceDir: 'D:/jogos/assets/3d-models/plataforma/Platformer_Deathrun_glb/Separate_assets_glb',
    /** Eixo de progressão no espaço do demo e sentido (+1/-1). */
    axis: 'x', direction: +1,
    /** Centros das faixas (coordenada PERPENDICULAR ao eixo) e meia-largura. */
    lanes: [{ c: -35, half: 18 }, { c: -1.5, half: 16 }, { c: 34, half: 16 }],
    /** Categorias que contam como PISTA (definem entrada/saída/vãos). */
    isTrack: (cat) => cat === 'ground',
    categorize: categorizeDeathrun,
    // Meia-largura MEDIDA das ilhas de terreno (land_001..008) — alimenta as
    // margens headR/tailR: sem elas a colina do trecho engole o conector
    // (plataforma dentro do terreno, 4º playtest).
    footprint: deathrunFootprint,
  },
  {
    id: 'chocolate',
    demo: chocolateDemoPath,
    kitDir: join(ROOT, 'assets/kit-chocolate'),
    kitUrl: 'assets/kit-chocolate',
    sourceDir: 'D:/jogos/assets/3d-models/plataforma/Platformer_3_Chocolate_glb/Separate_assets_glb',
    axis: 'z', direction: -1,
    // Meia-largura em dois raios (diagnóstico do plot lateral/topo): a BANDA DO
    // PERCURSO tem ~±30; além disso só existem ilhas de fundo — que entravam no
    // trecho e viravam "bagunça sem chão" (feedback do playtest).
    lanes: [{ c: -316, half: 30 }, { c: 17, half: 30 }, { c: 350, half: 30 }],
    // SÓ comestível é pista — poça é líquido, cai através (2º playtest).
    isTrack: (cat) => cat === 'pista',
    categorize: categorizeChocolate,
    // O demo do chocolate é um PARQUE sobre terreno contínuo (lajes de 24 m),
    // não plataformas discretas como o Deathrun. Corte e altura têm que ser
    // cientes da GEOMETRIA da peça (footprint + topo), não do pivô.
    surfaceAware: true,
    footprint: chocolateFootprint,
    topOf: chocolateTopOf,
  },
]

// ── Geometria de superfície (ilhas) — meia-largura MEDIDA dos GLBs ───────────

const DEATHRUN_LAND_R = {
  land_001: 13.0, land_002: 4.9, land_003: 3.7, land_004: 6.4,
  land_005: 2.9, land_006: 12.4, land_007: 2.3, land_008: 6.5,
}

/** Meia-largura do footprint da peça de PISTA das Ilhas (m). */
function deathrunFootprint(piece) {
  const st = stem(piece.name).toLowerCase()
  const s = Math.max(Math.abs(piece.scale[0]), Math.abs(piece.scale[2]))
  for (const [k, r] of Object.entries(DEATHRUN_LAND_R)) if (st.startsWith(k)) return r * s
  if (st.startsWith('grass')) return 0.5 * s // tufo de grama, não ilha
  return 1.0 * s
}

// ── Geometria de superfície (chocolate) — raios/topo MEDIDOS dos GLBs ────────

/** Meia-largura do footprint andável da peça no eixo de progressão (m). */
function chocolateFootprint(piece) {
  const b = base(piece.name)
  const s = Math.max(Math.abs(piece.scale[0]), Math.abs(piece.scale[2]))
  if (b.startsWith('ground')) return isSphereGround(piece.name) ? 8 * s : 12 * s
  if (b === 'chocolate') return 6.7 * s // barra 6×12, pode estar rotacionada
  if (b.startsWith('obstacle_13') || b.startsWith('obstacle_14')) return 8 * s
  if (b.startsWith('chocolate_bridge')) return 5.8 * s
  if (b === 'waffle' || b.startsWith('obstacle_19')) return 4.3 * s
  if (b.startsWith('cup_platform')) return 3.6 * s
  if (b === 'cookie') return 1.8 * s
  if (b.startsWith('cookie_star')) return 2.9 * s
  if (b.startsWith('chocolate_plate')) return 1.3 * s
  return 2 * s
}

/** Y da SUPERFÍCIE andável (topo) da peça — pivô + altura medida do modelo. */
function chocolateTopOf(piece) {
  const b = base(piece.name)
  const st = stem(piece.name).toLowerCase()
  const sy = Math.abs(piece.scale[1])
  const y = piece.pos[1]
  if (b.startsWith('ground')) {
    if (isSphereGround(piece.name)) return y + 10.04 * sy // esfera: pivô no centro, coroa no topo
    if (['ground_001', 'ground_010', 'ground_012'].some((g) => st.startsWith(g))) return y + 2.8 * sy
    return y + 2.28 * sy
  }
  if (b === 'chocolate' || b.startsWith('obstacle_13') || b.startsWith('obstacle_14')) return y + 0.72 * sy
  if (b.startsWith('chocolate_bridge')) return y + 2.92 * sy
  if (b === 'waffle' || b.startsWith('obstacle_19')) return y + 1.19 * sy
  if (b.startsWith('cup_platform')) return y + 2.89 * sy
  if (b === 'cookie') return y + 0.72 * sy
  if (b.startsWith('chocolate_plate')) return y + 0.49 * sy
  return y + 0.5 * sy
}

/** `ground_003_031..ground_008` são ESFERAS (⌀20, pivô no centro) — colinas de
 * fundo, não pista: ficam fora da cobertura de corte e do cálculo de altura. */
function isSphereGround(name) {
  const st = stem(name).toLowerCase()
  return ['ground_003', 'ground_004', 'ground_005', 'ground_006', 'ground_007', 'ground_008'].some((g) => st.startsWith(g))
}

// ── Vocabulário → categoria (por mundo) ──────────────────────────────────────

function stem(name) {
  return name.replace(/\.\d+$/, '')
}
function base(name) {
  return stem(name).replace(/_\d+$/, '').toLowerCase()
}

function categorizeDeathrun(name) {
  const b = base(name)
  const s = stem(name).toLowerCase()
  if (b.startsWith('checkpoint_tree')) return 'decor'
  if (b.startsWith('checkpoint')) return 'checkpoint'
  if (b.startsWith('finish')) return 'finish'
  if (b === 'coin') return 'coin'
  if (s === 'obstacle_001') return 'spinner' // martelo giratório do kit Deathrun
  if (b.startsWith('waves')) return 'decor' // onda no mar (a skill classificava como hazard — anexaria Perigo em enfeite)
  if (b.startsWith('obstacle') || ['bomb', 'box_tnt', 'dynamite', 'anvil'].some((h) => b.startsWith(h))) return 'hazard'
  if (b.startsWith('trampoline')) return 'trampoline'
  if (['grass', 'land', 'landscape'].some((t) => b.startsWith(t))) return 'ground'
  if (['fence', 'stake', 'rope', 'barrier'].some((t) => b.startsWith(t))) return 'borda'
  if (['bridge', 'ladder', 'big_log', 'log'].some((t) => b.startsWith(t))) return 'traversal'
  if (['flag', 'indicator', 'signboard', 'scroll', 'shadow', 'leaderboard'].some((t) => b.startsWith(t))) return 'marker'
  if (['rock', 'stone'].some((t) => b.startsWith(t))) return 'decor'
  return 'decor'
}

function categorizeChocolate(name) {
  const b = base(name)
  const s = stem(name).toLowerCase()
  if (b.startsWith('checkpoint')) return 'checkpoint'
  if (b.startsWith('finish')) return 'finish'
  if (b === 'coin') return 'coin'
  if (b === 'star' || b === 'key' || b === 'ring') return 'coin' // colecionável genérico → moeda
  if (b === 'drone_propeller') return 'skip' // o drone_001.glb já tem hélice própria
  if (b === 'drone_sign') return 'decor'
  if (b === 'drone') return 'drone'
  if (b === 'cannon') return 'cannon'
  if (s.startsWith('obstacle_20')) return 'pendulo'
  if (s.startsWith('obstacle_10')) return 'spinner4'
  if (s.startsWith('obstacle_11') || s.startsWith('obstacle_12')) return 'spinner2'
  if (['bomb', 'chocolate_bomb', 'dynamite'].some((h) => b.startsWith(h))) return 'hazard'
  if (b.startsWith('obstacle')) return 'hazard'
  if (b === 'trampoline') return 'trampoline'
  // Pista comestível: o ÚNICO chão de verdade (feedback do playtest: as poças
  // rosa são líquido, não piso — o player tem que andar nas plataformas).
  if (['chocolate_plate', 'chocolate_bridge', 'cup_platform', 'waffle', 'cookie_star'].some((t) => b.startsWith(t))) return 'pista'
  if (b === 'chocolate' || b === 'cookie') return 'pista'
  // Lajes rosa = POÇAS de calda: cenário líquido (script Liquido no compositor
  // afunda o player). Esferas = colinas-bombom de fundo, decoração.
  if (b.startsWith('ground')) return isSphereGround(name) ? 'decor' : 'liquido'
  if (['chocolate_water', 'sweet_water'].some((t) => b === t)) return 'skip' // vira o nó water do compositor
  return 'decor'
}

// ── Resolução de asset (kit → cópia on-demand da fonte) ──────────────────────

const kitCache = new Map()
function kitFiles(dir) {
  if (!kitCache.has(dir)) kitCache.set(dir, new Set(readdirSync(dir).filter((f) => f.endsWith('.glb'))))
  return kitCache.get(dir)
}

const copied = []
const missing = new Set()
function resolveAsset(world, assetStem) {
  const kit = kitFiles(world.kitDir)
  // Candidatos, em ordem: nome exato → canônico _001 (duplicata do Blender:
  // `obstacle_5_007` é instância; o ARQUIVO é `obstacle_5_001.glb` — gotcha do
  // porter da skill) → prefixo (ex.: ground_003 → ground_003_031.glb).
  const canonical = assetStem.replace(/_(\d{3})$/, '_001')
  for (const cand of [assetStem, canonical]) {
    const name = `${cand}.glb`
    if (kit.has(name)) return name
    const source = join(world.sourceDir, name)
    if (existsSync(source)) {
      copyFileSync(source, join(world.kitDir, name))
      kit.add(name)
      copied.push(`${world.id}/${name}`)
      return name
    }
  }
  const byPrefix = [...kit].find((f) => f.startsWith(assetStem))
  if (byPrefix) return byPrefix
  const sourceByPrefix = readdirSync(world.sourceDir).find((f) => f.startsWith(assetStem) && f.endsWith('.glb'))
  if (sourceByPrefix) {
    copyFileSync(join(world.sourceDir, sourceByPrefix), join(world.kitDir, sourceByPrefix))
    kit.add(sourceByPrefix)
    copied.push(`${world.id}/${sourceByPrefix}`)
    return sourceByPrefix
  }
  missing.add(`${world.id}/${assetStem}`)
  return null
}

// ── Fatiamento ────────────────────────────────────────────────────────────────

/** Projeta a peça no espaço do PERCURSO: u = progressão (+), v = lateral, y = altura. */
function project(world, pos) {
  const u = world.axis === 'x' ? pos[0] * world.direction : pos[2] * world.direction
  const v = world.axis === 'x' ? pos[2] : pos[0]
  return { u, v, y: pos[1] }
}

/** Rotação Y extra (rad) pra levar o eixo do demo até +X do engine. */
function extraRotY(world) {
  if (world.axis === 'x') return world.direction > 0 ? 0 : Math.PI
  // eixo z: -Z → +X é rotY(-90°); +Z → +X é rotY(+90°)
  return world.direction < 0 ? -Math.PI / 2 : Math.PI / 2
}

function sliceWorld(world) {
  const demo = JSON.parse(readFileSync(world.demo, 'utf8'))
  const outDir = join(ROOT, 'assets/chunks', world.id)
  mkdirSync(outDir, { recursive: true })

  const catalog = []
  for (let laneIdx = 0; laneIdx < world.lanes.length; laneIdx++) {
    const lane = world.lanes[laneIdx]
    // Peças da faixa, já no espaço do percurso.
    const pieces = []
    for (const p of demo.pieces) {
      const cat = world.categorize(p.name)
      if (cat === 'skip') continue
      const pr = project(world, p.pos)
      if (Math.abs(pr.v - lane.c) > lane.half) continue
      pieces.push({ ...p, cat, u: pr.u, v: pr.v - lane.c })
    }
    if (pieces.length < 30) continue

    // PISTA da faixa: peças andáveis. No mundo surface-aware, esferas de fundo
    // ficam de fora (são colina/decoração, não chão).
    const walkable = pieces.filter(
      (p) => world.isTrack(p.cat) && !(world.surfaceAware && isSphereGround(p.name)),
    )

    let cuts, u0, u1
    if (world.surfaceAware) {
      // O terreno é um TAPETE contínuo de lajes e os MIOLOS se sobrepõem no
      // percurso inteiro (medido no perfil de cobertura) — nenhum plano de
      // corte é "limpo". Então o corte vai no VALE: o ponto perto do alvo de
      // ~35 m onde a soma de penetração nos miolos é MÍNIMA (a fronteira mais
      // rasa entre lajes). A borda que sobra é absorvida pelas margens
      // headR/tailR + o conector do compositor. Cortar no meio de uma laje
      // (pivô-cego) era o que órfãnava metade do terreno.
      const us = walkable.map((p) => p.u)
      u0 = Math.min(...us)
      u1 = Math.max(...us)
      const coreCost = (x) =>
        walkable.reduce((sum, p) => {
          const core = world.footprint(p) * 0.7
          return sum + Math.max(0, core - Math.abs(p.u - x))
        }, 0)
      cuts = []
      let last = u0
      while (last + TARGET_LEN + MIN_LEN < u1) {
        let cut = last + TARGET_LEN, best = Infinity
        for (let x = last + TARGET_LEN - 10; x <= last + TARGET_LEN + 25; x += 0.5) {
          if (x <= last + MIN_LEN || x >= u1 - MIN_LEN / 2) continue
          const c = coreCost(x)
          if (c < best) { best = c; cut = x }
        }
        cuts.push(cut)
        last = cut
      }
    } else {
      // Deathrun: vãos entre pivôs (>4.5 m) OU ponto mais magro perto do alvo
      // de ~35 m quando o chão é contínuo (funcionou no playtest — não mexer).
      const trackUs = walkable.map((p) => p.u).sort((a, b) => a - b)
      u0 = trackUs[0]
      u1 = trackUs[trackUs.length - 1]
      cuts = []
      let last = u0
      for (let i = 1; i < trackUs.length; i++) {
        const gap = trackUs[i] - trackUs[i - 1]
        const mid = (trackUs[i] + trackUs[i - 1]) / 2
        if (gap > 4.5 && mid - last >= MIN_LEN) {
          cuts.push(mid)
          last = mid
        } else if (mid - last >= TARGET_LEN + 8) {
          let best = last + TARGET_LEN, fewest = Infinity
          for (let cand = last + TARGET_LEN - 6; cand <= last + TARGET_LEN + 6; cand += 1) {
            const n = pieces.filter((p) => Math.abs(p.u - cand) < 1.5 && !world.isTrack(p.cat)).length
            if (n < fewest) { fewest = n; best = cand }
          }
          cuts.push(best)
          last = best
        }
      }
    }

    const bounds = [u0 - 1, ...cuts, u1 + 1]
    for (let t = 0; t < bounds.length - 1; t++) {
      const [a, b] = [bounds[t], bounds[t + 1]]
      const inChunk = pieces.filter((p) => p.u >= a && p.u < b)
      const trackPieces = inChunk.filter(
        (p) => world.isTrack(p.cat) && !(world.surfaceAware && isSphereGround(p.name)),
      )
      // Fragmento (pontinha de ponte, ilha de 4 peças) não vira peça do catálogo.
      if (trackPieces.length < 4 || inChunk.length < 12 || b - a < MIN_LEN * 0.6) continue

      // Normaliza: entrada da pista em x=0; y mantém o absoluto do demo (o
      // compositor desloca o trecho inteiro pra casar saída→entrada).
      // ALTURA de encaixe = TOPO ANDÁVEL da peça mais próxima da borda (não a
      // média dos pivôs: o pivô da laje de terreno fica na BASE, 2.8 m abaixo
      // de onde o player pisa — era o desnível que quebrava as emendas).
      const startU = Math.min(...trackPieces.map((p) => p.u))
      const endU = Math.max(...trackPieces.map((p) => p.u))
      let entryY, exitY
      if (world.surfaceAware) {
        entryY = edgeSurfaceY(world, trackPieces, startU)
        exitY = edgeSurfaceY(world, trackPieces, endU)
      } else {
        entryY = avgY(trackPieces, startU, startU + 6)
        exitY = avgY(trackPieces, endU - 6, endU)
      }
      // LATERAL: o percurso serpenteia (v ±25) — a ENTRADA da pista é
      // normalizada em v=0 e o desvio da SAÍDA vai pro catálogo; o compositor
      // acumula (senão o conector fica em z=0 e a pista sai 20 m pro lado).
      const entryV = edgeMeanV(trackPieces, startU)
      const exitV = edgeMeanV(trackPieces, endU)
      // RUMO da pista na saída (graus; + = virando pra +z): o arco do
      // checkpoint do conector cruza a TRILHA local, não o eixo global — arco
      // perpendicular a +X numa trilha diagonal lê como torto (4º playtest).
      const vBefore = edgeMeanV(trackPieces, Math.max(startU, endU - 7))
      const exitHeadingDeg = round((Math.atan2(exitV - vBefore, Math.min(7, endU - startU)) * 180) / Math.PI, 1)
      const rotOffset = extraRotY(world)

      const nodes = inChunk
        .map((p) => {
          const file = resolveAsset(world, stem(p.name))
          if (!file) return null
          let rot = [p.rot[0], round(p.rot[1] + rotOffset, 4), p.rot[2]]

          // ── Regras de SANIDADE (lint na origem; ver tools/lint_chunks.mjs) ──
          // R1: peça de GAMEPLAY é eixo-alinhada (critério 5 da skill): zera o
          // TOMBAMENTO preservando o yaw efetivo da matriz. Checkpoint/finish/
          // trampolim travam no múltiplo de 90° (portal cruza a pista); canhão
          // mira onde o artista mirou (yaw livre — o arco é do script).
          if (GAMEPLAY_CATS.has(p.cat)) {
            const yaw = yawOf(rot)
            const alvo = p.cat === 'cannon' ? yaw : (Math.round(yaw / (Math.PI / 2)) * Math.PI) / 2
            if (tiltOf(rot) > 0.05 || Math.abs(rot[0]) > 0.05 || Math.abs(rot[2]) > 0.05 || Math.abs(rot[1] - alvo) > 0.05) {
              normalized.push(`${world.id}: ${p.name} (${p.cat})`)
            }
            rot = [0, round(alvo, 4), 0]
          }
          // R2: moldura TOMBADA de verdade (tombamento pela MATRIZ — Euler
          // equivalente com flip não conta): destroço decorativo do demo que,
          // fora do contexto original, lê como bug. Fica de fora.
          if (p.cat === 'borda' && tiltOf(rot) > TILT_MAX) {
            dropped.push(`${world.id}: ${p.name} tombada ${(tiltOf(rot) * 57.3).toFixed(0)}°`)
            return null
          }
          // R5: nada FORA do vão da pista — peça pendurada além da primeira/
          // última peça de pista se apoiava no vizinho que o corte levou
          // (tronco flutuando, cerca no meio do conector — 4º playtest). O
          // espaço entre trechos pertence ao conector do compositor. Ponte
          // (traversal/moldura) na ZONA DE EMENDA (1.5 m da borda) idem: ela
          // atravessava o corte por natureza e fica sem a outra ponta.
          const SEAM = 1.5
          const bridging = (p.cat === 'traversal' || p.cat === 'borda') &&
        (p.u < startU + SEAM || p.u > endU - SEAM)
          if (p.u < startU - 0.3 || p.u > endU + 0.3 || bridging) {
            trimmed.push(`${world.id}: ${p.name} (${p.cat}) u=${round(p.u - startU, 1)}`)
            return null
          }

          return {
            file, cat: p.cat,
            // posição local: [progressão − início, altura absoluta do demo,
            // lateral com a ENTRADA da pista em 0]. O compositor desloca X/Y/Z.
            pos: [round(p.u - startU), round(p.pos[1]), round(p.v - entryV)],
            rot,
            scale: p.scale,
          }
        })
        .filter(Boolean)

      // Margens de borda: o OVERHANG real — quanto alguma peça de pista avança
      // ALÉM da borda do vão (footprint − distância até a borda). Uma ilha de
      // 13 m de raio com pivô 5 m depois do início avança 8 m pra trás. O
      // compositor reserva esse espaço; sem isso a colina engole o conector.
      let headR = 0, tailR = 0
      if (world.footprint) {
        for (const p of trackPieces) {
          const r = world.footprint(p)
          headR = Math.max(headR, r - (p.u - startU))
          tailR = Math.max(tailR, r - (endU - p.u))
        }
        headR = Math.max(0, headR)
        tailR = Math.max(0, tailR)
      }

      const id = `${world.id}-p${laneIdx + 1}t${t + 1}`
      const hazards = inChunk.filter((p) => ['hazard', 'spinner', 'spinner2', 'spinner4', 'pendulo', 'drone', 'cannon'].includes(p.cat)).length
      // Pico INTERNO da pista relativo à entrada — trecho rasteiro (peak baixo)
      // emenda em qualquer lugar; trecho de escalada (peak alto) depende de
      // canhão/escada interna calibrada.
      const peakY = world.surfaceAware
        ? round(Math.max(...trackPieces.map((p) => world.topOf(p))) - entryY)
        : 0
      // Maior VÃO interno da pista (m): com a poça sendo líquido, um vão maior
      // que o pulo (~2.8) só fecha com canhão — trecho fica marcado como
      // avançado no catálogo (não entra em fase de emenda simples).
      let maxGap = 0
      if (world.surfaceAware) {
        const spans = trackPieces
          .map((p) => { const r = world.footprint(p); return [p.u - r, p.u + r] })
          .sort((x, y) => x[0] - y[0])
        let reach = spans[0][1]
        for (const [s0, s1] of spans) {
          if (s0 > reach) maxGap = Math.max(maxGap, s0 - reach)
          reach = Math.max(reach, s1)
        }
        maxGap = round(maxGap)
      }
      const chunk = {
        id, world: world.id, kit: world.kitUrl,
        length: round(endU - startU),
        headR: round(headR), tailR: round(tailR),
        entryY: round(entryY), exitY: round(exitY),
        exitV: round(exitV - entryV),
        exitHeadingDeg,
        peakY, maxGap,
        difficulty: hazards,
        pieces: nodes,
      }
      writeFileSync(join(outDir, `${id}.json`), JSON.stringify(chunk))
      catalog.push({
        id, length: chunk.length, entryY: chunk.entryY, exitY: chunk.exitY,
        exitV: chunk.exitV, exitHeadingDeg, peakY, maxGap,
        difficulty: hazards, pieces: nodes.length,
      })
    }
  }
  writeFileSync(join(outDir, 'catalog.json'), JSON.stringify({ world: world.id, chunks: catalog }, null, 1))
  console.log(`\n${world.id}: ${catalog.length} trechos`)
  for (const c of catalog) {
    console.log(`  ${c.id.padEnd(20)} ${String(c.length).padStart(4)}m  y ${c.entryY}→${c.exitY}  peak +${c.peakY}  vão ${c.maxGap}  hazards ${String(c.difficulty).padStart(3)}  ${c.pieces} peças`)
  }
}

function avgY(pieces, ua, ub) {
  const ys = pieces.filter((p) => p.u >= ua && p.u <= ub).map((p) => p.pos[1])
  return ys.length ? ys.reduce((s, y) => s + y, 0) / ys.length : 0
}

/** Lateral (v) média das peças de pista na janela da borda. */
function edgeMeanV(trackPieces, edgeU) {
  const dMin = Math.min(...trackPieces.map((p) => Math.abs(p.u - edgeU)))
  const win = Math.max(6, dMin + 2)
  const vs = trackPieces.filter((p) => Math.abs(p.u - edgeU) <= win).map((p) => p.v)
  return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : 0
}

/** Topo andável na BORDA do trecho: o nível do CHÃO perto de `edgeU` — o topo
 * mais BAIXO entre as peças de pista da janela da borda. Pegar a peça mais
 * próxima cegamente escolhia plataforma AÉREA quando ela calhava de estar na
 * borda, e o compositor alinhava o trecho pelo alto (terreno afundava 12 m+). */
function edgeSurfaceY(world, trackPieces, edgeU) {
  const dMin = Math.min(...trackPieces.map((p) => Math.abs(p.u - edgeU)))
  const window = Math.max(6, dMin + 2)
  let ground = Infinity
  for (const p of trackPieces) {
    if (Math.abs(p.u - edgeU) > window) continue
    ground = Math.min(ground, world.topOf(p))
  }
  return ground === Infinity ? 0 : ground
}
function round(v, d = 3) {
  return +v.toFixed(d)
}

for (const world of WORLDS) sliceWorld(world)
if (copied.length) console.log(`\nGLBs copiados da fonte (${copied.length}):`, copied.join(', '))
if (missing.size) console.log(`\nSEM ARQUIVO (peças puladas):`, [...missing].join(', '))
if (normalized.length) console.log(`\nR1 — gameplay re-alinhado (${normalized.length}):`, normalized.slice(0, 10).join(' | '))
if (dropped.length) console.log(`\nR2 — moldura tombada removida (${dropped.length}):`, dropped.slice(0, 10).join(' | '))
if (trimmed.length) console.log(`\nR5 — fora do vão da pista (${trimmed.length}):`, trimmed.slice(0, 10).join(' | '))
