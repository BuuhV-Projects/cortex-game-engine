import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Preview 3D de um `.glb`/`.gltf` clicado no file-tree: renderiza o modelo num
 * viewport WebGL (orbitável) e lista as **animações** embutidas, com play/stop de
 * cada clipe via {@link THREE.AnimationMixer}. Cobre o editor de código (overlay),
 * no mesmo espírito dos previews de imagem/markdown do {@link Editor}.
 *
 * Os bytes vêm por IPC (`readFileBase64`) — o renderer não tem acesso a `file://`.
 * Cena/renderer são criados sob demanda e reusados; o modelo é trocado/descartado
 * a cada `open` pra não vazar GPU.
 */
export class GlbPreview {
  private readonly overlay: HTMLElement
  private readonly canvasWrap: HTMLElement
  private readonly listEl: HTMLElement
  private readonly titleEl: HTMLElement

  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private controls: OrbitControls | null = null
  private mixer: THREE.AnimationMixer | null = null
  private clips: THREE.AnimationClip[] = []
  private current: THREE.AnimationAction | null = null
  private model: THREE.Object3D | null = null
  private raf = 0
  private clock = new THREE.Clock()
  private loadToken = 0
  private readonly onClose?: () => void

  constructor(host: HTMLElement, onClose?: () => void) {
    this.onClose = onClose
    const overlay = document.createElement('div')
    overlay.className = 'editor-glb-preview'
    overlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:row',
      'background:#1e1e1e',
      'z-index:6',
    ].join(';')

    const canvasWrap = document.createElement('div')
    canvasWrap.style.cssText = 'flex:1;position:relative;min-width:0;background:#22232a'

    const side = document.createElement('div')
    side.style.cssText = [
      'width:230px',
      'flex:0 0 230px',
      'display:flex',
      'flex-direction:column',
      'gap:6px',
      'padding:12px',
      'overflow:auto',
      'background:#1b1c22',
      'border-left:1px solid #2c2e36',
      'color:#d4d4d4',
      'font:13px "Segoe UI",Roboto,Arial,sans-serif',
    ].join(';')

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕  Fechar preview'
    closeBtn.style.cssText = [
      'align-self:flex-start',
      'padding:5px 10px',
      'margin-bottom:4px',
      'border:1px solid #3a3f4a',
      'border-radius:5px',
      'background:#2a2f3a',
      'color:#e6e6e6',
      'cursor:pointer',
      'font:12px "Segoe UI",Roboto,Arial,sans-serif',
    ].join(';')
    closeBtn.addEventListener('click', () => {
      this.close()
      this.onClose?.()
    })

    const title = document.createElement('div')
    title.style.cssText = 'font-weight:600;word-break:break-all;color:#e6e6e6'
    const animHeader = document.createElement('div')
    animHeader.textContent = 'Animações'
    animHeader.style.cssText = 'margin-top:8px;color:#9aa0ad;font-size:12px;text-transform:uppercase;letter-spacing:.04em'
    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column;gap:4px'
    const hint = document.createElement('div')
    hint.textContent = 'Arraste pra girar · scroll pra zoom'
    hint.style.cssText = 'margin-top:auto;color:#6b7280;font-size:11px'

    side.append(closeBtn, title, animHeader, list, hint)
    overlay.append(canvasWrap, side)
    host.appendChild(overlay)

    this.overlay = overlay
    this.canvasWrap = canvasWrap
    this.listEl = list
    this.titleEl = title

    new ResizeObserver(() => this.resize()).observe(canvasWrap)
  }

  /** `true` se a extensão abre neste preview. */
  static handles(name: string): boolean {
    const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    return e === 'glb' || e === 'gltf'
  }

  /** `true` enquanto o overlay está visível (pro empty-state do editor). */
  isOpen(): boolean {
    return this.overlay.style.display !== 'none'
  }

  private ensureThree(): void {
    if (this.renderer) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    this.canvasWrap.appendChild(renderer.domElement)
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x22232a)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 2.2)
    const dir = new THREE.DirectionalLight(0xffffff, 2.0)
    dir.position.set(3, 6, 4)
    scene.add(hemi, dir)
    const grid = new THREE.GridHelper(10, 10, 0x3a3d47, 0x2c2e36)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5
    scene.add(grid)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.controls = controls
  }

  /** Abre o preview de um modelo: mostra o overlay, carrega e lista as animações. */
  async open(path: string, name: string): Promise<void> {
    this.ensureThree()
    this.overlay.style.display = 'flex'
    this.titleEl.textContent = name
    this.listEl.textContent = ''
    this.clearModel()
    this.resize()
    this.startLoop()

    const token = ++this.loadToken
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (token !== this.loadToken) return // outro arquivo foi aberto enquanto carregava
      const buf = base64ToArrayBuffer(b64)
      const loader = new GLTFLoader()
      const gltf: GLTF = await new Promise((res, rej) =>
        loader.parse(buf, '', res, rej),
      )
      if (token !== this.loadToken) return
      this.setModel(gltf)
    } catch (err) {
      this.listEl.textContent = ''
      const e = document.createElement('div')
      e.style.cssText = 'color:#e06c75;font-size:12px'
      e.textContent = `Falha ao carregar: ${err instanceof Error ? err.message : String(err)}`
      this.listEl.appendChild(e)
    }
  }

  /** Esconde o overlay e pausa o loop (mantém renderer/cena pra reuso). */
  close(): void {
    if (this.overlay.style.display === 'none') return
    this.overlay.style.display = 'none'
    this.stopLoop()
  }

  private setModel(gltf: GLTF): void {
    if (!this.scene) return
    this.model = gltf.scene
    this.scene.add(this.model)
    this.frameModel(this.model)

    this.clips = gltf.animations ?? []
    this.mixer = this.clips.length ? new THREE.AnimationMixer(this.model) : null
    this.renderAnimList()
    // Toca o primeiro clipe (geralmente idle) por padrão.
    if (this.clips.length) this.play(0)
  }

  private renderAnimList(): void {
    this.listEl.textContent = ''
    if (!this.clips.length) {
      const none = document.createElement('div')
      none.style.cssText = 'color:#6b7280;font-size:12px'
      none.textContent = 'nenhuma animação neste modelo'
      this.listEl.appendChild(none)
      return
    }
    const stop = makeBtn('⏹  Parar', '#2c2e36')
    stop.addEventListener('click', () => {
      this.mixer?.stopAllAction()
      this.current = null
      this.markActive(-1)
    })
    this.listEl.appendChild(stop)
    this.clips.forEach((clip, i) => {
      const b = makeBtn(`▶  ${clip.name || `clip ${i}`}`, '#26282f')
      b.dataset['i'] = String(i)
      b.addEventListener('click', () => this.play(i))
      this.listEl.appendChild(b)
    })
  }

  private play(i: number): void {
    if (!this.mixer || !this.clips[i]) return
    const next = this.mixer.clipAction(this.clips[i]!)
    if (this.current && this.current !== next) {
      next.reset()
      this.current.fadeOut(0.2)
      next.fadeIn(0.2).play()
    } else {
      next.reset().play()
    }
    this.current = next
    this.markActive(i)
  }

  private markActive(i: number): void {
    for (const el of Array.from(this.listEl.querySelectorAll('button[data-i]'))) {
      const btn = el as HTMLButtonElement
      const on = Number(btn.dataset['i']) === i
      btn.style.background = on ? '#3b5bdb' : '#26282f'
      btn.style.color = on ? '#fff' : '#d4d4d4'
    }
  }

  private frameModel(obj: THREE.Object3D): void {
    if (!this.camera || !this.controls) return
    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 180 / 2)
    this.camera.position.set(center.x + dist * 0.8, center.y + radius * 0.6, center.z + dist * 1.1)
    this.camera.near = radius / 100
    this.camera.far = dist * 10
    this.camera.updateProjectionMatrix()
    this.controls.target.copy(center)
    this.controls.update()
  }

  private clearModel(): void {
    this.current = null
    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer = null
    }
    this.clips = []
    if (this.model && this.scene) {
      this.scene.remove(this.model)
      this.model.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      this.model = null
    }
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return
    const w = this.canvasWrap.clientWidth || 1
    const h = this.canvasWrap.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private startLoop(): void {
    if (this.raf) return
    this.clock.getDelta()
    const tick = (): void => {
      this.raf = requestAnimationFrame(tick)
      const dt = this.clock.getDelta()
      this.mixer?.update(dt)
      this.controls?.update()
      if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}

function makeBtn(label: string, bg: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = label
  b.style.cssText = [
    'text-align:left',
    'padding:6px 9px',
    'border:none',
    'border-radius:5px',
    `background:${bg}`,
    'color:#d4d4d4',
    'cursor:pointer',
    'font:12px "Segoe UI",Roboto,Arial,sans-serif',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis',
  ].join(';')
  return b
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
