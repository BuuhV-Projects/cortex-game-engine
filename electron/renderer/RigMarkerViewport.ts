import * as THREE from 'three'
import { centeringOffset, type Box, type DisplayFrame, type Vec3 } from './characterRig'

/**
 * Viewport dos marcadores do character-auto-rig (SPEC-0349): câmera ortográfica
 * frontal (olha para −Z) com o modelo girado por `transform.rotateZDeg` em torno
 * de Y e centralizado em x = 0 (o "espaço exibido" de `characterRig.ts`).
 * Zoom no cursor, pan arrastando o fundo e duplo clique reenquadra; a cena só é
 * redesenhada quando algo muda (`onRedraw`, sem loop).
 */

/** Tamanho da vista ortográfica em alturas do modelo (margem acima/abaixo). */
const VIEW_MARGIN = 1.12
const ZOOM_STEP = 1.15
const ZOOM_MIN = 0.3
const ZOOM_MAX = 25
const MAX_PIXEL_RATIO = 2
/** Distância da câmera à frente do modelo, em alturas do modelo. */
const CAMERA_DISTANCE = 5
/** Plano distante da câmera, em alturas do modelo. */
const CAMERA_FAR = 20
const CAMERA_NEAR = 0.001
const HEMI_SKY = 0xffffff
const HEMI_GROUND = 0x404050
const HEMI_INTENSITY = 2.0
const KEY_COLOR = 0xffffff
const KEY_INTENSITY = 2.2
/** Luz principal de frente (+Z), um pouco de cima/lado. */
const KEY_POSITION: Vec3 = [1.5, 3, 4]
/** Seletor dos marcadores do overlay: arrastar/duplo clique neles não move a câmera. */
const MARKER_SELECTOR = '.rig-marker'

/** Acompanha um arraste (move/up na janela) até soltar. */
export function trackPointer(start: PointerEvent, onMove: (ev: PointerEvent) => void, onUp?: (ev: PointerEvent) => void): void {
  const id = start.pointerId
  const move = (ev: PointerEvent): void => {
    if (ev.pointerId === id) onMove(ev)
  }
  const up = (ev: PointerEvent): void => {
    if (ev.pointerId !== id) return
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    onUp?.(ev)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

export class RigMarkerViewport {
  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000)
  private readonly raycaster = new THREE.Raycaster()
  private pivot: THREE.Group | null = null
  private viewHeight = 2
  frame: DisplayFrame = { rotateYDeg: 0, offset: [0, 0, 0] }
  box: Box | null = null

  /** `onNoWebgl`: sem WebGL o painel abre, mas sem vista (não dá para marcar). */
  constructor(
    private readonly viewEl: HTMLElement,
    private readonly overlay: SVGSVGElement,
    private readonly onRedraw: () => void,
    onNoWebgl: (err: unknown) => void,
  ) {
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.className = 'rig-canvas'
      viewEl.prepend(renderer.domElement)
      this.renderer = renderer
    } catch (err) {
      onNoWebgl(err)
    }
    const hemi = new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY)
    const key = new THREE.DirectionalLight(KEY_COLOR, KEY_INTENSITY)
    key.position.set(...KEY_POSITION)
    this.scene.add(hemi, key)
    new ResizeObserver(() => this.resize()).observe(viewEl)
    this.bindView()
  }

  get hasModel(): boolean {
    return !!this.pivot
  }

  get modelHeight(): number {
    return this.box ? this.box.max[1] - this.box.min[1] : 1
  }

  get width(): number {
    return this.viewEl.clientWidth || 1
  }

  get height(): number {
    return this.viewEl.clientHeight || 1
  }

  render(): void {
    this.renderer?.render(this.scene, this.camera)
  }

  private resize(): void {
    this.renderer?.setSize(this.width, this.height, false)
    this.overlay.setAttribute('width', String(this.width))
    this.overlay.setAttribute('height', String(this.height))
    this.updateFrustum()
    this.onRedraw()
  }

  private updateFrustum(): void {
    const aspect = this.width / this.height
    const half = this.viewHeight / 2
    this.camera.left = -half * aspect
    this.camera.right = half * aspect
    this.camera.top = half
    this.camera.bottom = -half
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }

  /** Enquadra o modelo inteiro de frente (zoom 1, centrado em x = 0). */
  private frameModel(): void {
    if (!this.box) return
    const height = this.box.max[1] - this.box.min[1] || 1
    this.viewHeight = height * VIEW_MARGIN
    this.camera.zoom = 1
    this.camera.position.set(0, (this.box.min[1] + this.box.max[1]) / 2, this.box.max[2] + height * CAMERA_DISTANCE)
    this.camera.near = CAMERA_NEAR
    this.camera.far = height * CAMERA_FAR
    this.updateFrustum()
  }

  /** Gira por `rotateZDeg` em torno de Y (mesmo sinal do Blender) e centraliza em x/z. */
  setModel(model: THREE.Object3D, rotateZDeg: number): void {
    const pivot = new THREE.Group()
    pivot.rotation.y = THREE.MathUtils.degToRad(rotateZDeg)
    pivot.add(model)
    pivot.updateMatrixWorld(true)
    const rotated = new THREE.Box3().setFromObject(pivot, true)
    const offset = centeringOffset({ min: rotated.min.toArray(), max: rotated.max.toArray() })
    pivot.position.set(-offset[0], -offset[1], -offset[2])
    pivot.updateMatrixWorld(true)
    const shown = new THREE.Box3().setFromObject(pivot, true)
    this.box = { min: shown.min.toArray(), max: shown.max.toArray() }
    this.frame = { rotateYDeg: rotateZDeg, offset }
    this.pivot = pivot
    this.scene.add(pivot)
    this.frameModel()
  }

  clearModel(): void {
    if (!this.pivot) return
    this.scene.remove(this.pivot)
    this.pivot.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
        m.dispose()
      }
    })
    this.pivot = null
    this.box = null
  }

  /** Raio da câmera pelo NDC dado → ponto na malha, ou no plano z = 0 do modelo. */
  private pickNdc(ndc: THREE.Vector2): Vec3 {
    if (this.pivot) {
      this.raycaster.setFromCamera(ndc, this.camera)
      const hit = this.raycaster.intersectObject(this.pivot, true).find((i) => (i.object as THREE.Mesh).isMesh && i.object.visible)
      if (hit) return [hit.point.x, hit.point.y, hit.point.z]
    }
    const p = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(this.camera)
    return [p.x, p.y, 0]
  }

  /** Ponto na malha sob o cursor (ou no plano z = 0). */
  pickClient(clientX: number, clientY: number): Vec3 {
    return this.pickNdc(this.clientToNdc(clientX, clientY))
  }

  /** Ponto (x, y) do espaço exibido com a profundidade tirada do raio. */
  depthAt(x: number, y: number): Vec3 {
    const v = new THREE.Vector3(x, y, 0).project(this.camera)
    const hit = this.pickNdc(new THREE.Vector2(v.x, v.y))
    return [x, y, hit[2]]
  }

  private clientToNdc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.viewEl.getBoundingClientRect()
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  }

  /** Ponto do plano z = 0 (espaço exibido) sob o cursor. */
  private clientToWorld(clientX: number, clientY: number): THREE.Vector3 {
    const ndc = this.clientToNdc(clientX, clientY)
    return new THREE.Vector3(ndc.x, ndc.y, 0).unproject(this.camera)
  }

  /** Espaço exibido → pixels do overlay. */
  toScreen(p: Vec3): [number, number] {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera)
    return [((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height]
  }

  /** O ponto da tela está dentro da vista. */
  contains(clientX: number, clientY: number): boolean {
    const r = this.viewEl.getBoundingClientRect()
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
  }

  private bindView(): void {
    const view = this.viewEl
    view.addEventListener('contextmenu', (e) => e.preventDefault())
    view.addEventListener('wheel', (e) => {
      e.preventDefault()
      const before = this.clientToWorld(e.clientX, e.clientY)
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, ZOOM_MIN, ZOOM_MAX)
      this.camera.updateProjectionMatrix()
      this.camera.updateMatrixWorld()
      const after = this.clientToWorld(e.clientX, e.clientY)
      // Zoom no ponto do cursor: o ponto sob o mouse não sai do lugar.
      this.camera.position.x += before.x - after.x
      this.camera.position.y += before.y - after.y
      this.camera.updateMatrixWorld()
      this.onRedraw()
    }, { passive: false })
    // Arrastar no fundo (qualquer botão) = pan; os marcadores param a propagação.
    view.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest(MARKER_SELECTOR)) return
      e.preventDefault()
      let lastX = e.clientX
      let lastY = e.clientY
      trackPointer(e, (ev) => {
        const unitsPerPx = this.viewHeight / this.camera.zoom / (view.clientHeight || 1)
        this.camera.position.x -= (ev.clientX - lastX) * unitsPerPx
        this.camera.position.y += (ev.clientY - lastY) * unitsPerPx
        this.camera.updateMatrixWorld()
        lastX = ev.clientX
        lastY = ev.clientY
        this.onRedraw()
      })
    })
    view.addEventListener('dblclick', (e) => {
      if ((e.target as Element).closest(MARKER_SELECTOR)) return
      this.frameModel()
      this.onRedraw()
    })
  }

  dispose(): void {
    this.clearModel()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
    this.renderer = null
  }
}
