import * as THREE from 'three'
import { POSE_BONES, POSE_PARENTS } from './characterRigPose'
import { FOLLOW_BONES, type FollowLink } from './characterRigFollow'

/**
 * Esqueleto por cima do modelo no ajuste de pose (SPEC-0349 adendos 8 e 9): linha
 * de cada osso, bolinha em cada junta (cor por estado) e a linha tracejada de cada
 * ligação "seguir", sem teste de profundidade. Também acha a junta sob o ponteiro.
 */

/** Raio de seleção das bolinhas, em pixels de tela. */
const PICK_PX = 12
const POINT_PX = 10
const COLOR_JOINT = new THREE.Color(0x22d3ee)
const COLOR_POSED = new THREE.Color(0xfb923c)
const COLOR_HOVER = new THREE.Color(0xffffff)
const COLOR_SELECTED = new THREE.Color(0xf5c451)
const COLOR_FOLLOW = new THREE.Color(0xf472b6)
/** Traço e vão da linha tracejada das ligações (m). */
const FOLLOW_DASH = 0.025
/** Desenha por cima da malha. */
export const OVERLAY_ORDER = 999

const parentOf = (bone: string): string | null => POSE_PARENTS[bone] ?? null

function circleTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.beginPath()
  g.arc(16, 16, 14, 0, Math.PI * 2)
  g.fill()
  return new THREE.CanvasTexture(c)
}

/** Estado de cada junta para a cor. */
export interface OverlayState {
  selected: string | null
  hovered: string | null
  posed: ReadonlyMap<string, unknown>
  follows: readonly FollowLink[]
}

export class RigPoseOverlay {
  readonly group = new THREE.Group()
  private readonly lines: THREE.LineSegments
  private readonly points: THREE.Points
  private readonly followLines: THREE.LineSegments
  private readonly segments: Array<[string, string]> = POSE_BONES.filter((n) => parentOf(n)).map((n) => [parentOf(n)!, n])
  private readonly tmpV = new THREE.Vector3()

  constructor() {
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.segments.length * 6), 3))
    this.lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: COLOR_JOINT, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 }))
    const pointGeo = new THREE.BufferGeometry()
    pointGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POSE_BONES.length * 3), 3))
    pointGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(POSE_BONES.length * 3), 3))
    this.points = new THREE.Points(pointGeo, new THREE.PointsMaterial({ size: POINT_PX, sizeAttenuation: false, vertexColors: true, map: circleTexture(), alphaTest: 0.5, depthTest: false, depthWrite: false, transparent: true }))
    // ligações: uma linha tracejada por ligação (no máximo uma por mão/pé)
    const followGeo = new THREE.BufferGeometry()
    followGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FOLLOW_BONES.length * 6), 3))
    this.followLines = new THREE.LineSegments(followGeo, new THREE.LineDashedMaterial({ color: COLOR_FOLLOW, dashSize: FOLLOW_DASH, gapSize: FOLLOW_DASH, depthTest: false, depthWrite: false, transparent: true }))
    for (const o of [this.lines, this.points, this.followLines]) {
      o.renderOrder = OVERLAY_ORDER
      o.frustumCulled = false
    }
    this.group.add(this.lines, this.followLines, this.points)
    this.group.visible = false
  }

  get visible(): boolean {
    return this.group.visible
  }

  set visible(on: boolean) {
    this.group.visible = on
  }

  /** Redesenha nas posições atuais dos ossos (só visível). */
  update(bones: ReadonlyMap<string, THREE.Object3D>, s: OverlayState): void {
    if (!this.group.visible) return
    const line = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute
    this.segments.forEach(([a, b], i) => {
      const pa = bones.get(a)?.getWorldPosition(this.tmpV)
      if (pa) line.setXYZ(i * 2, pa.x, pa.y, pa.z)
      const pb = bones.get(b)?.getWorldPosition(this.tmpV)
      if (pb) line.setXYZ(i * 2 + 1, pb.x, pb.y, pb.z)
    })
    line.needsUpdate = true
    const pts = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute
    const followers = new Set(s.follows.map((c) => c.bone))
    POSE_BONES.forEach((n, i) => {
      const p = bones.get(n)?.getWorldPosition(this.tmpV)
      if (p) pts.setXYZ(i, p.x, p.y, p.z)
      const c = n === s.selected ? COLOR_SELECTED : n === s.hovered ? COLOR_HOVER : followers.has(n) ? COLOR_FOLLOW : s.posed.has(n) ? COLOR_POSED : COLOR_JOINT
      col.setXYZ(i, c.r, c.g, c.b)
    })
    pts.needsUpdate = true
    col.needsUpdate = true
    const fl = this.followLines.geometry.getAttribute('position') as THREE.BufferAttribute
    s.follows.forEach((c, i) => {
      const a = bones.get(c.bone)?.getWorldPosition(this.tmpV)
      if (a) fl.setXYZ(i * 2, a.x, a.y, a.z)
      const b = bones.get(c.target)?.getWorldPosition(this.tmpV)
      if (b) fl.setXYZ(i * 2 + 1, b.x, b.y, b.z)
    })
    fl.needsUpdate = true
    this.followLines.geometry.setDrawRange(0, s.follows.length * 2)
    this.followLines.computeLineDistances()
  }

  /** Junta mais perto do ponteiro, dentro de `PICK_PX` na tela (só visível). */
  pick(bones: ReadonlyMap<string, THREE.Object3D>, camera: THREE.Camera, canvas: HTMLCanvasElement, clientX: number, clientY: number): string | null {
    if (!this.group.visible) return null
    const rect = canvas.getBoundingClientRect()
    let best: string | null = null
    let bestD = PICK_PX
    for (const [n, b] of bones) {
      const p = b.getWorldPosition(this.tmpV).project(camera)
      if (p.z > 1) continue
      const x = rect.left + ((p.x + 1) / 2) * rect.width
      const y = rect.top + ((1 - p.y) / 2) * rect.height
      const d = Math.hypot(x - clientX, y - clientY)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }

  dispose(): void {
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.Material).dispose()
    this.points.geometry.dispose()
    const pm = this.points.material as THREE.PointsMaterial
    pm.map?.dispose()
    pm.dispose()
    this.followLines.geometry.dispose()
    ;(this.followLines.material as THREE.Material).dispose()
  }
}
