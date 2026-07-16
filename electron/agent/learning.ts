import { createHash } from 'crypto'
import { join } from 'path'
import { existsSync } from 'fs'
import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { parseSceneDefinition, type SceneDefinition, type SceneNode } from '../../src/scene/SceneDefinition.js'
import { parseKit, kitAssetFor, type KitManifest } from '../../src/scene/Kit.js'
import type { SceneFileV1 } from '../../src/scene/SceneFile.js'
import { validateScene, type ValidateSceneOptions } from '../../src/scene/validateScene.js'

/**
 * **Loop de aprendizado por correções do dev** (núcleo determinístico).
 *
 * Ciclo: a IA termina uma cena → `saveBaseline` grava o estado efetivo
 * (cena resolvida: nós + overlay) em `.cortex/baselines/<fase>.json`. O dev
 * corrige no editor (tudo cai no overlay, chaveado por id). Depois,
 * `diffCorrections` compara estado atual vs baseline e produz um **diff
 * SEMÂNTICO compacto** (agrupado por role e tipo de mudança) — é isso que vai
 * pro contexto do agente, nunca o overlay cru (orçamento de contexto). Ao
 * aprender (ou o dev dispensar), o baseline é ATUALIZADO pro estado atual —
 * o próximo diff mede só a intervenção humana desde então.
 *
 * `detectPendingCorrections` é a checagem BARATA de abertura de sessão (hash
 * do overlay vs hash gravado no baseline) — permite ao Chat IA perguntar
 * "quer que eu aprenda com seus ajustes?" sem carregar nada pesado.
 */

export interface EffectiveNode {
  /** Posição efetiva (overlay > transform > place). `null` = attach (estrutural). */
  p: [number, number, number] | null
  rotY: number
  s: [number, number, number]
  type: string
  /** URL do modelo (permite RECONSTRUIR o nó pra replay de validação — ADR-0115). */
  url?: string
  role?: string
  physics: string
  /** JSON canônico do collider efetivo (comparável). */
  collider?: string
}

export interface Baseline {
  version: 1
  savedAt: string
  overlay: string
  overlayHash: string
  scenes: string[]
  nodes: Record<string, EffectiveNode>
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

async function loadKits(projectRoot: string): Promise<KitManifest[]> {
  const kits: KitManifest[] = []
  const assetsDir = join(projectRoot, 'assets')
  if (!existsSync(assetsDir)) return kits
  for (const e of await readdir(assetsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const kit = parseKit(await readJson(join(assetsDir, e.name, 'kit.json')))
    if (kit) kits.push(kit)
  }
  return kits
}

async function sceneFiles(projectRoot: string): Promise<string[]> {
  const dir = join(projectRoot, 'scenes')
  if (!existsSync(dir)) return []
  return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => `scenes/${f}`)
}

/** Estado efetivo da cena (nós dos scenes/*.json + overlay resolvido por id). */
export async function effectiveState(
  projectRoot: string,
  overlayRel: string,
): Promise<{ nodes: Record<string, EffectiveNode>; overlayHash: string; scenes: string[] }> {
  const scenes = await sceneFiles(projectRoot)
  const kits = await loadKits(projectRoot)
  const overlayPath = join(projectRoot, overlayRel)
  const overlayRaw = existsSync(overlayPath) ? await readFile(overlayPath, 'utf-8') : ''
  const overlay = overlayRaw ? (JSON.parse(overlayRaw) as SceneFileV1) : null
  const overlayHash = createHash('sha1').update(overlayRaw).digest('hex')

  const nodes: SceneNode[] = []
  for (const rel of scenes) {
    const def = parseSceneDefinition(await readJson(join(projectRoot, rel)))
    if (def) nodes.push(...def.nodes)
  }
  const added = Array.isArray(overlay?.data?.['added']) ? (overlay!.data['added'] as SceneNode[]) : []
  const deleted = new Set<string>(
    Array.isArray(overlay?.data?.['deleted']) ? (overlay!.data['deleted'] as string[]) : [],
  )
  const physics = (overlay?.data?.['physics'] ?? {}) as Record<string, { type?: string }>
  const colliders = (overlay?.data?.['colliders'] ?? {}) as Record<string, unknown>
  const overrides = overlay?.objects ?? {}

  const out: Record<string, EffectiveNode> = {}
  for (const node of [...nodes, ...added]) {
    if (deleted.has(node.id) || out[node.id]) continue
    const n = node as SceneNode & {
      transform?: { position?: number[]; rotation?: number[]; scale?: number | number[] }
      place?: { x?: number; y?: number; z?: number; rotY?: number; scale?: number }
      attach?: object
      collider?: object
      character?: object
      rapierBody?: object
      url?: string
    }
    const ov = overrides[node.id]
    let p: [number, number, number] | null
    let rotY: number
    let s: [number, number, number]
    if (ov) {
      p = [r3(ov.position[0]!), r3(ov.position[1]!), r3(ov.position[2]!)]
      rotY = r3(ov.rotation[1]!)
      s = [r3(ov.scale[0]!), r3(ov.scale[1]!), r3(ov.scale[2]!)]
    } else if (n.attach) {
      p = null // estrutural (socket) — mudança viria como override do editor
      rotY = 0
      s = [1, 1, 1]
    } else {
      const t = n.transform
      const pl = n.place
      const pos = t?.position ?? (pl ? [pl.x ?? 0, pl.y ?? 0, pl.z ?? 0] : [0, 0, 0])
      p = [r3(pos[0]!), r3(pos[1]!), r3(pos[2]!)]
      rotY = r3(t?.rotation?.[1] ?? pl?.rotY ?? 0)
      const sc = t?.scale ?? pl?.scale ?? 1
      s = typeof sc === 'number' ? [sc, sc, sc] : [r3(sc[0]!), r3(sc[1]!), r3(sc[2]!)]
    }
    const physType =
      physics[node.id]?.type ??
      (n.character ? 'character' : n.rapierBody ? 'rigid' : n.collider ? 'static' : 'none')
    const collider = colliders[node.id] ?? n.collider
    const role = n.url ? kitAssetFor(kits, n.url)?.role : undefined
    out[node.id] = {
      p,
      rotY,
      s,
      type: node.type,
      ...(n.url ? { url: n.url } : {}),
      ...(role ? { role } : {}),
      physics: physType,
      ...(collider ? { collider: JSON.stringify(collider) } : {}),
    }
  }
  return { nodes: out, overlayHash, scenes }
}

const baselinePath = (projectRoot: string, fase: string): string =>
  join(projectRoot, '.cortex', 'baselines', `${fase.replace(/[^\w.-]/g, '_')}.json`)

/** Grava (ou re-grava) o baseline da fase = estado efetivo atual. */
export async function saveBaseline(projectRoot: string, fase: string, overlayRel: string): Promise<Baseline> {
  const state = await effectiveState(projectRoot, overlayRel)
  const baseline: Baseline = {
    version: 1,
    savedAt: new Date().toISOString(),
    overlay: overlayRel,
    overlayHash: state.overlayHash,
    scenes: state.scenes,
    nodes: state.nodes,
  }
  const p = baselinePath(projectRoot, fase)
  await mkdir(join(projectRoot, '.cortex', 'baselines'), { recursive: true })
  await writeFile(p, JSON.stringify(baseline, null, 2))
  return baseline
}

export interface NodeChange {
  id: string
  role?: string
  kind: 'moved' | 'rotated' | 'scaled' | 'physics' | 'collider' | 'added' | 'deleted'
  detail: string
  /** Magnitude (distância movida, Δgraus…), pra agregação. */
  value?: number
  delta?: [number, number, number]
}

export interface CorrectionsDiff {
  fase: string
  baselineSavedAt: string
  changes: NodeChange[]
  /** Resumo semântico agrupado (por role × tipo de mudança) — o que vai pro contexto. */
  summary: string
}

const dist = (a: [number, number, number], b: [number, number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Diff semântico: estado atual vs baseline da fase. Determinístico, sem LLM. */
export async function diffCorrections(
  projectRoot: string,
  fase: string,
  overlayRel: string,
): Promise<CorrectionsDiff | null> {
  const baseline = await readJson<Baseline>(baselinePath(projectRoot, fase))
  if (!baseline) return null
  const current = await effectiveState(projectRoot, overlayRel)
  const changes: NodeChange[] = []

  for (const [id, cur] of Object.entries(current.nodes)) {
    const base = baseline.nodes[id]
    if (!base) {
      changes.push({ id, role: cur.role, kind: 'added', detail: `adicionado (${cur.role ?? cur.type})` })
      continue
    }
    if (base.p && cur.p) {
      const d = dist(base.p, cur.p)
      if (d > 0.05) {
        const delta: [number, number, number] = [r3(cur.p[0] - base.p[0]), r3(cur.p[1] - base.p[1]), r3(cur.p[2] - base.p[2])]
        changes.push({ id, role: cur.role, kind: 'moved', value: r3(d), delta, detail: `movido ${d.toFixed(2)}u (Δ ${delta.join(', ')})` })
      }
    }
    const dRot = Math.abs(cur.rotY - base.rotY)
    if (dRot > 0.02) {
      changes.push({ id, role: cur.role, kind: 'rotated', value: r3((dRot * 180) / Math.PI), detail: `rotY Δ${((dRot * 180) / Math.PI).toFixed(0)}°` })
    }
    if (Math.abs(cur.s[0] - base.s[0]) > 0.01 || Math.abs(cur.s[1] - base.s[1]) > 0.01 || Math.abs(cur.s[2] - base.s[2]) > 0.01) {
      changes.push({ id, role: cur.role, kind: 'scaled', detail: `escala ${base.s.join('×')} → ${cur.s.join('×')}` })
    }
    if (cur.physics !== base.physics) {
      changes.push({ id, role: cur.role, kind: 'physics', detail: `física ${base.physics} → ${cur.physics}` })
    }
    if ((cur.collider ?? '') !== (base.collider ?? '')) {
      changes.push({ id, role: cur.role, kind: 'collider', detail: 'collider ajustado' })
    }
  }
  for (const id of Object.keys(baseline.nodes)) {
    if (!current.nodes[id]) {
      changes.push({ id, role: baseline.nodes[id]!.role, kind: 'deleted', detail: `removido (${baseline.nodes[id]!.role ?? baseline.nodes[id]!.type})` })
    }
  }

  return { fase, baselineSavedAt: baseline.savedAt, changes, summary: summarize(changes) }
}

/** Agrega as mudanças por role × tipo — o texto compacto que entra no contexto. */
function summarize(changes: NodeChange[]): string {
  if (changes.length === 0) return 'Nenhuma correção do dev desde o último baseline.'
  const groups = new Map<string, NodeChange[]>()
  for (const c of changes) {
    const key = `${c.role ?? 'sem-role'}|${c.kind}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  const lines: string[] = [`${changes.length} correção(ões) do dev:`]
  for (const [key, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const [role, kind] = key.split('|')
    let line = `- ${role}: ${list.length}× ${kind}`
    if (kind === 'moved') {
      const avg = list.reduce((s, c) => s + (c.value ?? 0), 0) / list.length
      const axes: [number, number, number] = [0, 0, 0]
      for (const c of list) {
        if (c.delta) {
          axes[0] += c.delta[0]
          axes[1] += c.delta[1]
          axes[2] += c.delta[2]
        }
      }
      const dom = ['X', 'Y', 'Z'][axes.map(Math.abs).indexOf(Math.max(...axes.map(Math.abs)))]
      line += ` (média ${avg.toFixed(2)}u, tendência ${dom}${(axes[['X', 'Y', 'Z'].indexOf(dom!)] ?? 0) >= 0 ? '+' : '−'})`
    }
    if (kind === 'rotated') {
      const avg = list.reduce((s, c) => s + (c.value ?? 0), 0) / list.length
      line += ` (média Δ${avg.toFixed(0)}°)`
    }
    const ex = list.slice(0, 3).map((c) => c.id).join(', ')
    line += ` — ex.: ${ex}`
    lines.push(line)
  }
  return lines.join('\n')
}

/**
 * **Overlay sintético que reproduz o estado do BASELINE** sobre os scenes/*.json
 * atuais — o "replay" da cena como ela era ANTES das correções do dev, sem
 * precisar guardar a cena inteira. Usado pela checagem de regressão de regra
 * aprendida (ADR-0115): a regra nova tem que REPROVAR este estado e APROVAR o
 * corrigido. Nós irreconstruíveis (attach estrutural, model sem url em baseline
 * antigo) vão em `unreconstructed` — cobertura honesta, nunca silenciosa.
 */
export function baselineOverlay(
  baseline: Baseline,
  sceneNodeIds: Set<string>,
): { overlay: SceneFileV1; unreconstructed: string[] } {
  const objects: NonNullable<SceneFileV1['objects']> = {}
  const physics: Record<string, { type: string }> = {}
  const colliders: Record<string, unknown> = {}
  const added: SceneNode[] = []
  const unreconstructed: string[] = []

  for (const [id, n] of Object.entries(baseline.nodes)) {
    physics[id] = { type: n.physics }
    if (n.collider) colliders[id] = JSON.parse(n.collider)
    if (sceneNodeIds.has(id)) {
      // Nó ainda existe no scene JSON: a pose do baseline vira override.
      if (n.p) objects[id] = { position: [...n.p], rotation: [0, n.rotY, 0], scale: [...n.s] }
      // p === null (attach): pose estrutural — o próprio scene JSON resolve.
    } else if (n.p && n.type === 'model' && n.url) {
      // Nó que o dev DELETOU: re-adiciona reconstruído a partir do baseline.
      added.push({
        type: 'model',
        id,
        url: n.url,
        transform: { position: [...n.p], rotation: [0, n.rotY, 0], scale: [...n.s] },
        ...(n.collider ? { collider: JSON.parse(n.collider) } : {}),
      } as unknown as SceneNode)
    } else {
      unreconstructed.push(id)
    }
  }
  // Nós que NÃO existiam no baseline (dev/agente adicionou depois): fora do replay.
  const deleted = [...sceneNodeIds].filter((id) => !baseline.nodes[id])
  return {
    overlay: { version: 1, objects, data: { added, deleted, physics, colliders } } as SceneFileV1,
    unreconstructed,
  }
}

export interface RuleCheck {
  /** Violações por regra no estado ANTIGO (baseline reconstruído). */
  before: Record<string, number>
  /** Violações por regra no estado ATUAL (com as correções do dev). */
  after: Record<string, number>
  /** Nós do baseline fora do replay (attach, model sem url) — cobertura honesta. */
  unreconstructed: string[]
}

/**
 * **Checagem de regressão de regra aprendida**: valida a cena DUAS vezes com a
 * regra candidata — no estado do baseline (antes das correções) e no atual
 * (corrigido). Uma regra só "captura" a correção se reprova o antes e aprova o
 * depois; senão é gosto pontual, não princípio — vira texto, não código.
 */
export async function checkRuleAgainstBaseline(
  projectRoot: string,
  fase: string,
  overlayRel: string,
  ruleOptions: Pick<ValidateSceneOptions, 'maxGap' | 'maxRise' | 'maxPenetration' | 'severity'>,
): Promise<RuleCheck | null> {
  const baseline = await readJson<Baseline>(baselinePath(projectRoot, fase))
  if (!baseline) return null
  const kits = await loadKits(projectRoot)
  const defs: SceneDefinition[] = []
  for (const rel of await sceneFiles(projectRoot)) {
    const def = parseSceneDefinition(await readJson(join(projectRoot, rel)))
    if (def) defs.push(def)
  }
  const sceneIds = new Set(defs.flatMap((d) => d.nodes.map((n) => n.id)))
  const { overlay: oldOverlay, unreconstructed } = baselineOverlay(baseline, sceneIds)
  const overlayPath = join(projectRoot, overlayRel)
  const currentRaw = existsSync(overlayPath) ? await readFile(overlayPath, 'utf-8') : ''
  const currentOv = currentRaw ? (JSON.parse(currentRaw) as SceneFileV1) : null

  const countByRule = (overlay: SceneFileV1 | null): Record<string, number> => {
    const r = validateScene(defs, { kit: kits, overlay, ...ruleOptions })
    const acc: Record<string, number> = {}
    for (const v of [...r.errors, ...r.warnings]) acc[v.rule] = (acc[v.rule] ?? 0) + 1
    return acc
  }
  return { before: countByRule(oldOverlay), after: countByRule(currentOv), unreconstructed }
}

/**
 * Checagem barata de abertura de sessão: existe baseline cujo overlay mudou?
 * Retorna a lista de fases com correções pendentes (hash difere), sem diff.
 */
export async function detectPendingCorrections(projectRoot: string): Promise<string[]> {
  const dir = join(projectRoot, '.cortex', 'baselines')
  if (!existsSync(dir)) return []
  const pending: string[] = []
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue
    const baseline = await readJson<Baseline>(join(dir, f))
    if (!baseline) continue
    const overlayPath = join(projectRoot, baseline.overlay)
    const raw = existsSync(overlayPath) ? await readFile(overlayPath, 'utf-8') : ''
    const hash = createHash('sha1').update(raw).digest('hex')
    if (hash !== baseline.overlayHash) pending.push(f.replace(/\.json$/, ''))
  }
  return pending
}
