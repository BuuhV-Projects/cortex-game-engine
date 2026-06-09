import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { h, icon } from './ui'

/**
 * Preview 3D de um `.glb`/`.gltf` aberto no file-tree (redesign Layout A): um
 * **studio** WebGL orbitável + uma barra de **playback** + o painel **Animações**,
 * e emite os stats do asset (`glb-asset`) pro dock direito mostrar "Asset · GLB".
 *
 * Os bytes vêm por IPC (`readFileBase64`). Cena/renderer são criados sob demanda e
 * reusados; o modelo é trocado/descartado a cada `open` pra não vazar GPU.
 */
export class GlbPreview {
  private readonly overlay: HTMLElement
  private readonly studioEl: HTMLElement
  private readonly listEl: HTMLElement
  private readonly fileIdEl: HTMLElement
  private readonly metaEl: HTMLElement
  // Playbar
  private readonly playBtn: HTMLButtonElement
  private readonly loopBtn: HTMLButtonElement
  private readonly scrubFill: HTMLElement
  private readonly scrubKnob: HTMLElement
  private readonly tcodeCur: HTMLElement
  private readonly tcodeTotal: HTMLElement

  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private controls: OrbitControls | null = null
  private grid: THREE.GridHelper | null = null
  private mixer: THREE.AnimationMixer | null = null
  private clips: THREE.AnimationClip[] = []
  private current: THREE.AnimationAction | null = null
  private currentIndex = -1
  private model: THREE.Object3D | null = null
  private raf = 0
  private clock = new THREE.Clock()
  private loadToken = 0
  private speed = 1
  private loop = true
  private currentName = ''
  private readonly onClose?: () => void

  constructor(host: HTMLElement, onClose?: () => void) {
    this.onClose = onClose

    // ── Studio (canvas WebGL + pills) ──────────────────────────────────────────
    const studio = h('div', { class: 'studio grow', style: { position: 'relative', minHeight: '0' } })
    this.studioEl = studio
    const fileId = h('span', {}, '')
    this.fileIdEl = fileId
    const meta = h('span', { class: 'vp-pill mono', style: { fontSize: '10.5px' } }, '—')
    this.metaEl = meta
    studio.append(
      h('div', { style: { position: 'absolute', top: '10px', left: '12px' } },
        h('span', { class: 'vp-pill' }, h('span', { style: { fontSize: '9px', fontWeight: '800', color: 'var(--accent)', fontFamily: 'var(--mono)' } }, '3D'), fileId)),
      h('div', { style: { position: 'absolute', bottom: '10px', left: '12px' } }, meta),
    )

    // ── Playbar ────────────────────────────────────────────────────────────────
    const playBtn = h('button', { class: 'iconbtn on', style: { width: '32px', height: '32px' }, onClick: () => this.togglePlay() }, icon('play', { size: 15, fill: true })) as HTMLButtonElement
    const replayBtn = h('button', { class: 'iconbtn', title: 'Reiniciar clipe', onClick: () => this.replay() }, icon('refresh', { size: 15 })) as HTMLButtonElement
    const loopBtn = h('button', { class: 'iconbtn on', title: 'Loop', onClick: () => this.toggleLoop() }, icon('refresh', { size: 15 })) as HTMLButtonElement
    const tcodeCur = h('span', { class: 'tcode' }, '0:00')
    const tcodeTotal = h('span', { class: 'tcode' }, '0:00')
    const scrubFill = h('div', { class: 'fill', style: { width: '0%' } })
    const scrubKnob = h('div', { class: 'knob', style: { left: '0%' } })
    const scrub = h('div', { class: 'scrub' }, scrubFill, scrubKnob)
    const speedPill = h('span', { class: 'selpill', style: { height: '26px', cursor: 'pointer' }, onClick: () => this.cycleSpeed(speedPill) }, '1.0×')
    this.playBtn = playBtn
    this.loopBtn = loopBtn
    this.scrubFill = scrubFill
    this.scrubKnob = scrubKnob
    this.tcodeCur = tcodeCur
    this.tcodeTotal = tcodeTotal
    const playbar = h('div', { class: 'playbar' },
      playBtn, replayBtn, tcodeCur, scrub, tcodeTotal,
      h('div', { class: 'divx', style: { margin: '8px 2px' } }), loopBtn, speedPill,
    )

    // ── Painel Animações ─────────────────────────────────────────────────────────
    const list = h('div', { class: 'animlist scroll grow' })
    this.listEl = list
    const animCount = h('span', { class: 'count' }, '0')
    this.animCountEl = animCount
    const animSearch = h('input', { placeholder: 'Filtrar clipes…', onInput: () => this.filterAnims(animSearch.value) }) as HTMLInputElement
    const animpanel = h('div', { class: 'animpanel' },
      h('div', { class: 'panel-h' }, h('span', { class: 'ttl lit' }, 'Animações'), animCount, h('span', { class: 'spacer' })),
      h('div', { style: { padding: '8px 8px 4px' } }, h('div', { class: 'search' }, icon('search', { size: 13 }), animSearch)),
      list,
    )

    const overlay = h('div', { class: 'editor-glb-preview ide', style: { position: 'absolute', inset: '0', display: 'none', zIndex: '6', background: 'var(--bg-1)' } },
      h('div', { class: 'row grow', style: { minHeight: '0', alignItems: 'stretch' } },
        h('div', { class: 'col grow', style: { minWidth: '0' } }, studio, playbar),
        animpanel,
      ),
    )
    this.overlay = overlay
    host.appendChild(overlay)

    new ResizeObserver(() => this.resize()).observe(studio)
  }

  private animCountEl: HTMLElement

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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    this.studioEl.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 2.2)
    const dir = new THREE.DirectionalLight(0xffffff, 2.0)
    dir.position.set(3, 6, 4)
    scene.add(hemi, dir)
    const grid = new THREE.GridHelper(10, 10, 0x5a5d72, 0x33354a)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.45
    scene.add(grid)
    this.grid = grid

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
    this.currentName = name
    this.overlay.style.display = 'flex'
    this.fileIdEl.textContent = name
    this.listEl.textContent = ''
    try {
      this.ensureThree()
    } catch {
      // WebGL indisponível — segue só com a casca (ex.: headless de validação).
    }
    this.clearModel()
    this.resize()
    this.startLoop()

    const token = ++this.loadToken
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (token !== this.loadToken) return
      const buf = base64ToArrayBuffer(b64)
      const loader = new GLTFLoader()
      const gltf: GLTF = await new Promise((res, rej) => loader.parse(buf, '', res, rej))
      if (token !== this.loadToken) return
      this.setModel(gltf, name, Math.round((b64.length * 3) / 4))
    } catch (err) {
      const e = h('div', { style: { color: 'var(--stop)', fontSize: '12px', padding: '8px' } },
        `Falha ao carregar: ${err instanceof Error ? err.message : String(err)}`)
      this.listEl.textContent = ''
      this.listEl.append(e)
    }
  }

  /** Esconde o overlay e pausa o loop (mantém renderer/cena pra reuso). */
  close(): void {
    if (this.overlay.style.display === 'none') return
    this.overlay.style.display = 'none'
    this.stopLoop()
    document.dispatchEvent(new CustomEvent('glb-asset-close'))
  }

  private setModel(gltf: GLTF, name: string, sizeBytes: number): void {
    if (!this.scene) return
    this.model = gltf.scene
    this.scene.add(this.model)
    this.frameModel(this.model)

    this.clips = gltf.animations ?? []
    this.mixer = this.clips.length ? new THREE.AnimationMixer(this.model) : null
    this.renderAnimList()
    if (this.clips.length) this.play(0)

    // Stats do asset → dock direito "Asset · GLB".
    let meshes = 0
    let triangles = 0
    const mats = new Set<THREE.Material>()
    this.model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      meshes++
      const g = m.geometry
      if (g) triangles += g.index ? g.index.count / 3 : (g.attributes['position']?.count ?? 0) / 3
      const mat = m.material
      if (Array.isArray(mat)) mat.forEach((x) => mats.add(x))
      else if (mat) mats.add(mat)
    })
    document.dispatchEvent(new CustomEvent('glb-asset', {
      detail: { name, sizeBytes, meshes, materials: mats.size, animations: this.clips.length, triangles: Math.round(triangles) },
    }))
  }

  private renderAnimList(): void {
    this.listEl.textContent = ''
    this.animCountEl.textContent = String(this.clips.length)
    if (!this.clips.length) {
      this.listEl.append(h('div', { style: { color: 'var(--tx-dim)', fontSize: '12px', padding: '8px' } }, 'nenhuma animação neste modelo'))
      return
    }
    const stopRow = h('div', { class: 'anim-row stop', onClick: () => this.stop() },
      h('span', { class: 'pic' }, icon('stop', { size: 11, fill: true })),
      h('span', { class: 'nm' }, 'Parar'),
    )
    this.listEl.append(stopRow)
    this.clips.forEach((clip, i) => {
      const row = h('div', { class: 'anim-row', 'data-i': String(i), onClick: () => this.play(i) },
        h('span', { class: 'pic' }, icon('play', { size: 11, fill: true })),
        h('span', { class: 'nm' }, clip.name || `clip ${i}`),
        h('span', { class: 'dur' }, fmtTime(clip.duration)),
      )
      this.listEl.append(row)
    })
  }

  private play(i: number): void {
    if (!this.mixer || !this.clips[i]) return
    const next = this.mixer.clipAction(this.clips[i]!)
    next.setLoop(this.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    next.clampWhenFinished = !this.loop
    next.timeScale = this.speed
    if (this.current && this.current !== next) {
      next.reset()
      this.current.fadeOut(0.2)
      next.fadeIn(0.2).play()
    } else {
      next.reset().play()
    }
    this.current = next
    this.currentIndex = i
    this.setPlayIcon(true)
    this.markActive(i)
  }

  private stop(): void {
    this.mixer?.stopAllAction()
    this.current = null
    this.currentIndex = -1
    this.setPlayIcon(false)
    this.markActive(-1)
  }

  private togglePlay(): void {
    if (!this.current) {
      if (this.clips.length) this.play(this.currentIndex >= 0 ? this.currentIndex : 0)
      return
    }
    this.current.paused = !this.current.paused
    this.setPlayIcon(!this.current.paused)
  }

  /** Ícone do botão principal: pause enquanto toca, play quando parado/pausado. */
  private setPlayIcon(playing: boolean): void {
    this.playBtn.textContent = ''
    this.playBtn.append(icon(playing ? 'pause' : 'play', { size: 15, fill: !playing }))
    this.playBtn.classList.toggle('on', playing)
  }

  /** Filtra a lista de animações por nome (busca do painel). */
  private filterAnims(q: string): void {
    const query = q.toLowerCase()
    for (const el of Array.from(this.listEl.querySelectorAll('.anim-row'))) {
      const row = el as HTMLElement
      if (row.classList.contains('stop')) continue
      const name = row.querySelector('.nm')?.textContent?.toLowerCase() ?? ''
      row.style.display = !query || name.includes(query) ? '' : 'none'
    }
  }

  private replay(): void {
    if (this.current) this.current.reset().play()
  }

  private toggleLoop(): void {
    this.loop = !this.loop
    this.loopBtn.classList.toggle('on', this.loop)
    if (this.current) {
      this.current.setLoop(this.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      this.current.clampWhenFinished = !this.loop
    }
  }

  private cycleSpeed(pill: HTMLElement): void {
    const steps = [0.25, 0.5, 1, 1.5, 2]
    this.speed = steps[(steps.indexOf(this.speed) + 1) % steps.length]!
    pill.textContent = `${this.speed.toFixed(this.speed < 1 ? 2 : 1)}×`
    if (this.current) this.current.timeScale = this.speed
  }

  private toggleGrid(): void {
    if (this.grid) this.grid.visible = !this.grid.visible
  }

  private markActive(i: number): void {
    for (const el of Array.from(this.listEl.querySelectorAll('.anim-row[data-i]'))) {
      const row = el as HTMLElement
      const on = Number(row.dataset['i']) === i
      row.classList.toggle('on', on)
      const pic = row.querySelector('.pic')
      if (pic) {
        pic.textContent = ''
        if (on) {
          const eq = h('span', { class: 'eq' }, h('i'), h('i'), h('i'), h('i'))
          pic.append(eq)
        } else {
          pic.append(icon('play', { size: 11, fill: true }))
        }
      }
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
    this.currentIndex = -1
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
    const w = this.studioEl.clientWidth || 1
    const h2 = this.studioEl.clientHeight || 1
    this.renderer.setSize(w, h2, false)
    this.camera.aspect = w / h2
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
      this.updatePlayhead()
      if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private updatePlayhead(): void {
    const clip = this.currentIndex >= 0 ? this.clips[this.currentIndex] : null
    if (!this.current || !clip || clip.duration <= 0) {
      this.scrubFill.style.width = '0%'
      this.scrubKnob.style.left = '0%'
      this.tcodeCur.textContent = '0:00'
      this.tcodeTotal.textContent = clip ? fmtTime(clip.duration) : '0:00'
      return
    }
    const tt = (this.current.time % clip.duration) / clip.duration
    const pct = `${(tt * 100).toFixed(1)}%`
    this.scrubFill.style.width = pct
    this.scrubKnob.style.left = pct
    this.tcodeCur.textContent = fmtTime(this.current.time % clip.duration)
    this.tcodeTotal.textContent = fmtTime(clip.duration)
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
