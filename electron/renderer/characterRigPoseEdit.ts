/**
 * Edição de uma junta no ajuste de pose (SPEC-0349 adendo 8): da pose do começo do
 * arrasto e do quadro mostrado naquele instante para a pose nova. Mover = IK na
 * mão/pé, apontar o pai nas outras, nada no `Hips`; girar = rotação de mundo G no
 * osso. Sem DOM e sem three.js — testado em `tests/electron/characterRigPoseEdit.test.ts`.
 */

import { quatInv, quatMul, type Quat, type Vec3 } from './characterRigArmSpace.js'
import { POSE_PARENTS, aimParent, correctionOf, editPose, isIdentity, moveKind, parentTurn, twoBoneIk, type Pose } from './characterRigPose.js'

/** O quadro mostrado no começo de uma edição, no espaço do modelo. */
export interface Snapshot {
  /** W antes da pose (depois do mixer e dos braços). */
  frame: Map<string, Quat>
  /** W' mostrado (com a diferença da pose). */
  posed: Map<string, Quat>
  /** Posição de cada junta mostrada. */
  pos: Map<string, Vec3>
}

const parentOf = (bone: string): string | null => POSE_PARENTS[bone] ?? null

/** R novo de um osso pela rotação de mundo G (quadro `snap`, pose do começo `start`). */
function edited(start: Pose, snap: Snapshot, rest: ReadonlyMap<string, Quat>, bone: string, g: Quat, extraCorrection?: Quat): Quat {
  const p = parentOf(bone)
  const P = parentTurn(p, rest, snap.frame)
  const C0 = correctionOf(p, snap.frame, snap.posed)
  const C = extraCorrection ? quatMul(extraCorrection, C0) : C0
  return editPose(start.get(bone) ?? [0, 0, 0, 1], P, C, g)
}

function setBone(pose: Map<string, Quat>, bone: string, r: Quat): void {
  if (isIdentity(r)) pose.delete(bone)
  else pose.set(bone, r)
}

/** Pose nova com o osso `bone` girado por G (mundo, espaço do modelo). */
export function rotateJointPose(start: Pose, snap: Snapshot, rest: ReadonlyMap<string, Quat>, bone: string, g: Quat): Map<string, Quat> {
  const next = new Map(start)
  setBone(next, bone, edited(start, snap, rest, bone, g))
  return next
}

/** Pose nova com a junta `bone` levada a `target` (espaço do modelo). */
export function moveJointPose(start: Pose, snap: Snapshot, rest: ReadonlyMap<string, Quat>, bone: string, target: Vec3): Map<string, Quat> {
  const next = new Map(start)
  const how = moveKind(bone)
  const pos = snap.pos
  if (how.kind === 'ik') {
    const a = pos.get(how.upper)
    const b = pos.get(how.lower)
    const c = pos.get(bone)
    if (!a || !b || !c) return next
    const { upper, lower } = twoBoneIk(a, b, c, target)
    setBone(next, how.upper, edited(start, snap, rest, how.upper, upper))
    // o antebraço/perna herda o giro do de cima: C do pai passa a ser upper · C
    setBone(next, how.lower, edited(start, snap, rest, how.lower, lower, upper))
  } else if (how.kind === 'aim') {
    const a = pos.get(how.parent)
    const c = pos.get(bone)
    if (a && c) setBone(next, how.parent, edited(start, snap, rest, how.parent, aimParent(a, c, target)))
  }
  return next
}

/** Passadas da busca do alvo do pulso (0,6 m → < 1 mm no LUC-01). */
const WRIST_PASSES = 6

function rotate(q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
  const r = quatMul(quatMul(q, [v[0], v[1], v[2], 0]), quatInv(q))
  return [r[0], r[1], r[2]]
}

/**
 * Alvo do pulso (a cabeça de `bone`, mão/pé) para a palma ficar em `point`: a palma
 * está a `palm` do pulso (espaço do modelo, no quadro mostrado) e gira com a IK
 * (`lower · upper`), então o alvo é refeito algumas vezes. Junta sem IK: o próprio ponto.
 */
export function wristTarget(snap: Snapshot, bone: string, point: Vec3, palm: Vec3): Vec3 {
  const how = moveKind(bone)
  const a = how.kind === 'ik' ? snap.pos.get(how.upper) : undefined
  const b = how.kind === 'ik' ? snap.pos.get(how.lower) : undefined
  const c = snap.pos.get(bone)
  if (!a || !b || !c) return point
  let target: Vec3 = [point[0] - palm[0], point[1] - palm[1], point[2] - palm[2]]
  for (let i = 0; i < WRIST_PASSES; i++) {
    const { upper, lower } = twoBoneIk(a, b, c, target)
    const p = rotate(quatMul(lower, upper), palm)
    target = [point[0] - p[0], point[1] - p[1], point[2] - p[2]]
  }
  return target
}
