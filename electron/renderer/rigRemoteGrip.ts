import * as THREE from 'three'
import type { Grip } from './characterRigWeapon.js'
import type { Quat, Vec3 } from './characterRigArmSpace.js'

/**
 * Conta da pegada por comando e por teclado (SPEC-0746): a pegada (`offset` em m, `rotation` quaternion, no espaço do
 * osso `RightHand`) em cm e graus, a soma de um deslocamento e o giro em torno dos eixos do osso. Sem DOM.
 */

/** Metros por centímetro. */
export const M_PER_CM = 0.01
/** Passo do teclado: 1 mm (em cm) e 1°. */
export const KEY_STEP_CM = 0.1
export const KEY_STEP_DEG = 1
/** Casas do que o comando devolve (cm e graus). */
const VIEW_DECIMALS = 4

/** A pegada como o comando a mostra. */
export interface GripView {
  offsetCm: Vec3
  rotation: Quat
  rotationDeg: Vec3
}

/** O que mudar na pegada (`rotation` vence `rotationDeg`). */
export interface GripPatch {
  offsetCm?: Vec3
  rotationDeg?: Vec3
  rotation?: Quat
}

const round = (v: number): number => {
  const f = 10 ** VIEW_DECIMALS
  const r = Math.round(v * f) / f
  return r === 0 ? 0 : r
}

function isVec(v: unknown, n: number): v is number[] {
  return Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x))
}

/** Lê `[x, y, z]` de um argumento (lança com o nome do campo se não é). */
export function readVec3(v: unknown, field: string): Vec3 | undefined {
  if (v === undefined || v === null) return undefined
  if (!isVec(v, 3)) throw new Error(`${field}: esperado [x, y, z] numérico`)
  return [v[0]!, v[1]!, v[2]!]
}

/** Lê `[x, y, z, w]` (normalizado). */
export function readQuat4(v: unknown, field: string): Quat | undefined {
  if (v === undefined || v === null) return undefined
  if (!isVec(v, 4)) throw new Error(`${field}: esperado [x, y, z, w] numérico`)
  const q = new THREE.Quaternion(v[0], v[1], v[2], v[3])
  if (q.lengthSq() === 0) throw new Error(`${field}: quaternion nulo`)
  q.normalize()
  return [q.x, q.y, q.z, q.w]
}

/** A pegada em cm e graus (Euler XYZ do quaternion). */
export function gripView(g: Grip): GripView {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...g.rotation), 'XYZ')
  return {
    offsetCm: g.offset.map((m) => round(m / M_PER_CM)) as Vec3,
    rotation: g.rotation.map(round) as Quat,
    rotationDeg: [e.x, e.y, e.z].map((r) => round(THREE.MathUtils.radToDeg(r))) as Vec3,
  }
}

/** Troca os campos dados da pegada (posição em cm, giro em quaternion ou Euler XYZ em graus). */
export function patchGrip(g: Grip, patch: GripPatch): Grip {
  const offset = patch.offsetCm ? (patch.offsetCm.map((c) => c * M_PER_CM) as Vec3) : g.offset
  let rotation = g.rotation
  if (patch.rotation) rotation = patch.rotation
  else if (patch.rotationDeg) {
    const [x, y, z] = patch.rotationDeg.map((d) => THREE.MathUtils.degToRad(d)) as Vec3
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'))
    rotation = [q.x, q.y, q.z, q.w]
  }
  return { offset: [...offset] as Vec3, rotation: [...rotation] as Quat }
}

/**
 * Soma à pegada: `moveCm` no espaço do osso; `rotateDeg` gira a arma em torno dos eixos X, depois Y, depois Z do osso
 * (pré-multiplica: o eixo é o do osso, não o da arma). A origem da arma (o `Grip_R`) não sai do lugar com o giro.
 */
export function nudgeGrip(g: Grip, moveCm?: Vec3, rotateDeg?: Vec3): Grip {
  const offset = moveCm ? (g.offset.map((m, i) => m + moveCm[i]! * M_PER_CM) as Vec3) : g.offset
  const q = new THREE.Quaternion(...g.rotation)
  if (rotateDeg) {
    const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
    axes.forEach((axis, i) => {
      if (rotateDeg[i]) q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(rotateDeg[i]!)))
    })
    q.normalize()
  }
  return { offset: [...offset] as Vec3, rotation: [q.x, q.y, q.z, q.w] }
}

/** O que uma tecla faz na pegada (`null` = não é atalho da pegada). */
export interface KeyNudge {
  moveCm?: Vec3
  rotateDeg?: Vec3
}

/** Tecla → eixo e sentido: ←/→ X, ↑/↓ Y (os dedos), PgUp/PgDn Z. */
const KEY_AXES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  ArrowUp: [1, 1],
  ArrowDown: [1, -1],
  PageUp: [2, 1],
  PageDown: [2, -1],
}

/** A tecla (`KeyboardEvent.key`) com ou sem Alt: 1 mm ou 1° no eixo dela. */
export function keyNudge(key: string, alt: boolean): KeyNudge | null {
  const hit = KEY_AXES[key]
  if (!hit) return null
  const v: Vec3 = [0, 0, 0]
  v[hit[0]] = hit[1] * (alt ? KEY_STEP_DEG : KEY_STEP_CM)
  return alt ? { rotateDeg: v } : { moveCm: v }
}
