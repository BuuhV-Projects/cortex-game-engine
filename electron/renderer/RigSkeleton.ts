import * as THREE from 'three'
import { debug } from '../../src/core/debug'
import { localAfterWorldRotation, type Quat, type Vec3 } from './characterRigArmSpace'
import { POSE_BONES, POSE_PARENTS, poseCorrections, worldCorrections } from './characterRigPose'
import { followConstraints, type FollowLink } from './characterRigFollow'

/**
 * Os 22 ossos Mixamo do GLB da prévia (SPEC-0349 adendos 8 e 9): repouso lido
 * antes do mixer, leitura do quadro no espaço do modelo e a aplicação da pose e
 * das ligações por cima do quadro (cada passo na pilha de desfazer do quadro).
 */

const SCOPE = 'characterRig'
const parentOf = (bone: string): string | null => POSE_PARENTS[bone] ?? null

function toQuat(q: THREE.Quaternion): Quat {
  return [q.x, q.y, q.z, q.w]
}

export type UndoStack = Array<[THREE.Object3D, THREE.Quaternion]>

export class RigSkeleton {
  model: THREE.Object3D | null = null
  readonly bones = new Map<string, THREE.Object3D>()
  /** W de cada osso no repouso do GLB (antes do mixer), no espaço do modelo. */
  rest = new Map<string, Quat>()
  /** Cabeça de cada osso no repouso do GLB, no espaço do modelo. */
  restHeads = new Map<string, Vec3>()
  private readonly tmpV = new THREE.Vector3()
  private readonly tmpQ = new THREE.Quaternion()
  private readonly tmpQ2 = new THREE.Quaternion()

  /** Novo GLB (antes do mixer: lê o repouso) ou nenhum. */
  setModel(model: THREE.Object3D | null): void {
    this.model = model
    this.bones.clear()
    this.rest = new Map()
    this.restHeads = new Map()
    if (!model) return
    model.updateMatrixWorld(true)
    for (const n of POSE_BONES) {
      const b = model.getObjectByName(n)
      if (b?.parent) this.bones.set(n, b)
    }
    if (this.bones.size !== POSE_BONES.length) debug(SCOPE, 'rig sem todos os ossos Mixamo (pose)', POSE_BONES.filter((n) => !this.bones.has(n)))
    for (const [n, b] of this.bones) {
      this.rest.set(n, this.modelQuat(b))
      this.restHeads.set(n, this.modelPos(b))
    }
  }

  modelQuat(o: THREE.Object3D): Quat {
    this.model!.getWorldQuaternion(this.tmpQ2).invert()
    return toQuat(this.tmpQ2.multiply(o.getWorldQuaternion(this.tmpQ)))
  }

  modelPos(o: THREE.Object3D): Vec3 {
    const v = this.model!.worldToLocal(o.getWorldPosition(this.tmpV))
    return [v.x, v.y, v.z]
  }

  readFrame(): Map<string, Quat> {
    const out = new Map<string, Quat>()
    for (const [n, b] of this.bones) out.set(n, this.modelQuat(b))
    return out
  }

  heads(): Map<string, Vec3> {
    const out = new Map<string, Vec3>()
    for (const [n, b] of this.bones) out.set(n, this.modelPos(b))
    return out
  }

  /** Pose (diferença `delta`) e depois as ligações sobre o quadro já posado. */
  applyPose(frame: ReadonlyMap<string, Quat>, delta: ReadonlyMap<string, Quat>, follows: readonly FollowLink[], undoStack: UndoStack): void {
    if (delta.size) this.applyCorrections(poseCorrections(POSE_BONES, parentOf, this.rest, frame, delta), undoStack)
    if (!follows.length) return
    // a ligação vale em cada quadro: recalculada sobre o quadro já com a pose
    const posedFrame = this.readFrame()
    const hips = this.bones.get(POSE_BONES[0]!)
    const hip = hips ? this.modelPos(hips) : ([0, 0, 0] as Vec3)
    const out = followConstraints(POSE_BONES, parentOf, this.rest, this.restHeads, posedFrame, hip, follows)
    this.applyCorrections(worldCorrections(POSE_BONES, parentOf, posedFrame, out), undoStack)
  }

  /** Gira cada osso pela rotação de mundo X (na ordem; o passo vai para a pilha do quadro). */
  private applyCorrections(corr: ReadonlyMap<string, Quat>, undoStack: UndoStack): void {
    for (const n of POSE_BONES) {
      const x = corr.get(n)
      const b = this.bones.get(n)
      if (!x || !b?.parent) continue
      undoStack.push([b, b.quaternion.clone()])
      const local = localAfterWorldRotation(this.modelQuat(b.parent), toQuat(b.quaternion), x)
      b.quaternion.set(local[0], local[1], local[2], local[3])
    }
  }
}
