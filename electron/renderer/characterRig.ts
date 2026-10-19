/**
 * Lógica pura do painel **character-auto-rig** (SPEC-0349): marcadores do corpo,
 * conversão entre o espaço do GLB (`gltf.scene`) e o espaço exibido no painel,
 * simetria, estimativa inicial, validação e (de)serialização do
 * `tools/characters/<CODE>.markers.json` (contrato da SPEC-0187 do DDD 61).
 *
 * Sem DOM e sem three.js — testado em `tests/electron/characterRig.test.ts`.
 *
 * **Espaço exibido:** `d = Ry(rotateYDeg) · p − offset`, com `offset = (cx, 0, cz)`
 * (centro da caixa do modelo já girado, no plano XZ). O `rotateYDeg` é o
 * `transform.rotateZDeg` da config, com o MESMO sinal: o Blender importa o glTF
 * com `(x, y, z)_blender = (x, −z, y)_gltf`, e `Rz(θ)` do Blender escrito no glTF
 * é `Ry(θ)`. De frente para a câmera (+Z), o lado `L` do personagem fica em x > 0.
 */

export type Vec3 = [number, number, number]

export type MarkerId = 'chin' | 'groin' | 'wristL' | 'wristR' | 'elbowL' | 'elbowR' | 'kneeL' | 'kneeR'

/** Ordem dos marcadores no arquivo (a mesma do contrato da SPEC-0187). */
export const MARKER_IDS: readonly MarkerId[] = ['chin', 'groin', 'wristL', 'wristR', 'elbowL', 'elbowR', 'kneeL', 'kneeR']

export type MarkerGroupKey = 'chin' | 'wrists' | 'elbows' | 'knees' | 'groin'

export interface MarkerGroup {
  key: MarkerGroupKey
  color: string
  /** Pares: `[R, L]` — R à esquerda da tela, L à direita (personagem de frente). */
  ids: readonly MarkerId[]
}

/** Grupos na ordem da coluna do painel (como o Mixamo). */
export const MARKER_GROUPS: readonly MarkerGroup[] = [
  { key: 'chin', color: '#22d3ee', ids: ['chin'] },
  { key: 'wrists', color: '#a3e635', ids: ['wristR', 'wristL'] },
  { key: 'elbows', color: '#facc15', ids: ['elbowR', 'elbowL'] },
  { key: 'knees', color: '#fb923c', ids: ['kneeR', 'kneeL'] },
  { key: 'groin', color: '#f472b6', ids: ['groin'] },
]

export function markerGroup(id: MarkerId): MarkerGroup {
  return MARKER_GROUPS.find((g) => g.ids.includes(id))!
}

export function markerColor(id: MarkerId): string {
  return markerGroup(id).color
}

/** `true` para queixo e virilha (presos em x = 0 com simetria). */
export function isCenterMarker(id: MarkerId): boolean {
  return id === 'chin' || id === 'groin'
}

/** O par do outro lado (`wristL` ↔ `wristR`), ou `null` para os do centro. */
export function mirrorId(id: MarkerId): MarkerId | null {
  if (id.endsWith('L')) return `${id.slice(0, -1)}R` as MarkerId
  if (id.endsWith('R')) return `${id.slice(0, -1)}L` as MarkerId
  return null
}

/** `'L'`, `'R'` ou `null` (centro). */
export function markerSide(id: MarkerId): 'L' | 'R' | null {
  return isCenterMarker(id) ? null : (id.slice(-1) as 'L' | 'R')
}

// ── Espaço ────────────────────────────────────────────────────────────────────

/** Ry(deg) — rotação em torno de Y, convenção do three.js (regra da mão direita). */
export function rotateY(p: Vec3, deg: number): Vec3 {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

/** Como o modelo é exibido: girado por `rotateYDeg` e deslocado por `−offset`. */
export interface DisplayFrame {
  rotateYDeg: number
  offset: Vec3
}

export function gltfToDisplay(p: Vec3, frame: DisplayFrame): Vec3 {
  const r = rotateY(p, frame.rotateYDeg)
  return [r[0] - frame.offset[0], r[1] - frame.offset[1], r[2] - frame.offset[2]]
}

export function displayToGltf(d: Vec3, frame: DisplayFrame): Vec3 {
  return rotateY([d[0] + frame.offset[0], d[1] + frame.offset[1], d[2] + frame.offset[2]], -frame.rotateYDeg)
}

/** Offset que centraliza em x = 0, z = 0 a caixa do modelo JÁ girado (altura intacta). */
export function centeringOffset(box: Box): Vec3 {
  return [(box.min[0] + box.max[0]) / 2, 0, (box.min[2] + box.max[2]) / 2]
}

// ── Marcadores ────────────────────────────────────────────────────────────────

export type MarkerSet = Partial<Record<MarkerId, Vec3>>

/**
 * Move um marcador (espaço exibido). Com simetria: centro preso em x = 0; par
 * espelhado em `x → −x` (com `mirrorPos` quando quem chama já mediu a
 * profundidade no ponto espelhado). Devolve um conjunto novo.
 */
export function moveMarker(markers: MarkerSet, id: MarkerId, pos: Vec3, symmetry: boolean, mirrorPos?: Vec3): MarkerSet {
  const out: MarkerSet = { ...markers }
  if (symmetry && isCenterMarker(id)) {
    out[id] = [0, pos[1], pos[2]]
    return out
  }
  out[id] = [pos[0], pos[1], pos[2]]
  const other = mirrorId(id)
  if (symmetry && other) out[other] = mirrorPos ? [-pos[0], pos[1], mirrorPos[2]] : [-pos[0], pos[1], pos[2]]
  return out
}

/**
 * Ao ligar a simetria: o lado `lead` manda nos pares e o centro vai para x = 0.
 * Marcador ausente continua ausente.
 */
export function symmetrize(markers: MarkerSet, lead: 'L' | 'R'): MarkerSet {
  const out: MarkerSet = { ...markers }
  for (const id of MARKER_IDS) {
    const p = markers[id]
    if (!p) continue
    if (isCenterMarker(id)) out[id] = [0, p[1], p[2]]
    else if (markerSide(id) === lead) out[mirrorId(id)!] = [-p[0], p[1], p[2]]
  }
  return out
}

export interface Box {
  min: Vec3
  max: Vec3
}

/** Acima disto (largura / altura) a pose é em T; abaixo, em A. */
const T_POSE_WIDTH_RATIO = 0.8

/**
 * Posições iniciais (espaço exibido) pela caixa do modelo exibido, em frações da
 * altura `H` e da largura `W`. z = centro da caixa (o painel refina pelo raio).
 */
export function estimateMarkers(box: Box): Record<MarkerId, Vec3> {
  const H = box.max[1] - box.min[1]
  const W = box.max[0] - box.min[0]
  const y0 = box.min[1]
  const z = (box.min[2] + box.max[2]) / 2
  const tPose = W > T_POSE_WIDTH_RATIO * H
  const wrist = tPose ? { y: 0.8, x: 0.4 } : { y: 0.53, x: 0.42 }
  const elbow = tPose ? { y: 0.8, x: 0.22 } : { y: 0.66, x: 0.3 }
  const at = (x: number, fy: number): Vec3 => [x, y0 + fy * H, z]
  return {
    chin: at(0, 0.87),
    groin: at(0, 0.5),
    wristL: at(wrist.x * W, wrist.y),
    wristR: at(-wrist.x * W, wrist.y),
    elbowL: at(elbow.x * W, elbow.y),
    elbowR: at(-elbow.x * W, elbow.y),
    kneeL: at(0.055 * H, 0.27),
    kneeR: at(-0.055 * H, 0.27),
  }
}

/** Fração de `joelho.x` onde fica o quadril (a mesma do `UpLeg` da SPEC-0187). */
const HIP_X_FRACTION = 0.78

/** Linhas de ajuda: punho–cotovelo e quadril estimado–joelho, por lado. */
export function helperLines(markers: MarkerSet): Array<{ from: Vec3; to: Vec3; color: string }> {
  const lines: Array<{ from: Vec3; to: Vec3; color: string }> = []
  for (const side of ['L', 'R'] as const) {
    const wrist = markers[`wrist${side}`]
    const elbow = markers[`elbow${side}`]
    if (wrist && elbow) lines.push({ from: elbow, to: wrist, color: markerColor('wristL') })
    const knee = markers[`knee${side}`]
    const groin = markers.groin
    if (knee && groin) lines.push({ from: [HIP_X_FRACTION * knee[0], groin[1], knee[2]], to: knee, color: markerColor('kneeL') })
  }
  return lines
}

// ── Validação ─────────────────────────────────────────────────────────────────

export type ValidationCode = 'missing' | 'chinBelowGroin' | 'elbowBelowWrist' | 'kneeAboveGroin'

export interface ValidationError {
  code: ValidationCode
  ids: MarkerId[]
}

/** Folga do "cotovelo acima do punho", em fração da altura (pose em T: mesma altura). */
const ELBOW_WRIST_SLACK = 0.02

/** Regras da SPEC-0349. `height` = altura do modelo (para a folga). Vazio = válido. */
export function validateMarkers(markers: MarkerSet, height: number): ValidationError[] {
  const missing = MARKER_IDS.filter((id) => !markers[id])
  if (missing.length) return [{ code: 'missing', ids: missing }]
  const m = markers as Record<MarkerId, Vec3>
  const errors: ValidationError[] = []
  if (m.chin[1] <= m.groin[1]) errors.push({ code: 'chinBelowGroin', ids: ['chin', 'groin'] })
  for (const side of ['L', 'R'] as const) {
    const elbow = m[`elbow${side}`]
    const wrist = m[`wrist${side}`]
    if (elbow[1] < wrist[1] - ELBOW_WRIST_SLACK * height) errors.push({ code: 'elbowBelowWrist', ids: [`elbow${side}`, `wrist${side}`] })
    if (m[`knee${side}`][1] >= m.groin[1]) errors.push({ code: 'kneeAboveGroin', ids: [`knee${side}`, 'groin'] })
  }
  return errors
}

// ── Config do personagem ──────────────────────────────────────────────────────

export interface CharacterConfig {
  code: string
  source: string
  /** `transform.rotateZDeg` (graus; 0 se ausente). */
  rotateZDeg: number
  /** Pasta de trabalho (`work`), onde fica a folha de revisão; `null` se ausente. */
  work: string | null
  /** A config tem a seção `skinned` (só essas entram no painel). */
  skinned: boolean
}

function stripBom(text: string): string {
  return text.replace(/^﻿/, '')
}

/** Lê os campos usados da config `tools/characters/<CODE>.json`. Lança se faltar `code`/`source`. */
export function parseCharacterConfig(text: string): CharacterConfig {
  const raw = JSON.parse(stripBom(text)) as Record<string, unknown>
  const code = raw['code']
  const source = raw['source']
  if (typeof code !== 'string' || !code) throw new Error('config sem "code"')
  if (typeof source !== 'string' || !source) throw new Error('config sem "source"')
  const transform = raw['transform'] as Record<string, unknown> | undefined
  const rot = transform?.['rotateZDeg']
  const work = raw['work']
  const skinned = raw['skinned']
  return {
    code,
    source,
    rotateZDeg: typeof rot === 'number' && Number.isFinite(rot) ? rot : 0,
    work: typeof work === 'string' && work ? work : null,
    skinned: skinned != null && typeof skinned === 'object',
  }
}

/** Nome de arquivo que pode ser config de personagem (`*.json`, menos `defaults.json` e `*.markers.json`). */
export function isCharacterConfigName(name: string): boolean {
  return name.endsWith('.json') && name !== 'defaults.json' && !name.endsWith('.markers.json')
}

/** `true` se o caminho é uma config dentro de `tools/characters/` (aceita `\` e `/`). */
export function isCharacterConfigPath(path: string): boolean {
  const parts = path.split(/[\\/]/)
  const name = parts[parts.length - 1] ?? ''
  return parts[parts.length - 2] === 'characters' && parts[parts.length - 3] === 'tools' && isCharacterConfigName(name)
}

/** `tools/characters/LUC-01.json` → `tools/characters/LUC-01.markers.json`. */
export function markersPathFor(configPath: string): string {
  return configPath.replace(/\.json$/, '.markers.json')
}

/** Caminho relativo ao projeto que o script recebe em `--config`. */
export function configRelPath(configFileName: string): string {
  return `tools/characters/${configFileName}`
}

/** Folha de revisão do skinning (`<work>/skinned/previa/folha.png`). */
export function previewSheetPath(work: string): string {
  return `${work.replace(/[\\/]+$/, '')}/skinned/previa/folha.png`
}

// ── Arquivo de marcadores ─────────────────────────────────────────────────────

export interface MarkersFile {
  version: 1
  code: string
  source: string
  space: 'gltf'
  symmetry: boolean
  /** Espaço `gltf.scene` (antes de qualquer rotação do painel). */
  markers: Record<MarkerId, Vec3>
}

/** Arredonda a 0,1 mm e normaliza −0. */
function round4(v: number): number {
  const r = Math.round(v * 1e4) / 1e4
  return r === 0 ? 0 : r
}

/** JSON do contrato, 2 espaços, quebra de linha final, marcadores na ordem de `MARKER_IDS`. */
export function serializeMarkersFile(file: Omit<MarkersFile, 'version' | 'space'>): string {
  const markers: Record<string, Vec3> = {}
  for (const id of MARKER_IDS) {
    const p = file.markers[id]
    markers[id] = [round4(p[0]), round4(p[1]), round4(p[2])]
  }
  const out = { version: 1, code: file.code, source: file.source, space: 'gltf', symmetry: file.symmetry, markers }
  return `${JSON.stringify(out, null, 2)}\n`
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
}

/** Lê o `.markers.json`. Lança se a versão/espaço não baterem ou faltar marcador. */
export function parseMarkersFile(text: string): MarkersFile {
  const raw = JSON.parse(stripBom(text)) as Record<string, unknown>
  if (raw['version'] !== 1) throw new Error(`versão não suportada: ${String(raw['version'])}`)
  if (raw['space'] !== 'gltf') throw new Error(`espaço não suportado: ${String(raw['space'])}`)
  const src = raw['markers'] as Record<string, unknown> | undefined
  const markers = {} as Record<MarkerId, Vec3>
  for (const id of MARKER_IDS) {
    const p = src?.[id]
    if (!isVec3(p)) throw new Error(`marcador inválido: ${id}`)
    markers[id] = [p[0], p[1], p[2]]
  }
  return {
    version: 1,
    code: typeof raw['code'] === 'string' ? raw['code'] : '',
    source: typeof raw['source'] === 'string' ? raw['source'] : '',
    space: 'gltf',
    symmetry: raw['symmetry'] !== false,
    markers,
  }
}

/** Mesmo arquivo de origem, ignorando `\` × `/` e caixa (Windows). */
export function sameSource(a: string, b: string): boolean {
  const norm = (s: string): string => s.replace(/\\/g, '/').toLowerCase()
  return norm(a) === norm(b)
}

// ── Execução do script ────────────────────────────────────────────────────────

export type RigOutcome = 'approved' | 'rejected' | 'infra' | 'review' | 'unknown'

/** Código de saída de `tools/prepare-character.sh` (ADR-0182 do jogo). */
export function rigOutcome(code: number): RigOutcome {
  switch (code) {
    case 0: return 'approved'
    case 1: return 'rejected'
    case 2: return 'infra'
    case 3: return 'review'
    default: return 'unknown'
  }
}

/** Remove sequências de escape ANSI (cor/cursor) da saída do processo. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '')
}
