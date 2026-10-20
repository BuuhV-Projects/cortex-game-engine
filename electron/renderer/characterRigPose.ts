/**
 * Pose por clipe, junta a junta — lógica pura da aba **Animações** do painel
 * auto-rig (SPEC-0349, adendo 8).
 *
 * Contrato do jogo (SPEC-0187, seção 9; `pose_offsets` em
 * `scripts/blender/character_skin.py`): `skinned.clips[nome].pose` = `{ "<osso
 * Mixamo>": [x, y, z, w] }`, R no espaço do modelo do GLB, medida com o pai no
 * repouso. O JSON do skin grava o aplicado em `clips[nome].poseOffsets`. Conta,
 * na ordem da hierarquia, com W = rotação de mundo do osso no espaço do modelo:
 * P = W_pai · W_pai_repouso⁻¹, C = W'_pai · W_pai⁻¹, W'_n = C · P · R · P⁻¹ · W_n
 * (sem R, W'_n = C · W_n). Cada junta é dela (sem espelho).
 *
 * Sem DOM e sem three.js (quaternions `[x, y, z, w]` de `characterRigArmSpace`)
 * — testado em `tests/electron/characterRigPose.test.ts`.
 */

import type { JsonObject } from './characterRigSelection.js'
import { QUAT_IDENTITY, quatInv, quatMul, type Quat, type Vec3 } from './characterRigArmSpace.js'

/** Pai de cada um dos 22 ossos Mixamo (sem os `*Helper`), na ordem da hierarquia. */
export const POSE_PARENTS: Readonly<Record<string, string | null>> = Object.freeze({
  Hips: null,
  Spine: 'Hips',
  Spine1: 'Spine',
  Spine2: 'Spine1',
  Neck: 'Spine2',
  Head: 'Neck',
  LeftShoulder: 'Spine2',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
  RightToeBase: 'RightFoot',
})

/** Os 22 ossos Mixamo, pai antes do filho. */
export const POSE_BONES: readonly string[] = Object.keys(POSE_PARENTS)

/** Osso que não se move pelas setas (só gira). */
export const ROOT_BONE = 'Hips'

/** Casas decimais gravadas na config. */
export const POSE_DECIMALS = 6

/** Pose de um clipe: osso → R. */
export type Pose = ReadonlyMap<string, Quat>

function isObject(v: unknown): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// ── Quaternions e vetores ───────────────────────────────────────────────────

export function quatNormalize(q: Readonly<Quat>): Quat {
  const len = Math.hypot(q[0], q[1], q[2], q[3])
  return len > 0 ? [q[0] / len, q[1] / len, q[2] / len, q[3] / len] : [...QUAT_IDENTITY] as Quat
}

/** Ângulo total da rotação, em graus (0 a 180). */
export function quatAngleDeg(q: Readonly<Quat>): number {
  const w = Math.min(1, Math.abs(quatNormalize(q)[3]))
  return (2 * Math.acos(w) * 180) / Math.PI
}

/** `1 − |q·q'|`: 0 = mesma rotação (q e −q são iguais). */
export function quatDistance(a: Readonly<Quat>, b: Readonly<Quat>): number {
  return 1 - Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
}

const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Readonly<Vec3>, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a: Readonly<Vec3>): number => Math.hypot(a[0], a[1], a[2])
const unit = (a: Readonly<Vec3>): Vec3 => scale(a, 1 / (length(a) || 1))

/** Um vetor unitário perpendicular a `v`. */
function perpendicular(v: Readonly<Vec3>): Vec3 {
  const other: Vec3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  return unit(cross(v, other))
}

/**
 * O `Vector.orthogonal()` do Blender, no espaço do Blender ((x, y, z) do GLB →
 * (x, −z, y)): o polo de reserva do IK do pipeline quando o osso aponta para o alvo.
 */
export function blenderOrthogonal(v: Readonly<Vec3>): Vec3 {
  const b: Vec3 = [v[0], -v[2], v[1]]
  const [ax, ay, az] = b.map(Math.abs) as Vec3
  const axis = ax > ay ? (ax > az ? 0 : 2) : ay > az ? 1 : 2
  const o: Vec3 = axis === 0 ? [-b[1] - b[2], b[0], b[0]] : axis === 1 ? [b[1], -b[0] - b[2], b[1]] : [b[2], b[2], -b[0] - b[1]]
  return [o[0], o[2], -o[1]]
}

/** Menor arco que leva a direção `from` à direção `to`. */
export function quatFromTo(from: Readonly<Vec3>, to: Readonly<Vec3>): Quat {
  const a = unit(from)
  const b = unit(to)
  const d = dot(a, b)
  if (d < -1 + 1e-9) {
    const axis = perpendicular(a)
    return [axis[0], axis[1], axis[2], 0]
  }
  const c = cross(a, b)
  return quatNormalize([c[0], c[1], c[2], 1 + d])
}

// ── A conta do pipeline ─────────────────────────────────────────────────────

/**
 * `pose_offsets` do pipeline: W' de cada osso de `order` (pai antes do filho) a
 * partir das rotações de mundo do quadro (`frame`) e do repouso (`rest`), no
 * espaço do modelo. Osso fora de `frame` é ignorado.
 */
export function poseOffsets(
  order: readonly string[],
  parentOf: (bone: string) => string | null | undefined,
  rest: ReadonlyMap<string, Quat>,
  frame: ReadonlyMap<string, Quat>,
  pose: Pose,
): Map<string, Quat> {
  const out = new Map<string, Quat>()
  const corr = new Map<string, Quat>()
  for (const n of order) {
    const w = frame.get(n)
    if (!w) continue
    const p = parentOf(n) ?? null
    const c = (p && corr.get(p)) || QUAT_IDENTITY
    const r = pose.get(n)
    let posed: Quat
    if (r) {
      const par = parentTurn(p, rest, frame)
      posed = quatMul(quatMul(quatMul(quatMul(c, par), r), quatInv(par)), w)
    } else {
      posed = quatMul(c, w)
    }
    out.set(n, posed)
    corr.set(n, quatMul(posed, quatInv(w)))
  }
  return out
}

/** P = W_pai · W_pai_repouso⁻¹ (identidade para a raiz ou pai sem dado). */
export function parentTurn(parent: string | null, rest: ReadonlyMap<string, Quat>, frame: ReadonlyMap<string, Quat>): Quat {
  const wp = parent ? frame.get(parent) : undefined
  const rp = parent ? rest.get(parent) : undefined
  return wp && rp ? quatMul(wp, quatInv(rp)) : [...QUAT_IDENTITY] as Quat
}

/**
 * O que a prévia aplica osso a osso, na ordem: rotação de mundo X_n que leva o
 * osso de `C_pai · W_n` (onde ele fica quando só o pai mudou, já que o filho
 * acompanha na hierarquia) a W'_n. `X_n = C · P · R · P⁻¹ · C⁻¹`. Só os ossos com R.
 */
export function poseCorrections(
  order: readonly string[],
  parentOf: (bone: string) => string | null | undefined,
  rest: ReadonlyMap<string, Quat>,
  frame: ReadonlyMap<string, Quat>,
  pose: Pose,
): Map<string, Quat> {
  return worldCorrections(order, parentOf, frame, poseOffsets(order, parentOf, rest, frame, pose))
}

/**
 * Leva um esqueleto de `before` a `after` (rotações de mundo) osso a osso, na
 * ordem: X_n = W'_n · (C_pai · W_n)⁻¹, com C_pai = W'_pai · W_pai⁻¹ (o filho já
 * acompanhou o pai na hierarquia). Só os ossos com X diferente da identidade.
 */
export function worldCorrections(
  order: readonly string[],
  parentOf: (bone: string) => string | null | undefined,
  before: ReadonlyMap<string, Quat>,
  after: ReadonlyMap<string, Quat>,
): Map<string, Quat> {
  const out = new Map<string, Quat>()
  for (const n of order) {
    const w = before.get(n)
    const wn = after.get(n)
    if (!w || !wn) continue
    const c = correctionOf(parentOf(n) ?? null, before, after)
    const x = quatNormalize(quatMul(wn, quatInv(quatMul(c, w))))
    if (1 - Math.abs(x[3]) > 1e-14) out.set(n, x)
  }
  return out
}

/** C = W'_pai · W_pai⁻¹ (identidade para a raiz). */
export function correctionOf(parent: string | null, frame: ReadonlyMap<string, Quat>, posed: ReadonlyMap<string, Quat>): Quat {
  const w = parent ? frame.get(parent) : undefined
  const wp = parent ? posed.get(parent) : undefined
  return w && wp ? quatMul(wp, quatInv(w)) : [...QUAT_IDENTITY] as Quat
}

/**
 * Uma edição no quadro mostrado (rotação de mundo G aplicada ao osso já posado)
 * vira o novo R: `Rf = C⁻¹ · G · C · P · R · P⁻¹`, `R_novo = P⁻¹ · Rf · P`.
 */
export function editPose(rOld: Readonly<Quat>, parentTurnQ: Readonly<Quat>, correction: Readonly<Quat>, g: Readonly<Quat>): Quat {
  const rf = quatMul(quatMul(quatMul(quatMul(quatMul(quatInv(correction), g), correction), parentTurnQ), rOld), quatInv(parentTurnQ))
  return quatNormalize(quatMul(quatMul(quatInv(parentTurnQ), rf), parentTurnQ))
}

/** O inverso de `editPose`: a rotação de mundo G que leva `rOld` a `rNew` no quadro. */
export function editRotation(rOld: Readonly<Quat>, rNew: Readonly<Quat>, parentTurnQ: Readonly<Quat>, correction: Readonly<Quat>): Quat {
  const cp = quatMul(correction, parentTurnQ)
  return quatNormalize(quatMul(quatMul(quatMul(cp, rNew), quatInv(rOld)), quatInv(cp)))
}

// ── Mover uma junta ─────────────────────────────────────────────────────────

/**
 * Apontar o osso pai: gira o pai (pivô em `parentPos`) pelo menor arco para a
 * junta `jointPos` ir na direção de `target` (sem mudar o comprimento).
 */
export function aimParent(parentPos: Readonly<Vec3>, jointPos: Readonly<Vec3>, target: Readonly<Vec3>): Quat {
  const to = sub(target, parentPos)
  if (length(to) < 1e-9) return [...QUAT_IDENTITY] as Quat
  return quatFromTo(sub(jointPos, parentPos), to)
}

/**
 * IK de dois ossos (braço e antebraço / coxa e perna): pivôs `a` (raiz), `b`
 * (meio) e a ponta `c`. Devolve as rotações de mundo `upper` (no osso de `a`) e
 * `lower` (no osso de `b`, depois de `upper`) para a ponta chegar em `target`,
 * mantendo os comprimentos e o plano da dobra (o polo é o `b` atual). Fora do
 * alcance, estica até o limite na direção do alvo. `margin` afasta o alcance dos
 * extremos (o pipeline usa 1e-6) e `lengths` troca os comprimentos medidos pelos
 * do repouso, como o `follow_constraints`.
 */
export function twoBoneIk(
  a: Readonly<Vec3>,
  b: Readonly<Vec3>,
  c: Readonly<Vec3>,
  target: Readonly<Vec3>,
  opts: { margin?: number; lengths?: readonly [number, number] } = {},
): { upper: Quat; lower: Quat } {
  const margin = opts.margin ?? 0
  const [l1, l2] = opts.lengths ?? [length(sub(b, a)), length(sub(c, b))]
  const toTarget = sub(target, a)
  const dist = length(toTarget)
  const dir = dist > 1e-9 ? scale(toTarget, 1 / dist) : unit(sub(c, a))
  const d = Math.min(l1 + l2 - margin, Math.max(Math.abs(l1 - l2) + margin, dist))
  // polo: o meio atual, sem a componente na direção do alvo (o plano da dobra fica);
  // osso apontando para o alvo: o mesmo polo de reserva do pipeline
  const ab = sub(b, a)
  let pole = sub(ab, scale(dir, dot(ab, dir)))
  if (length(pole) < 1e-9) pole = blenderOrthogonal(ab)
  pole = unit(pole)
  const cosA = d > 1e-12 ? Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))) : 1
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
  const bNew = add(a, add(scale(dir, l1 * cosA), scale(pole, l1 * sinA)))
  const cNew = add(a, scale(dir, d))
  const upper = quatFromTo(ab, sub(bNew, a))
  const lowerNow = rotate(upper, sub(c, b))
  const lower = quatFromTo(lowerNow, sub(cNew, bNew))
  return { upper, lower }
}

function rotate(q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
  const r = quatMul(quatMul(q, [v[0], v[1], v[2], 0]), quatInv(q))
  return [r[0], r[1], r[2]]
}

/** Ossos girados ao mover a junta `bone`: IK na mão/pé, o pai nas outras, nada no `Hips`. */
export function moveKind(bone: string): { kind: 'ik'; upper: string; lower: string } | { kind: 'aim'; parent: string } | { kind: 'none' } {
  if (bone === ROOT_BONE || !(bone in POSE_PARENTS)) return { kind: 'none' }
  if (bone.endsWith('Hand') || bone.endsWith('Foot')) {
    const lower = POSE_PARENTS[bone]!
    return { kind: 'ik', upper: POSE_PARENTS[lower]!, lower }
  }
  return { kind: 'aim', parent: POSE_PARENTS[bone]! }
}

// ── Config e JSON do skin ───────────────────────────────────────────────────

export function readQuat(v: unknown): Quat | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return null
  if (Math.hypot(...(v as number[])) < 1e-9) return null
  return quatNormalize(v as Quat)
}

function readPose(src: unknown): Map<string, Quat> {
  const out = new Map<string, Quat>()
  if (!isObject(src)) return out
  for (const bone of POSE_BONES) {
    const q = readQuat(src[bone])
    if (q && !isIdentity(q)) out.set(bone, q)
  }
  return out
}

/** Pose de cada clipe de `skinned.clips` da config (sem pose = mapa vazio). */
export function posesFromConfig(cfg: JsonObject): Map<string, Map<string, Quat>> {
  const skinned = cfg['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  const out = new Map<string, Map<string, Quat>>()
  if (!isObject(clips)) return out
  for (const [name, v] of Object.entries(clips)) if (isObject(v)) out.set(name, readPose(v['pose']))
  return out
}

/** Pose gravada na geração (`clips[nome].poseOffsets` do JSON do skin; ausente = vazia). */
export function posesFromSkin(skin: unknown): Map<string, Map<string, Quat>> {
  const clips = isObject(skin) ? skin['clips'] : undefined
  const out = new Map<string, Map<string, Quat>>()
  if (!isObject(clips)) return out
  for (const [name, v] of Object.entries(clips)) out.set(name, readPose(isObject(v) ? v['poseOffsets'] : undefined))
  return out
}

/** Arredonda a 6 casas, com `w ≥ 0` (q e −q são a mesma rotação); `-0` vira `0`. */
export function roundQuat(q: Readonly<Quat>): Quat {
  const n = quatNormalize(q)
  const s = n[3] < 0 ? -1 : 1
  const f = 10 ** POSE_DECIMALS
  return n.map((c) => {
    const v = Math.round(c * s * f) / f
    return v === 0 ? 0 : v
  }) as Quat
}

export function isIdentity(q: Readonly<Quat>): boolean {
  const r = roundQuat(q)
  return r[0] === 0 && r[1] === 0 && r[2] === 0
}

/** Mesma pose (mesmos ossos, rotações iguais a 6 casas). */
export function samePose(a: Pose, b: Pose): boolean {
  const keys = new Set([...a.keys(), ...b.keys()].filter((k) => !isIdentity(a.get(k) ?? QUAT_IDENTITY) || !isIdentity(b.get(k) ?? QUAT_IDENTITY)))
  for (const k of keys) {
    const ra = roundQuat(a.get(k) ?? QUAT_IDENTITY)
    const rb = roundQuat(b.get(k) ?? QUAT_IDENTITY)
    if (ra.some((v, i) => v !== rb[i])) return false
  }
  return true
}

/** O que a prévia aplica por cima do GLB: por osso, D = R_desejado · R_gerado⁻¹ (ausente = identidade). */
export function poseDelta(wanted: Pose, generated: Pose): Map<string, Quat> {
  const out = new Map<string, Quat>()
  for (const bone of POSE_BONES) {
    const w = wanted.get(bone)
    const g = generated.get(bone)
    if (!w && !g) continue
    const d = quatNormalize(quatMul(w ?? QUAT_IDENTITY, quatInv(g ?? QUAT_IDENTITY)))
    if (!isIdentity(d)) out.set(bone, d)
  }
  return out
}

/** A pose como vai para a config: ossos na ordem da hierarquia, 6 casas, sem identidade. */
export function poseToJson(pose: Pose): JsonObject {
  const out: JsonObject = {}
  for (const bone of POSE_BONES) {
    const q = pose.get(bone)
    if (q && !isIdentity(q)) out[bone] = roundQuat(q)
  }
  return out
}

/**
 * Grava as poses numa cópia da config: só nos clipes que existem em
 * `skinned.clips`; `pose` existente fica na posição, nova vai no fim da entrada;
 * sem ossos remove o campo. O resto do JSON fica igual.
 */
export function applyPoses(cfg: JsonObject, poses: ReadonlyMap<string, Pose>): JsonObject {
  const out = structuredClone(cfg)
  const skinned = out['skinned']
  const clips = isObject(skinned) ? skinned['clips'] : undefined
  if (!isObject(clips)) return out
  for (const [name, pose] of poses) {
    const entry = clips[name]
    if (!isObject(entry)) continue
    const json = poseToJson(pose)
    if (Object.keys(json).length) entry['pose'] = json
    else delete entry['pose']
  }
  return out
}

/** "Aplicar a todos os clipes": a mesma pose em todas as entradas de `skinned.clips`. */
export function applyPoseToAll(cfg: JsonObject, pose: Pose): JsonObject {
  return applyPoses(cfg, new Map([...posesFromConfig(cfg).keys()].map((name) => [name, pose])))
}
