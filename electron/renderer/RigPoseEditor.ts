import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import type { JsonObject } from './characterRigSelection'
import type { Quat } from './characterRigArmSpace'
import { POSE_BONES, POSE_PARENTS, moveKind, poseDelta, poseOffsets, samePose } from './characterRigPose'
import { FOLLOW_BONES, captureFollow, followProblem, withFollow } from './characterRigFollow'
import { moveJointPose, rotateJointPose, wristTarget, type Snapshot } from './characterRigPoseEdit'
import { DEFAULT_GRIP, GRIP_BONE, PALM, variantKey } from './characterRigWeapon'
import { PoseStore } from './rigPoseStore'
import { RigPoseOverlay } from './RigPoseOverlay'
import { RigPoseInput, type PoseInputTarget } from './RigPoseInput'
import { RigSkeleton, type UndoStack } from './RigSkeleton'
import { RigWeapon } from './RigWeapon'
import { RigPosePanel, WEAPON_SELECTION, boneLabel } from './RigPosePanel'

/**
 * Pose por clipe, junta a junta, na aba **Animações** do painel auto-rig
 * (SPEC-0349, adendo 8): esqueleto por cima do modelo, seleção pelas bolinhas,
 * `TransformControls` (mover/girar), arrasto livre no plano da câmera e Ctrl+Z. A
 * conta fica em `characterRigPose.ts`/`characterRigPoseEdit.ts`, o estado em
 * `rigPoseStore.ts`, os ossos em `RigSkeleton.ts` e o painel em `RigPosePanel.ts`.
 *
 * A prévia aplica por cima do GLB só a diferença entre a pose desejada (config +
 * edição) e a gerada (`poseOffsets` do JSON do skin), depois dos ajustes de braço
 * e na mesma pilha de desfazer do quadro (`undoInReverse`). Adendo 9: ligação
 * "seguir", recalculada sobre o quadro depois da pose. SPEC-0703: arma na mão pela
 * pegada, `Grip_L` como alvo e pose por arma × clipe (`clipe@ARMA`).
 */

const SCOPE = 'characterRig'
const SUPPORT_HAND = 'LeftHand'

export type PoseMode = 'off' | 'move' | 'rotate'

export interface PoseHost {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Canvas do renderer (null sem WebGL). */
  canvas: HTMLCanvasElement | null
  orbit: OrbitControls | null
  /** A pose desejada mudou (selos da lista). */
  onChange: () => void
  /** O usuário trocou a arma (a prévia escolhe a animação: variante assada ou o clipe). */
  onWeapon: (code: string | null) => void
}

interface Drag {
  key: string
  bone: string
  snap: Snapshot
  start: Map<string, Quat>
  /** Rotação de mundo (cena) do proxy do gizmo no começo. */
  proxyStart: THREE.Quaternion
  /** Arrasto livre da bolinha (no plano da câmera), não pelo gizmo. */
  free: boolean
}

const parentOf = (bone: string): string | null => POSE_PARENTS[bone] ?? null

export class RigPoseEditor implements PoseInputTarget {
  readonly ui: RigPosePanel
  readonly store = new PoseStore({ read: (p) => window.electronAPI.readFile(p), write: (p, text) => window.electronAPI.writeFile(p, text) })
  readonly weapon: RigWeapon
  private readonly sk = new RigSkeleton()
  /** Clipe base mostrado e a animação tocada (`clipe@ARMA` quando o build tem a variante). */
  clip: string | null = null
  private anim: string | null = null
  /** "Seguir…": o próximo clique numa junta escolhe o alvo da junta selecionada. */
  pickingFollow = false
  /** Aviso da escolha do alvo (alvo na própria cadeia). */
  followWarn = ''
  /** `skinned.jointLimitsDeg` da config: limite de junta também na prévia (SPEC-0704). */
  limits: Readonly<Record<string, number>> = {}
  /** "Mão esquerda no apoio": captura a ligação no quadro seguinte ao IK. */
  private captureSupport = false

  mode: PoseMode = 'off'
  space: 'world' | 'local' = 'world'
  selected: string | null = null
  private hovered: string | null = null
  private snap: Snapshot | null = null
  private drag: Drag | null = null
  private gripDrag = false

  private readonly overlay = new RigPoseOverlay()
  private readonly input: RigPoseInput

  constructor(private readonly host: PoseHost) {
    this.weapon = new RigWeapon(host.scene)
    this.ui = new RigPosePanel(this)
    host.scene.add(this.overlay.group)
    this.input = new RigPoseInput(host.scene, host.camera, host.canvas, host.orbit, this)
    this.refresh()
  }

  // ── Modelo, config e build ────────────────────────────────────────────────

  /** Novo GLB (antes do mixer: lê o repouso) ou nenhum. */
  setModel(model: THREE.Object3D | null): void {
    this.endDrag()
    this.sk.setModel(model)
    this.snap = null
    this.selected = this.hovered = null
    this.pickingFollow = false
    this.refresh()
  }

  setGenerated(skin: unknown): void {
    this.store.setGenerated(skin)
    this.refresh()
  }

  setConfig(path: string, cfg: JsonObject | null): void {
    this.store.setConfig(path, cfg)
    this.refresh()
  }

  /** GLB das armas do projeto (caminho absoluto): enche o seletor. */
  async setWeaponsGlb(path: string): Promise<void> {
    const had = this.weapon.weapon
    await this.weapon.load(path)
    if (had && !this.weapon.weapon) this.host.onWeapon(null) // outro GLB: a arma sumiu
    this.refresh()
  }

  /** Clipe base mostrado e a animação que a prévia tocou para ele. */
  setClip(name: string | null, anim: string | null = name): void {
    if (name === this.clip && anim === this.anim) return
    this.endDrag()
    this.clip = name
    this.anim = anim
    this.pickingFollow = false
    this.followWarn = ''
    this.refresh()
  }

  /** Troca a arma (o painel confirma antes se há edição não salva). */
  chooseWeapon(code: string | null): void {
    this.endDrag()
    if (this.selected === WEAPON_SELECTION) this.selected = null
    this.weapon.setWeapon(code)
    this.host.onWeapon(this.weapon.weapon)
    this.refresh()
  }

  /** Chave da pose editada: o clipe ou `clipe@ARMA`. */
  get key(): string | null {
    return this.clip ? variantKey(this.clip, this.weapon.weapon) : null
  }

  /** Ossos do GLB mostrado (o assado usa os mesmos). */
  get skeleton(): RigSkeleton {
    return this.sk
  }

  get hasModel(): boolean {
    return !!this.sk.model
  }

  get editable(): boolean {
    return this.hasModel && !!this.key && this.store.editable(this.key)
  }

  /** Selo da lista: a pose do clipe (sem arma) difere do gerado. */
  needsRegen(name: string): boolean {
    return this.hasModel && this.store.needsRegen(name, name)
  }

  /** Estado "gere o rig de novo" da chave mostrada. */
  shownNeedsRegen(): { pose: boolean; follow: boolean } {
    const { key, anim } = this
    if (!this.hasModel || !key || !anim) return { pose: false, follow: false }
    return { pose: this.store.needsRegen(key, anim), follow: this.store.followNeedsRegen(key, anim) }
  }

  generatedCounts(): { count: number; links: number } {
    return { count: this.anim ? this.store.generatedPose(this.anim).size : 0, links: this.anim ? this.store.generatedLinks(this.anim).length : 0 }
  }

  isUnsaved(): boolean {
    return !!this.key && this.store.isUnsaved(this.key)
  }

  /** A junta segue outra na chave mostrada (não se move nem gira à mão). */
  isFollower(bone: string | null): boolean {
    return !!bone && !!this.key && this.store.wantedFollow(this.key).some((c) => c.bone === bone)
  }

  // ── Quadro (laço de desenho) ──────────────────────────────────────────────

  /**
   * Depois do mixer e dos braços: aplica a diferença desejado × gerado e as
   * ligações (cada passo vai para `undoStack`, desfeito em ordem inversa antes do
   * próximo quadro), prende a arma, guarda o quadro mostrado e atualiza o esqueleto.
   */
  apply(undoStack: UndoStack): void {
    const { key, anim, sk } = this
    if (!sk.model || !key || !anim || !sk.bones.size) {
      this.snap = null
      this.overlay.visible = false
      return
    }
    const code = this.weapon.weapon
    const showing = this.overlay.visible || this.mode !== 'off' || !!this.selected || !!code
    const delta = poseDelta(this.store.wanted(key), this.store.generatedPose(anim))
    const follows = this.store.wantedFollow(key)
    if (!delta.size && !follows.length && !showing) return
    const frame = sk.readFrame()
    sk.applyPose(frame, delta, follows, undoStack)
    sk.applyLimitsAndHelpers(this.limits, undoStack)
    if (code) this.weapon.attach(sk.bones.get(GRIP_BONE) ?? null, this.store.grip(code))
    if (this.captureSupport) {
      this.captureSupport = false
      this.linkSupport()
    }
    if (!showing) return
    this.snap = { frame, posed: poseOffsets(POSE_BONES, parentOf, sk.rest, frame, delta), pos: sk.heads() }
    this.updateOverlay()
    this.followProxy()
  }

  private updateOverlay(): void {
    const key = this.key
    this.overlay.update(this.sk.bones, { selected: this.selected, hovered: this.hovered, posed: key ? this.store.wanted(key) : new Map(), follows: key ? this.store.wantedFollow(key) : [] })
  }

  /** O proxy do gizmo acompanha a junta (ou a arma) selecionada, menos durante o arrasto. */
  private followProxy(): void {
    if (this.drag || this.gripDrag) return
    const sel = this.selected
    const o = sel === WEAPON_SELECTION ? (this.weapon.weapon ? this.weapon.holder : undefined) : sel ? this.sk.bones.get(sel) : undefined
    if (!o) return
    const proxy = this.input.proxy
    o.getWorldPosition(proxy.position)
    o.getWorldQuaternion(proxy.quaternion)
    proxy.updateMatrixWorld(true)
  }

  // ── Seleção e modo ────────────────────────────────────────────────────────

  setSkeleton(on: boolean): void {
    this.ui.skeletonInput.checked = on
    this.overlay.visible = on && this.hasModel
    if (!on) this.select(null)
    this.refresh()
  }

  setMode(mode: PoseMode): void {
    this.mode = mode
    if (mode !== 'off' && !this.ui.skeletonInput.checked) this.setSkeleton(true)
    this.refresh()
  }

  toggleSpace(): void {
    this.space = this.space === 'world' ? 'local' : 'world'
    this.refresh()
  }

  select(bone: string | null): void {
    if (bone === this.selected) return
    this.endDrag()
    this.selected = bone
    this.pickingFollow = false
    this.followWarn = ''
    this.followProxy()
    this.refresh()
    this.updateOverlay()
  }

  /** Painel e gizmo de acordo com modo, seleção e clipe. */
  refresh(): void {
    this.ui.render()
    this.overlay.visible = this.ui.skeletonInput.checked && this.hasModel
    const sel = this.selected
    const onWeapon = sel === WEAPON_SELECTION
    const blocked = !onWeapon && (this.isFollower(sel) || (this.mode === 'move' && !!sel && moveKind(sel).kind === 'none'))
    const on = this.editable && !!sel && this.mode !== 'off' && !blocked && !this.pickingFollow
    this.input.gizmo(on ? (this.mode === 'move' ? 'translate' : 'rotate') : null, this.space)
  }

  // ── Entrada (RigPoseInput) ────────────────────────────────────────────────

  pickAt(clientX: number, clientY: number, ndc: THREE.Vector2): string | null {
    if (!this.host.canvas) return null
    const bone = this.overlay.pick(this.sk.bones, this.host.camera, this.host.canvas, clientX, clientY)
    return bone ?? (!this.pickingFollow && this.weapon.hit(this.host.camera, ndc) ? WEAPON_SELECTION : null)
  }

  press(target: string): THREE.Vector3 | null {
    if (this.pickingFollow) {
      this.chooseFollowTarget(target)
      return null
    }
    this.select(target)
    if (target === WEAPON_SELECTION || this.mode !== 'move' || !this.editable || moveKind(target).kind === 'none' || this.isFollower(target)) return null
    return this.sk.bones.get(target)?.getWorldPosition(new THREE.Vector3()) ?? null
  }

  hover(clientX: number, clientY: number): boolean {
    const hovered = this.host.canvas ? this.overlay.pick(this.sk.bones, this.host.camera, this.host.canvas, clientX, clientY) : null
    if (hovered !== this.hovered) {
      this.hovered = hovered
      this.updateOverlay()
    }
    return !!hovered
  }

  deselect(): void {
    this.select(null)
  }

  // ── Edição ────────────────────────────────────────────────────────────────

  beginDrag(free: boolean): void {
    const key = this.key
    const bone = this.selected
    if (!key || !bone || !this.editable) return
    if (bone === WEAPON_SELECTION) {
      this.store.pushUndo(key, this.weapon.weapon ?? undefined)
      this.gripDrag = true
      return
    }
    if (!this.snap || this.isFollower(bone)) return
    const start = this.store.wanted(key)
    this.store.pushUndo(key)
    this.drag = { key, bone, snap: this.snap, start, proxyStart: this.input.proxy.quaternion.clone(), free }
  }

  /** Recalcula a pose a partir do começo do arrasto (gizmo: proxy; livre: `target` no mundo). */
  updateDrag(target: THREE.Vector3 | null): void {
    const model = this.sk.model
    const proxy = this.input.proxy
    if (this.gripDrag) {
      const hand = this.sk.bones.get(GRIP_BONE)
      const code = this.weapon.weapon
      if (hand && code) this.store.setGrip(code, this.weapon.gripFor(hand, proxy.position, proxy.quaternion))
      this.host.onChange()
      this.ui.render()
      return
    }
    const d = this.drag
    if (!d || !model) return
    let next: Map<string, Quat>
    if (!d.free && this.mode === 'rotate') {
      // G no espaço do modelo: M⁻¹ · (proxy · proxy_início⁻¹) · M
      const m = model.getWorldQuaternion(new THREE.Quaternion())
      const gWorld = proxy.quaternion.clone().multiply(d.proxyStart.clone().invert())
      const g = m.clone().invert().multiply(gWorld).multiply(m)
      next = rotateJointPose(d.start, d.snap, this.sk.rest, d.bone, [g.x, g.y, g.z, g.w])
    } else {
      const local = model.worldToLocal((target ?? proxy.position).clone())
      next = moveJointPose(d.start, d.snap, this.sk.rest, d.bone, [local.x, local.y, local.z])
    }
    this.store.setPose(d.key, next)
    this.host.onChange()
    this.ui.render()
  }

  endDrag(): void {
    if (this.gripDrag) {
      this.gripDrag = false
      this.followProxy()
      this.ui.render()
    }
    const d = this.drag
    if (!d) return
    this.drag = null
    // nada mudou: tira a entrada que o começo do arrasto empilhou
    if (samePose(d.start, this.store.wanted(d.key))) this.store.dropUndo(d.key)
    this.followProxy()
    this.ui.render()
  }

  /** A config mudou por fora do arrasto (gravada): selos da lista e painel. */
  changed(): void {
    this.host.onChange()
    this.refresh()
  }

  /** Empilha o desfazer, aplica a edição na chave mostrada e avisa. */
  private edit(fn: (key: string) => void, weapon?: string): void {
    const key = this.key
    if (!key || !this.editable) return
    this.store.pushUndo(key, weapon)
    fn(key)
    this.changed()
  }

  /** Ctrl+Z: volta a pose, as ligações e a pegada da chave às de antes da última edição. */
  undoLast(): boolean {
    const key = this.key
    if (!key || this.drag || this.gripDrag || !this.store.undoLast(key)) return false
    this.changed()
    return true
  }

  /** Leva a mão esquerda ao `Grip_L` (IK) e, no quadro seguinte, liga-a à mão direita. */
  supportHand(): void {
    const grip = this.weapon.gripLWorld()
    const hand = this.sk.bones.get(SUPPORT_HAND)
    const snap = this.snap
    const model = this.sk.model
    if (!grip || !hand || !snap || !model) return
    // a palma (não o pulso) vai ao Grip_L: o pulso fica a PALM da palma, no eixo da mão
    const palm = model.worldToLocal(hand.localToWorld(new THREE.Vector3(...PALM))).sub(model.worldToLocal(hand.getWorldPosition(new THREE.Vector3())))
    const g = model.worldToLocal(grip)
    const local = wristTarget(snap, SUPPORT_HAND, [g.x, g.y, g.z], [palm.x, palm.y, palm.z])
    this.edit((key) => {
      // sem a ligação antiga na mão: a IK parte do quadro mostrado
      this.store.setFollow(key, this.store.wantedFollow(key).filter((c) => c.bone !== SUPPORT_HAND))
      this.store.setPose(key, moveJointPose(this.store.wanted(key), snap, this.sk.rest, SUPPORT_HAND, local))
      this.captureSupport = true
    })
  }

  /** Volta a pegada da arma mostrada ao padrão. */
  resetGrip(): void {
    const code = this.weapon.weapon
    if (code) this.edit(() => this.store.setGrip(code, { ...DEFAULT_GRIP }), code)
  }

  resetBone(bone: string): void {
    if (!this.key || !this.store.wanted(this.key).has(bone)) return
    this.edit((key) => {
      const cur = this.store.wanted(key)
      cur.delete(bone)
      this.store.setPose(key, cur)
    })
  }

  resetClip(): void {
    if (this.key && this.store.wanted(this.key).size) this.edit((key) => this.store.setPose(key, new Map()))
  }

  // ── Ligação "seguir" (adendo 9) ───────────────────────────────────────────

  toggleFollowPick(): void {
    this.pickingFollow = !this.pickingFollow && !!this.selected && FOLLOW_BONES.includes(this.selected) && this.editable
    this.followWarn = ''
    if (this.pickingFollow && !this.ui.skeletonInput.checked) this.setSkeleton(true)
    this.refresh()
  }

  /** Clique numa junta durante "Seguir…": captura a ligação no quadro mostrado. */
  private chooseFollowTarget(target: string): void {
    const bone = this.selected
    if (!bone || target === WEAPON_SELECTION) return
    if (followProblem(bone, target)) {
      this.followWarn = t('characterRig.pose.follow_chain', { bone: boneLabel(bone), target: boneLabel(target) })
      this.refresh()
      return
    }
    this.pickingFollow = false
    this.followWarn = ''
    this.edit((key) => this.addFollow(key, bone, target))
  }

  private addFollow(key: string, bone: string, target: string): void {
    const link = captureFollow(bone, target, this.sk.rest, this.sk.readFrame(), this.sk.heads())
    this.store.setFollow(key, withFollow(this.store.wantedFollow(key), link))
    debug(SCOPE, 'ligação seguir', key, bone, '→', target)
  }

  /** Mão de apoio → mão da arma, sem empilhar o desfazer (o `supportHand` já empilhou). */
  private linkSupport(): void {
    const key = this.key
    if (!key || !this.editable) return
    this.addFollow(key, SUPPORT_HAND, GRIP_BONE)
    this.changed()
  }

  removeFollow(bone: string): void {
    this.edit((key) => this.store.setFollow(key, this.store.wantedFollow(key).filter((c) => c.bone !== bone)))
  }

  dispose(): void {
    this.input.dispose()
    this.overlay.dispose()
    this.weapon.dispose()
  }
}
