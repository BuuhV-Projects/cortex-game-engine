import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

/**
 * Entrada do ajuste de pose (SPEC-0349 adendo 8): o gizmo (`TransformControls` no
 * proxy), o clique nas bolinhas/arma (capturado antes do orbit e do gizmo), o
 * arrasto livre no plano da câmera pela junta e o clique no vazio que tira a seleção.
 */

/** Abaixo disso (px) o clique no vazio tira a seleção; acima é o orbit arrastando. */
const CLICK_SLOP_PX = 4

/** O que a entrada pede ao editor. */
export interface PoseInputTarget {
  /** Junta (ou a arma) sob o ponteiro; `null` = vazio. */
  pickAt(clientX: number, clientY: number, ndc: THREE.Vector2): string | null
  /** Clique num alvo: seleciona/escolhe; devolve a posição (mundo) da junta para o arrasto livre, ou `null`. */
  press(target: string): THREE.Vector3 | null
  beginDrag(free: boolean): void
  /** Arrasto: alvo no mundo (livre) ou `null` (o gizmo moveu o proxy). */
  updateDrag(target: THREE.Vector3 | null): void
  endDrag(): void
  deselect(): void
  /** Ponteiro passando: devolve se há junta sob ele (cursor). */
  hover(clientX: number, clientY: number): boolean
}

export class RigPoseInput {
  readonly tc: TransformControls | null = null
  readonly proxy = new THREE.Object3D()
  private plane: THREE.Plane | null = null
  private downAt: { x: number; y: number } | null = null
  private readonly raycaster = new THREE.Raycaster()
  private readonly detach: Array<() => void> = []

  constructor(scene: THREE.Scene, private readonly camera: THREE.Camera, private readonly canvas: HTMLCanvasElement | null, private readonly orbit: OrbitControls | null, private readonly ed: PoseInputTarget) {
    scene.add(this.proxy)
    if (!canvas) return
    const tc = new TransformControls(camera, canvas)
    tc.setSize(0.8)
    tc.addEventListener('dragging-changed', (e) => {
      if (orbit) orbit.enabled = !e.value
    })
    tc.addEventListener('mouseDown', () => ed.beginDrag(false))
    tc.addEventListener('objectChange', () => ed.updateDrag(null))
    tc.addEventListener('mouseUp', () => ed.endDrag())
    scene.add(tc.getHelper())
    this.tc = tc
    // captura no pai do canvas: decide antes do orbit e do gizmo se o clique é numa bolinha
    const view = canvas.parentElement ?? canvas
    const down = (e: PointerEvent): void => this.onDown(e)
    const move = (e: PointerEvent): void => this.onMove(e)
    const up = (e: PointerEvent): void => this.onUp(e)
    view.addEventListener('pointerdown', down, { capture: true })
    view.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    this.detach.push(() => view.removeEventListener('pointerdown', down, { capture: true }), () => view.removeEventListener('pointermove', move), () => window.removeEventListener('pointerup', up))
  }

  /** Gizmo no proxy (`mode` = translate/rotate) ou solto (`null`). */
  gizmo(mode: 'translate' | 'rotate' | null, space: 'world' | 'local'): void {
    const tc = this.tc
    if (!tc) return
    if (mode) {
      tc.setMode(mode)
      tc.setSpace(space)
      if (tc.object !== this.proxy) tc.attach(this.proxy)
    } else if (tc.object) {
      tc.detach()
    }
  }

  private ndcOf(e: PointerEvent): THREE.Vector2 {
    const rect = this.canvas!.getBoundingClientRect()
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  }

  private onDown(e: PointerEvent): void {
    // clique que começa no gizmo nunca tira a seleção (o pointerup dele zera `axis` antes do nosso)
    const onGizmo = !!this.tc?.axis || !!this.tc?.dragging
    this.downAt = onGizmo ? null : { x: e.clientX, y: e.clientY }
    if (e.button !== 0 || onGizmo) return // o gizmo cuida
    const target = this.ed.pickAt(e.clientX, e.clientY, this.ndcOf(e))
    if (!target) return
    e.stopPropagation() // nem o orbit nem o gizmo veem o clique na bolinha
    e.preventDefault()
    this.downAt = null
    const at = this.ed.press(target)
    if (!at) return
    this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), at)
    this.ed.beginDrag(true)
    if (this.orbit) this.orbit.enabled = false
  }

  private onMove(e: PointerEvent): void {
    if (this.plane) {
      this.raycaster.setFromCamera(this.ndcOf(e), this.camera)
      const target = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3())
      if (target) this.ed.updateDrag(target)
      return
    }
    if (this.tc?.dragging || !this.canvas) return
    this.canvas.style.cursor = this.ed.hover(e.clientX, e.clientY) ? 'pointer' : ''
  }

  private onUp(e: PointerEvent): void {
    if (this.plane) {
      this.plane = null
      this.ed.endDrag()
      if (this.orbit) this.orbit.enabled = true
      return
    }
    const at = this.downAt
    this.downAt = null
    // clique no vazio (sem arrastar o orbit, fora do gizmo) tira a seleção
    if (at && e.target === this.canvas && Math.hypot(e.clientX - at.x, e.clientY - at.y) < CLICK_SLOP_PX) this.ed.deselect()
  }

  dispose(): void {
    for (const off of this.detach) off()
    this.tc?.detach()
    this.tc?.dispose()
  }
}
