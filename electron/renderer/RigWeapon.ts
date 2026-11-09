import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { debug } from '../../src/core/debug'
import { OVERLAY_ORDER } from './RigPoseOverlay'
import { weaponsFromNodes, type Grip } from './characterRigWeapon'

/**
 * Arma na mão da prévia do ajuste de pose (SPEC-0703): carrega o GLB das armas do
 * projeto, prende o clone da arma escolhida no osso da mão pela pegada (em todo
 * quadro, depois da pose) e marca o `Grip_L` (alvo da mão de apoio).
 */

const SCOPE = 'characterRig'
/** Raio da bolinha do `Grip_L` (m). */
const GRIP_L_RADIUS = 0.018
const COLOR_GRIP_L = 0x84cc16

/** Posição e giro de mundo do proxy do gizmo. */
export interface GripPose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
}

interface LoadedWeapon {
  node: THREE.Object3D
  /** `Grip_L` no espaço da arma (origem no `Grip_R`). */
  gripL: THREE.Vector3
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export class RigWeapon {
  private weapons = new Map<string, LoadedWeapon>()
  private gltf: GLTF | null = null
  private loadedPath = ''
  /** Carga em andamento do `loadedPath` (a mesma promessa para chamadas simultâneas). */
  private loading: Promise<string[]> | null = null
  private current: string | null = null
  /** Clone da arma escolhida, na cena (transform de mundo escrito em todo quadro). */
  readonly holder = new THREE.Group()
  private readonly marker: THREE.Mesh
  private readonly tmpQ = new THREE.Quaternion()
  private readonly raycaster = new THREE.Raycaster()

  constructor(scene: THREE.Scene) {
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(GRIP_L_RADIUS, 12, 8), new THREE.MeshBasicMaterial({ color: COLOR_GRIP_L, depthTest: false, depthWrite: false, transparent: true }))
    this.marker.renderOrder = OVERLAY_ORDER
    this.holder.visible = this.marker.visible = false
    scene.add(this.holder, this.marker)
  }

  /** Códigos das armas carregadas, em ordem de nome. */
  get codes(): string[] {
    return [...this.weapons.keys()]
  }

  get weapon(): string | null {
    return this.current
  }

  /**
   * Carrega (uma vez por caminho) o GLB das armas; sem arquivo = nenhuma arma.
   * Chamadas simultâneas com o mesmo caminho esperam a mesma carga; depois de uma
   * falha, a próxima chamada tenta de novo.
   */
  load(path: string): Promise<string[]> {
    if (path === this.loadedPath) return this.loading ?? Promise.resolve(this.codes)
    this.clear()
    this.loadedPath = path
    const loading = this.fetch(path).finally(() => {
      if (this.loading === loading) this.loading = null
    })
    this.loading = loading
    return loading
  }

  private async fetch(path: string): Promise<string[]> {
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (path !== this.loadedPath) return this.codes
      const gltf: GLTF = await new Promise((res, rej) => new GLTFLoader().parse(base64ToArrayBuffer(b64), '', res, rej))
      if (path !== this.loadedPath) return this.codes
      this.gltf = gltf
      const roots = gltf.scene.children
      for (const w of weaponsFromNodes(roots.map((r) => ({ name: r.name, children: r.children.map((c) => c.name) })))) {
        const node = roots.find((r) => r.name === w.code)
        const gripL = node?.getObjectByName(w.gripL)
        if (node && gripL) this.weapons.set(w.code, { node, gripL: gripL.position.clone() })
      }
      debug(SCOPE, 'armas carregadas', path, this.codes)
    } catch (err) {
      debug(SCOPE, 'sem GLB de armas (seletor só com "Sem arma")', path, err)
      if (path === this.loadedPath) this.loadedPath = '' // tenta de novo na próxima
    }
    return this.codes
  }

  /** Arma mostrada (`null` = sem arma). */
  setWeapon(code: string | null): void {
    const w = code ? this.weapons.get(code) : undefined
    this.current = w ? code : null
    this.holder.clear()
    if (w) this.holder.add(w.node.clone(true))
    this.holder.visible = this.marker.visible = !!w
  }

  /** Prende a arma na mão pela pegada: posição pelo osso (`localToWorld`), giro = mão · pegada. */
  attach(hand: THREE.Object3D | null, grip: Grip): void {
    if (!this.current || !hand) return
    hand.updateWorldMatrix(true, false)
    hand.localToWorld(this.holder.position.set(...grip.offset))
    hand.getWorldQuaternion(this.holder.quaternion).multiply(this.tmpQ.set(...grip.rotation))
    this.holder.updateMatrixWorld(true)
    const w = this.weapons.get(this.current)!
    this.marker.position.copy(w.gripL).applyMatrix4(this.holder.matrixWorld)
  }

  /** Pegada que põe a arma em `pos`/`quat` (mundo) no osso `hand` (inversa do `attach`). */
  gripFor(hand: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion): Grip {
    hand.updateWorldMatrix(true, false)
    const local = hand.worldToLocal(pos.clone())
    const q = hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quat).normalize()
    return { offset: [local.x, local.y, local.z], rotation: [q.x, q.y, q.z, q.w] }
  }

  /**
   * Pegada do arrasto (SPEC-0721): a do começo (`start`) mais o quanto o proxy andou e girou de `from` a `to`. Só o
   * deslocamento do proxy conta, não onde ele está: um proxy fora de lugar parado devolve `start`.
   */
  dragGrip(hand: THREE.Object3D, start: Grip, from: GripPose, to: GripPose): Grip {
    hand.updateWorldMatrix(true, false)
    const pos = hand.localToWorld(new THREE.Vector3(...start.offset)).add(to.pos).sub(from.pos)
    const q0 = hand.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion(...start.rotation))
    const quat = to.quat.clone().multiply(from.quat.clone().invert()).multiply(q0)
    return this.gripFor(hand, pos, quat)
  }

  /** `Grip_L` no mundo (`null` sem arma). */
  gripLWorld(): THREE.Vector3 | null {
    return this.current ? this.marker.position.clone() : null
  }

  /** O ponteiro está sobre a arma? (raycast na malha). */
  hit(camera: THREE.Camera, ndc: THREE.Vector2): boolean {
    if (!this.current) return false
    this.raycaster.setFromCamera(ndc, camera)
    return this.raycaster.intersectObject(this.holder, true).length > 0
  }

  private clear(): void {
    this.setWeapon(null)
    this.weapons.clear()
    this.gltf?.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
        m.dispose()
      }
    })
    this.gltf = null
    this.loadedPath = ''
  }

  dispose(): void {
    this.clear()
    this.marker.geometry.dispose()
    ;(this.marker.material as THREE.Material).dispose()
  }
}
