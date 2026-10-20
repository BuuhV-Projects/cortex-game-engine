import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { splitPath } from './characterRigRegistry'
import { parseConfigObject, serializeConfig, type JsonObject } from './characterRigSelection'
import { localAfterWorldRotation, quatMul, type Quat, type Vec3 } from './characterRigArmSpace'
import {
  POSE_BONES,
  POSE_PARENTS,
  aimParent,
  applyPoseToAll,
  applyPoses,
  correctionOf,
  editPose,
  isIdentity,
  moveKind,
  parentTurn,
  poseCorrections,
  poseDelta,
  poseOffsets,
  posesFromConfig,
  posesFromSkin,
  quatAngleDeg,
  samePose,
  twoBoneIk,
  type Pose,
} from './characterRigPose'

/**
 * Pose por clipe, junta a junta, na aba **Animações** do painel auto-rig
 * (SPEC-0349, adendo 8): esqueleto por cima do modelo, seleção pelas bolinhas,
 * `TransformControls` (mover/girar), arrasto livre no plano da câmera, Ctrl+Z e o
 * painel "Pose (deste clipe)". A conta fica em `characterRigPose.ts`.
 *
 * A prévia aplica por cima do GLB só a diferença entre a pose desejada (config +
 * edição) e a gerada (`poseOffsets` do JSON do skin), depois dos ajustes de braço
 * e na mesma pilha de desfazer do quadro (`undoInReverse`).
 */

const SCOPE = 'characterRig'
/** Raio de seleção das bolinhas, em pixels de tela. */
const PICK_PX = 12
/** Abaixo disso (px) o clique no vazio tira a seleção; acima é o orbit arrastando. */
const CLICK_SLOP_PX = 4
const POINT_PX = 10
const COLOR_JOINT = new THREE.Color(0x22d3ee)
const COLOR_POSED = new THREE.Color(0xfb923c)
const COLOR_HOVER = new THREE.Color(0xffffff)
const COLOR_SELECTED = new THREE.Color(0xf5c451)
/** Desenha por cima da malha. */
const OVERLAY_ORDER = 999

export type PoseMode = 'off' | 'move' | 'rotate'

export interface PoseHost {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Canvas do renderer (null sem WebGL). */
  canvas: HTMLCanvasElement | null
  orbit: OrbitControls | null
  /** A pose desejada mudou (selos da lista). */
  onChange: () => void
}

/** O quadro mostrado no começo de uma edição, no espaço do modelo. */
interface Snapshot {
  /** W antes da pose (depois do mixer e dos braços). */
  frame: Map<string, Quat>
  /** W' mostrado (com a diferença da pose). */
  posed: Map<string, Quat>
  /** Posição de cada junta mostrada. */
  pos: Map<string, Vec3>
}

interface Drag {
  clip: string
  bone: string
  snap: Snapshot
  start: Map<string, Quat>
  /** Rotação de mundo (cena) do proxy do gizmo no começo. */
  proxyStart: THREE.Quaternion
  /** Arrasto livre da bolinha: plano da câmera pela junta. */
  plane: THREE.Plane | null
}

function toQuat(q: THREE.Quaternion): Quat {
  return [q.x, q.y, q.z, q.w]
}

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

export class RigPoseEditor {
  readonly panel: HTMLElement
  private readonly skeletonInput: HTMLInputElement
  private readonly moveBtn: HTMLButtonElement
  private readonly rotateBtn: HTMLButtonElement
  private readonly spaceBtn: HTMLButtonElement
  private readonly selectedEl: HTMLElement
  private readonly modeHintEl: HTMLElement
  private readonly bonesEl: HTMLElement
  private readonly resetClipBtn: HTMLButtonElement
  private readonly stateEl: HTMLElement
  private readonly saveBtn: HTMLButtonElement
  private readonly allBtn: HTMLButtonElement

  private model: THREE.Object3D | null = null
  private readonly bones = new Map<string, THREE.Object3D>()
  /** W de cada osso no repouso do GLB (antes do mixer), no espaço do modelo. */
  private rest = new Map<string, Quat>()
  private clip: string | null = null

  private configPath = ''
  private saved = new Map<string, Map<string, Quat>>()
  private edited = new Map<string, Map<string, Quat>>()
  private generated = new Map<string, Map<string, Quat>>()
  /** Pilha de desfazer por clipe (só da sessão): a pose antes de cada edição. */
  private readonly undo = new Map<string, Map<string, Quat>[]>()

  private mode: PoseMode = 'off'
  private space: 'world' | 'local' = 'world'
  private selected: string | null = null
  private hovered: string | null = null
  private snap: Snapshot | null = null
  private drag: Drag | null = null
  private downAt: { x: number; y: number } | null = null

  private readonly overlay = new THREE.Group()
  private readonly lines: THREE.LineSegments
  private readonly points: THREE.Points
  private readonly segments: Array<[string, string]> = POSE_BONES.filter((n) => parentOf(n)).map((n) => [parentOf(n)!, n])
  private readonly tc: TransformControls | null = null
  private readonly proxy = new THREE.Object3D()
  private readonly raycaster = new THREE.Raycaster()
  private readonly tmpV = new THREE.Vector3()
  private readonly tmpQ = new THREE.Quaternion()
  private readonly tmpQ2 = new THREE.Quaternion()
  private readonly detach: Array<() => void> = []

  constructor(private readonly host: PoseHost) {
    this.skeletonInput = h('input', { type: 'checkbox' }) as HTMLInputElement
    this.skeletonInput.addEventListener('change', () => this.setSkeleton(this.skeletonInput.checked))
    this.moveBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary rig-pose__mode', type: 'button', onClick: () => this.setMode(this.mode === 'move' ? 'off' : 'move') }, t('characterRig.pose.move')) as HTMLButtonElement
    this.rotateBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary rig-pose__mode', type: 'button', onClick: () => this.setMode(this.mode === 'rotate' ? 'off' : 'rotate') }, t('characterRig.pose.rotate')) as HTMLButtonElement
    this.spaceBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary rig-pose__space', type: 'button', onClick: () => this.toggleSpace() }) as HTMLButtonElement
    this.selectedEl = h('div', { class: 'rig-pose__selected' })
    this.modeHintEl = h('div', { class: 'rig-pose__hint' })
    this.bonesEl = h('div', { class: 'rig-pose__bones' })
    this.resetClipBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => this.resetClip() }, t('characterRig.pose.reset_clip')) as HTMLButtonElement
    this.stateEl = h('div', { class: 'rig-arm__state rig-pose__state' })
    this.saveBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.save() }, t('characterRig.pose.save')) as HTMLButtonElement
    this.allBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', title: t('characterRig.pose.apply_all_hint'), onClick: () => void this.applyToAll() }, t('characterRig.pose.apply_all')) as HTMLButtonElement

    this.panel = h('aside', { class: 'rig-side rig-pose', title: t('characterRig.pose.hint') },
      h('div', { class: 'rig-side__title' }, t('characterRig.pose.title')),
      h('label', { class: 'rig-check rig-pose__row' }, this.skeletonInput, h('span', {}, t('characterRig.pose.skeleton'))),
      h('div', { class: 'rig-pose__row' }, this.moveBtn, this.rotateBtn),
      h('div', { class: 'rig-pose__row' }, this.spaceBtn),
      this.selectedEl,
      this.modeHintEl,
      this.bonesEl,
      h('div', { class: 'rig-pose__row' }, this.resetClipBtn),
      this.stateEl,
      h('div', { class: 'rig-pose__row' }, this.allBtn, this.saveBtn))

    // esqueleto: linhas e bolinhas sem teste de profundidade (aparecem através da malha)
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.segments.length * 6), 3))
    this.lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: COLOR_JOINT, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 }))
    const pointGeo = new THREE.BufferGeometry()
    pointGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POSE_BONES.length * 3), 3))
    pointGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(POSE_BONES.length * 3), 3))
    this.points = new THREE.Points(pointGeo, new THREE.PointsMaterial({ size: POINT_PX, sizeAttenuation: false, vertexColors: true, map: circleTexture(), alphaTest: 0.5, depthTest: false, depthWrite: false, transparent: true }))
    for (const o of [this.lines, this.points]) {
      o.renderOrder = OVERLAY_ORDER
      o.frustumCulled = false
    }
    this.overlay.add(this.lines, this.points)
    this.overlay.visible = false
    host.scene.add(this.overlay, this.proxy)

    const canvas = host.canvas
    if (canvas) {
      const tc = new TransformControls(host.camera, canvas)
      tc.setSize(0.8)
      tc.addEventListener('dragging-changed', (e) => {
        if (host.orbit) host.orbit.enabled = !e.value
      })
      tc.addEventListener('mouseDown', () => this.beginDrag(null))
      tc.addEventListener('objectChange', () => this.updateDrag(null))
      tc.addEventListener('mouseUp', () => this.endDrag())
      host.scene.add(tc.getHelper())
      this.tc = tc
      // captura no pai do canvas: decide antes do orbit e do gizmo se o clique é numa bolinha
      const view = canvas.parentElement ?? canvas
      const down = (e: PointerEvent): void => this.onPointerDown(e)
      const move = (e: PointerEvent): void => this.onPointerMove(e)
      const up = (e: PointerEvent): void => this.onPointerUp(e)
      view.addEventListener('pointerdown', down, { capture: true })
      view.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      this.detach.push(() => view.removeEventListener('pointerdown', down, { capture: true }), () => view.removeEventListener('pointermove', move), () => window.removeEventListener('pointerup', up))
    }
    this.syncControls()
    this.renderPanel()
  }

  // ── Modelo, config e build ────────────────────────────────────────────────

  /** Novo GLB (antes do mixer: lê o repouso) ou nenhum. */
  setModel(model: THREE.Object3D | null): void {
    this.endDrag()
    this.model = model
    this.bones.clear()
    this.rest = new Map()
    this.snap = null
    this.selected = this.hovered = null
    if (model) {
      model.updateMatrixWorld(true)
      for (const n of POSE_BONES) {
        const b = model.getObjectByName(n)
        if (b?.parent) this.bones.set(n, b)
      }
      if (this.bones.size !== POSE_BONES.length) debug(SCOPE, 'rig sem todos os ossos Mixamo (pose)', POSE_BONES.filter((n) => !this.bones.has(n)))
      for (const [n, b] of this.bones) this.rest.set(n, this.modelQuat(b))
    }
    this.syncControls()
    this.renderPanel()
  }

  /** `poseOffsets` por clipe do JSON do skin do build (`null` = ilegível = vazio). */
  setGenerated(skin: unknown): void {
    this.generated = posesFromSkin(skin)
    this.renderPanel()
  }

  /** Pose da config no disco. Mesma config: edição ainda não salva continua; outra: começa do disco. */
  setConfig(path: string, cfg: JsonObject | null): void {
    this.saved = cfg ? posesFromConfig(cfg) : new Map()
    if (path !== this.configPath) {
      this.edited = new Map()
      this.undo.clear()
    } else {
      for (const name of [...this.edited.keys()]) if (!this.isUnsaved(name)) this.edited.delete(name)
    }
    this.configPath = path
    this.renderPanel()
  }

  /** Clipe mostrado (a pose é dele). */
  setClip(name: string | null): void {
    if (name === this.clip) return
    this.endDrag()
    this.clip = name
    this.renderPanel()
  }

  private wanted(name: string): Map<string, Quat> {
    return this.edited.get(name) ?? this.saved.get(name) ?? new Map()
  }

  private generatedOf(name: string): Map<string, Quat> {
    return this.generated.get(name) ?? new Map()
  }

  /** A pose desejada difere da gerada no GLB mostrado. */
  needsRegen(name: string): boolean {
    return !!this.model && this.saved.has(name) && !samePose(this.wanted(name), this.generatedOf(name))
  }

  isUnsaved(name: string | null = this.clip): boolean {
    const v = name ? this.edited.get(name) : undefined
    return !!v && !samePose(v, this.saved.get(name!) ?? new Map())
  }

  private get editable(): boolean {
    return !!this.clip && this.saved.has(this.clip)
  }

  // ── Quadro (laço de desenho) ──────────────────────────────────────────────

  private modelQuat(o: THREE.Object3D): Quat {
    this.model!.getWorldQuaternion(this.tmpQ2).invert()
    return toQuat(this.tmpQ2.multiply(o.getWorldQuaternion(this.tmpQ)))
  }

  private modelPos(o: THREE.Object3D): Vec3 {
    const v = this.model!.worldToLocal(o.getWorldPosition(this.tmpV))
    return [v.x, v.y, v.z]
  }

  private readFrame(): Map<string, Quat> {
    const out = new Map<string, Quat>()
    for (const [n, b] of this.bones) out.set(n, this.modelQuat(b))
    return out
  }

  /**
   * Depois do mixer e dos braços: aplica a diferença desejado × gerado (cada
   * passo vai para `undoStack`, desfeito em ordem inversa antes do próximo
   * quadro), guarda o quadro mostrado e atualiza esqueleto e gizmo.
   */
  apply(undoStack: Array<[THREE.Object3D, THREE.Quaternion]>): void {
    const name = this.clip
    if (!this.model || !name || !this.bones.size) {
      this.snap = null
      this.overlay.visible = false
      return
    }
    const showing = this.overlay.visible || this.mode !== 'off' || !!this.selected
    const delta = poseDelta(this.wanted(name), this.generatedOf(name))
    if (!delta.size && !showing) return
    const frame = this.readFrame()
    if (delta.size) {
      const corr = poseCorrections(POSE_BONES, parentOf, this.rest, frame, delta)
      for (const n of POSE_BONES) {
        const x = corr.get(n)
        const b = this.bones.get(n)
        if (!x || !b?.parent) continue
        undoStack.push([b, b.quaternion.clone()])
        const local = localAfterWorldRotation(this.modelQuat(b.parent), toQuat(b.quaternion), x)
        b.quaternion.set(local[0], local[1], local[2], local[3])
      }
    }
    if (!showing) return
    const pos = new Map<string, Vec3>()
    for (const [n, b] of this.bones) pos.set(n, this.modelPos(b))
    this.snap = { frame, posed: poseOffsets(POSE_BONES, parentOf, this.rest, frame, delta), pos }
    this.updateOverlay()
    this.followProxy()
  }

  private updateOverlay(): void {
    if (!this.overlay.visible) return
    const line = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute
    this.segments.forEach(([a, b], i) => {
      const pa = this.bones.get(a)?.getWorldPosition(this.tmpV)
      if (pa) line.setXYZ(i * 2, pa.x, pa.y, pa.z)
      const pb = this.bones.get(b)?.getWorldPosition(this.tmpV)
      if (pb) line.setXYZ(i * 2 + 1, pb.x, pb.y, pb.z)
    })
    line.needsUpdate = true
    const pts = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute
    const posed = this.clip ? this.wanted(this.clip) : new Map()
    POSE_BONES.forEach((n, i) => {
      const p = this.bones.get(n)?.getWorldPosition(this.tmpV)
      if (p) pts.setXYZ(i, p.x, p.y, p.z)
      const c = n === this.selected ? COLOR_SELECTED : n === this.hovered ? COLOR_HOVER : posed.has(n) ? COLOR_POSED : COLOR_JOINT
      col.setXYZ(i, c.r, c.g, c.b)
    })
    pts.needsUpdate = true
    col.needsUpdate = true
  }

  /** O proxy do gizmo acompanha a junta selecionada (menos durante o arrasto). */
  private followProxy(): void {
    const b = this.selected ? this.bones.get(this.selected) : undefined
    if (!b || this.drag) return
    b.getWorldPosition(this.proxy.position)
    b.getWorldQuaternion(this.proxy.quaternion)
    this.proxy.updateMatrixWorld(true)
  }

  // ── Seleção e modo ────────────────────────────────────────────────────────

  private setSkeleton(on: boolean): void {
    this.skeletonInput.checked = on
    this.overlay.visible = on && !!this.model
    if (!on) this.select(null)
    this.syncControls()
  }

  setMode(mode: PoseMode): void {
    this.mode = mode
    if (mode !== 'off' && !this.skeletonInput.checked) this.setSkeleton(true)
    this.syncControls()
  }

  private toggleSpace(): void {
    this.space = this.space === 'world' ? 'local' : 'world'
    this.syncControls()
  }

  private select(bone: string | null): void {
    if (bone === this.selected) return
    this.endDrag()
    this.selected = bone
    this.followProxy()
    this.syncControls()
    this.updateOverlay()
  }

  /** Gizmo, botões e textos de acordo com modo, seleção e clipe. */
  private syncControls(): void {
    this.moveBtn.classList.toggle('on', this.mode === 'move')
    this.rotateBtn.classList.toggle('on', this.mode === 'rotate')
    this.spaceBtn.textContent = t(this.space === 'world' ? 'characterRig.pose.space_world' : 'characterRig.pose.space_local')
    const enabled = !!this.model && this.editable
    this.moveBtn.disabled = this.rotateBtn.disabled = this.spaceBtn.disabled = !enabled
    this.skeletonInput.disabled = !this.model
    this.overlay.visible = this.skeletonInput.checked && !!this.model
    const bone = this.selected
    this.selectedEl.textContent = bone ? t('characterRig.pose.selected', { bone }) : t('characterRig.pose.none_selected')
    const hipsMove = this.mode === 'move' && !!bone && moveKind(bone).kind === 'none'
    this.modeHintEl.textContent = hipsMove ? t('characterRig.pose.hips_fixed') : this.mode === 'move' ? t('characterRig.pose.move_hint') : this.mode === 'rotate' ? t('characterRig.pose.rotate_hint') : ''
    this.modeHintEl.classList.toggle('warn', hipsMove)
    const tc = this.tc
    if (!tc) return
    const attach = enabled && !!bone && this.mode !== 'off' && !hipsMove
    if (attach) {
      tc.setMode(this.mode === 'move' ? 'translate' : 'rotate')
      tc.setSpace(this.space)
      if (tc.object !== this.proxy) tc.attach(this.proxy)
    } else if (tc.object) {
      tc.detach()
    }
  }

  /** Junta mais perto do ponteiro, dentro de `PICK_PX` na tela. */
  private pick(clientX: number, clientY: number): string | null {
    const canvas = this.host.canvas
    if (!canvas || !this.overlay.visible) return null
    const rect = canvas.getBoundingClientRect()
    let best: string | null = null
    let bestD = PICK_PX
    for (const [n, b] of this.bones) {
      const p = b.getWorldPosition(this.tmpV).project(this.host.camera)
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

  private onPointerDown(e: PointerEvent): void {
    this.downAt = { x: e.clientX, y: e.clientY }
    if (e.button !== 0 || this.tc?.axis || this.tc?.dragging) return // o gizmo cuida
    const bone = this.pick(e.clientX, e.clientY)
    if (!bone) return
    e.stopPropagation() // nem o orbit nem o gizmo veem o clique na bolinha
    e.preventDefault()
    this.downAt = null
    this.select(bone)
    if (this.mode !== 'move' || !this.editable || moveKind(bone).kind === 'none') return
    const b = this.bones.get(bone)!
    const normal = this.host.camera.getWorldDirection(new THREE.Vector3())
    this.beginDrag(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, b.getWorldPosition(new THREE.Vector3())))
    if (this.host.orbit) this.host.orbit.enabled = false
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.drag?.plane) {
      this.updateDrag(e)
      return
    }
    if (this.tc?.dragging) return
    const hovered = this.pick(e.clientX, e.clientY)
    if (hovered !== this.hovered) {
      this.hovered = hovered
      this.updateOverlay()
      if (this.host.canvas) this.host.canvas.style.cursor = hovered ? 'pointer' : ''
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.drag?.plane) {
      this.endDrag()
      if (this.host.orbit) this.host.orbit.enabled = true
      return
    }
    const at = this.downAt
    this.downAt = null
    // clique no vazio (sem arrastar o orbit, fora do gizmo) tira a seleção
    if (at && e.target === this.host.canvas && !this.tc?.axis && Math.hypot(e.clientX - at.x, e.clientY - at.y) < CLICK_SLOP_PX) this.select(null)
  }

  // ── Edição ────────────────────────────────────────────────────────────────

  private beginDrag(plane: THREE.Plane | null): void {
    const clip = this.clip
    const bone = this.selected
    if (!clip || !bone || !this.snap || !this.editable) return
    const start = new Map(this.wanted(clip))
    this.pushUndo(clip, start)
    this.drag = { clip, bone, snap: this.snap, start, proxyStart: this.proxy.quaternion.clone(), plane }
  }

  /** Recalcula a pose a partir do começo do arrasto (gizmo: proxy; livre: ponteiro no plano). */
  private updateDrag(e: PointerEvent | null): void {
    const d = this.drag
    if (!d || !this.model) return
    const next = new Map(d.start)
    if (!d.plane && this.mode === 'rotate') {
      // G no espaço do modelo: M⁻¹ · (proxy · proxy_início⁻¹) · M
      const m = this.model.getWorldQuaternion(new THREE.Quaternion())
      const gWorld = this.proxy.quaternion.clone().multiply(d.proxyStart.clone().invert())
      const g = toQuat(m.clone().invert().multiply(gWorld).multiply(m))
      this.setBone(next, d.bone, this.edited1(d, d.bone, g))
    } else {
      let target: THREE.Vector3 | null
      if (d.plane && e) {
        const canvas = this.host.canvas!
        const rect = canvas.getBoundingClientRect()
        const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
        this.raycaster.setFromCamera(ndc, this.host.camera)
        target = this.raycaster.ray.intersectPlane(d.plane, new THREE.Vector3())
      } else {
        target = this.proxy.position.clone()
      }
      if (!target) return
      const local = this.model.worldToLocal(target)
      this.moveJoint(next, d, [local.x, local.y, local.z])
    }
    this.edited.set(d.clip, next)
    this.host.onChange()
    this.renderPanel()
  }

  /** R novo de um osso pela rotação de mundo G (quadro do começo do arrasto). */
  private edited1(d: Drag, bone: string, g: Quat, extraCorrection?: Quat): Quat {
    const p = parentOf(bone)
    const P = parentTurn(p, this.rest, d.snap.frame)
    const C0 = correctionOf(p, d.snap.frame, d.snap.posed)
    const C = extraCorrection ? quatMul(extraCorrection, C0) : C0
    return editPose(d.start.get(bone) ?? [0, 0, 0, 1], P, C, g)
  }

  /** Mover a junta: IK na mão/pé, apontar o pai nas outras, nada no `Hips`. */
  private moveJoint(next: Map<string, Quat>, d: Drag, target: Vec3): void {
    const how = moveKind(d.bone)
    const pos = d.snap.pos
    if (how.kind === 'ik') {
      const a = pos.get(how.upper)
      const b = pos.get(how.lower)
      const c = pos.get(d.bone)
      if (!a || !b || !c) return
      const { upper, lower } = twoBoneIk(a, b, c, target)
      this.setBone(next, how.upper, this.edited1(d, how.upper, upper))
      // o antebraço/perna herda o giro do de cima: C do pai passa a ser upper · C
      this.setBone(next, how.lower, this.edited1(d, how.lower, lower, upper))
    } else if (how.kind === 'aim') {
      const a = pos.get(how.parent)
      const c = pos.get(d.bone)
      if (!a || !c) return
      this.setBone(next, how.parent, this.edited1(d, how.parent, aimParent(a, c, target)))
    }
  }

  private setBone(pose: Map<string, Quat>, bone: string, r: Quat): void {
    if (isIdentity(r)) pose.delete(bone)
    else pose.set(bone, r)
  }

  private endDrag(): void {
    const d = this.drag
    if (!d) return
    this.drag = null
    // nada mudou: tira a entrada que o começo do arrasto empilhou
    if (samePose(d.start, this.wanted(d.clip))) this.undo.get(d.clip)?.pop()
    this.followProxy()
    this.renderPanel()
  }

  private pushUndo(clip: string, pose: Map<string, Quat>): void {
    const stack = this.undo.get(clip) ?? []
    stack.push(new Map(pose))
    this.undo.set(clip, stack)
  }

  /** Ctrl+Z: volta a pose do clipe à de antes da última edição. */
  undoLast(): boolean {
    const clip = this.clip
    const prev = clip ? this.undo.get(clip)?.pop() : undefined
    if (!clip || !prev || this.drag) return false
    this.edited.set(clip, prev)
    this.host.onChange()
    this.renderPanel()
    return true
  }

  private resetBone(bone: string): void {
    const clip = this.clip
    if (!clip || !this.editable) return
    const cur = this.wanted(clip)
    if (!cur.has(bone)) return
    this.pushUndo(clip, cur)
    const next = new Map(cur)
    next.delete(bone)
    this.edited.set(clip, next)
    this.host.onChange()
    this.renderPanel()
  }

  private resetClip(): void {
    const clip = this.clip
    if (!clip || !this.editable || !this.wanted(clip).size) return
    this.pushUndo(clip, this.wanted(clip))
    this.edited.set(clip, new Map())
    this.host.onChange()
    this.renderPanel()
  }

  /** Teclas da aba (W, E, Esc, Ctrl+Z). `true` se usou a tecla. */
  handleKey(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return false
    const key = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') return this.undoLast()
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    if (key === 'escape' && this.selected) {
      this.select(null)
      return true
    }
    if (!this.model || !this.editable) return false
    if (key === 'w') this.setMode('move')
    else if (key === 'e') this.setMode('rotate')
    else return false
    return true
  }

  // ── Painel ────────────────────────────────────────────────────────────────

  private renderPanel(): void {
    const name = this.clip
    const editable = !!this.model && this.editable
    const pose = name ? this.wanted(name) : new Map<string, Quat>()
    this.bonesEl.textContent = ''
    if (editable && !pose.size) this.bonesEl.append(h('div', { class: 'rig-pose__empty' }, t('characterRig.pose.bones_empty')))
    for (const bone of POSE_BONES) {
      const q = pose.get(bone)
      if (!q || !editable) continue
      this.bonesEl.append(h('div', { class: `rig-pose__bone${bone === this.selected ? ' on' : ''}` },
        h('button', { class: 'rig-pose__bone-name', type: 'button', onClick: () => this.select(bone) }, bone),
        h('span', { class: 'rig-anim__tcode' }, `${quatAngleDeg(q).toFixed(1)}°`),
        h('button', { class: 'export-modal__btn export-modal__btn--secondary rig-arm__reset', type: 'button', onClick: () => this.resetBone(bone) }, t('characterRig.pose.reset_bone'))))
    }
    this.resetClipBtn.disabled = !editable || !pose.size
    this.saveBtn.disabled = ![...this.edited.keys()].some((n) => this.isUnsaved(n))
    this.allBtn.disabled = !editable || this.saved.size < 2
    this.stateEl.classList.remove('warn')
    if (!name) this.stateEl.textContent = t('characterRig.pose.no_clip')
    else if (!this.saved.has(name)) {
      this.stateEl.textContent = t('characterRig.pose.not_in_config', { name })
      this.stateEl.classList.add('warn')
    } else {
      const parts = [t('characterRig.pose.generated', { count: this.generatedOf(name).size })]
      if (this.needsRegen(name)) {
        parts.push(t('characterRig.pose.regen'))
        this.stateEl.classList.add('warn')
      }
      if (this.isUnsaved(name)) parts.push(t('characterRig.pose.unsaved'))
      this.stateEl.textContent = parts.join(' ')
    }
    this.syncControls()
  }

  /**
   * Relê a config do disco e grava as poses pendentes (identidade sai; sem ossos
   * remove o campo), só se o texto muda. `false` se não conseguiu gravar.
   */
  async save(): Promise<boolean> {
    const path = this.configPath
    const pending = new Map([...this.edited].filter(([n]) => this.isUnsaved(n)))
    if (!path || !pending.size) return true
    try {
      const before = stripBom(await window.electronAPI.readFile(path))
      const next = applyPoses(parseConfigObject(before), pending)
      const text = serializeConfig(next)
      if (text !== before) {
        await window.electronAPI.writeFile(path, text)
        debug(SCOPE, 'pose gravada', path, [...pending.keys()])
      }
      this.saved = posesFromConfig(next)
      this.edited = new Map()
      this.host.onChange()
      this.renderPanel()
      this.stateEl.textContent = `${this.stateEl.textContent} ${t('characterRig.pose.saved', { file: splitPath(path).name })}`
      return true
    } catch (err) {
      this.stateEl.textContent = t('characterRig.save_failed', { error: err instanceof Error ? err.message : String(err) })
      this.stateEl.classList.add('warn')
      return false
    }
  }

  /** A pose do clipe atual em todos os clipes de `skinned.clips` (confirma e grava na hora). */
  async applyToAll(): Promise<boolean> {
    const path = this.configPath
    const name = this.clip
    if (!path || !name || !this.saved.has(name)) return false
    const pose: Pose = new Map(this.wanted(name))
    try {
      const before = stripBom(await window.electronAPI.readFile(path))
      const cfg = parseConfigObject(before)
      const count = posesFromConfig(cfg).size
      if (!(await window.electronAPI.confirmDialog(t('characterRig.pose.apply_all_confirm', { name, count, bones: pose.size })))) return false
      const next = applyPoseToAll(cfg, pose)
      const text = serializeConfig(next)
      if (text !== before) {
        await window.electronAPI.writeFile(path, text)
        debug(SCOPE, 'pose aplicada a todos os clipes', path, { from: name, count, bones: [...pose.keys()] })
      }
      this.saved = posesFromConfig(next)
      this.edited = new Map()
      this.host.onChange()
      this.renderPanel()
      this.stateEl.textContent = `${this.stateEl.textContent} ${t('characterRig.pose.applied_all', { count, file: splitPath(path).name })}`
      return true
    } catch (err) {
      this.stateEl.textContent = t('characterRig.save_failed', { error: err instanceof Error ? err.message : String(err) })
      this.stateEl.classList.add('warn')
      return false
    }
  }

  dispose(): void {
    for (const off of this.detach) off()
    this.tc?.detach()
    this.tc?.dispose()
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.Material).dispose()
    this.points.geometry.dispose()
    const pm = this.points.material as THREE.PointsMaterial
    pm.map?.dispose()
    pm.dispose()
  }
}

/** Tira o BOM do começo do texto. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
