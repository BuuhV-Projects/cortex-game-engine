import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import {
  MARKER_GROUPS,
  MARKER_IDS,
  centeringOffset,
  configRelPath,
  displayToGltf,
  estimateMarkers,
  fillMissingMarkers,
  gltfToDisplay,
  helperLines,
  isCharacterConfigName,
  isCenterMarker,
  markerColor,
  markerSide,
  markersPathFor,
  mirrorId,
  moveMarker,
  parseCharacterConfig,
  parseMarkersFile,
  previewSheetPath,
  rigOutcome,
  type RigAction,
  sameSource,
  serializeMarkersFile,
  stripAnsi,
  symmetrize,
  validateMarkers,
  type Box,
  type CharacterConfig,
  type DisplayFrame,
  type MarkerId,
  type MarkerSet,
  type ValidationError,
  type Vec3,
} from './characterRig'
import {
  availableBuilds,
  parseRigRegistry,
  registryPath,
  resolveProjectPath,
  splitPath,
  RIG_REGISTRY_FILE,
  type RigBuildKind,
  type RigEntry,
  type RigRegistry,
} from './characterRigRegistry'
import { RigAnimationPreview } from './RigAnimationPreview'
import { RigFbxSelection } from './RigFbxSelection'

/**
 * Painel **character-auto-rig** (SPEC-0349): marca queixo, pulsos, cotovelos,
 * joelhos e virilha num personagem GLB, como o auto-rigger do Mixamo, grava
 * `tools/characters/<CODE>.markers.json` e roda o `prepare-character.sh` do jogo.
 *
 * Viewport: câmera ortográfica frontal (olha para −Z) com o modelo girado por
 * `transform.rotateZDeg` em torno de Y e centralizado em x = 0 (o "espaço
 * exibido" do módulo puro `characterRig.ts`). Os marcadores são um overlay SVG
 * projetado pela câmera; a cena só é redesenhada quando algo muda (sem loop).
 *
 * Abas (adendo 1): **Marcadores**, **Animações** (prévia do GLB do registro de
 * rigs, `RigAnimationPreview`) e **Pasta** (seleção dos FBX, `RigFbxSelection`).
 */

const SCOPE = 'characterRig'
/** Mesma chave do FileTree/Shell para o projeto aberto. */
const PROJECT_KEY = 'fileTree_projectDir'
/** Tamanho da vista ortográfica em alturas do modelo (margem acima/abaixo). */
const VIEW_MARGIN = 1.12
const ZOOM_STEP = 1.15
const ZOOM_MIN = 0.3
const ZOOM_MAX = 25
const MARKER_RADIUS = 7
/** Teto do log em caracteres (o script do jogo é verboso em `--from`). */
const LOG_MAX_CHARS = 200_000

export type RigTab = 'markers' | 'animations' | 'folder'
const TABS: RigTab[] = ['markers', 'animations', 'folder']

interface ConfigEntry {
  fileName: string
  path: string
  config: CharacterConfig
  /** O `.markers.json` existe (pela listagem): evita ler arquivo ausente (ENOENT no log do main). */
  hasMarkers: boolean
}

/** Liga o evento `character-rig-requested` (menu Projeto / botão direito na árvore). */
export function installCharacterRig(): void {
  document.addEventListener('character-rig-requested', (e) => {
    const detail = (e as CustomEvent<{ configPath?: string; tab?: RigTab } | undefined>).detail
    void openCharacterRig(detail?.configPath, detail?.tab)
  })
}

async function openCharacterRig(configPath?: string, tab: RigTab = 'markers'): Promise<void> {
  const projectDir = localStorage.getItem(PROJECT_KEY)
  if (!projectDir) {
    void window.electronAPI.infoDialog(t('characterRig.no_project'))
    return
  }
  const entries = await listCharacterConfigs(projectDir)
  if (!entries.length) {
    void window.electronAPI.infoDialog(t('characterRig.no_configs'))
    return
  }
  const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
  const initial = configPath ? entries.findIndex((e) => norm(e.path) === norm(configPath)) : 0
  if (initial < 0) {
    void window.electronAPI.infoDialog(t('characterRig.not_skinned'))
    return
  }
  new CharacterRigPanel(projectDir, entries, initial, tab)
}

/** Configs `tools/characters/*.json` do projeto com a seção `skinned`. */
async function listCharacterConfigs(projectDir: string): Promise<ConfigEntry[]> {
  const dir = `${projectDir.replace(/[\\/]+$/, '')}/tools/characters`
  let files: Array<{ name: string; path: string; isDir: boolean }>
  try {
    files = await window.electronAPI.readDir(dir)
  } catch {
    return []
  }
  const names = new Set(files.map((f) => f.name))
  const out: ConfigEntry[] = []
  for (const f of files) {
    if (f.isDir || !isCharacterConfigName(f.name)) continue
    try {
      const config = parseCharacterConfig(await window.electronAPI.readFile(f.path))
      if (config.skinned) out.push({ fileName: f.name, path: f.path, config, hasMarkers: names.has(markersPathFor(f.name)) })
    } catch (err) {
      debug(SCOPE, 'config ignorada', f.name, err)
    }
  }
  return out.sort((a, b) => a.fileName.localeCompare(b.fileName))
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** Lê `tools/characters/rigs.json` (pela listagem: sem ler arquivo ausente). `null` se não há registro. */
async function loadRigRegistry(projectDir: string): Promise<RigRegistry | null> {
  const path = registryPath(projectDir)
  try {
    const files = await window.electronAPI.readDir(splitPath(path).dir)
    if (!files.some((f) => f.name === RIG_REGISTRY_FILE)) return null
    return parseRigRegistry(await window.electronAPI.readFile(path))
  } catch (err) {
    debug(SCOPE, 'registro de rigs ilegível', path, err)
    return null
  }
}

/** Builds do registro cujo GLB existe (pela listagem da pasta), o mais recente primeiro. */
async function existingBuilds(projectDir: string, entry: RigEntry): Promise<RigBuildKind[]> {
  const out: RigBuildKind[] = []
  for (const kind of availableBuilds(entry)) {
    const { dir, name } = splitPath(resolveProjectPath(projectDir, entry[kind]!.glb))
    try {
      const files = await window.electronAPI.readDir(dir)
      if (files.some((f) => !f.isDir && f.name.toLowerCase() === name.toLowerCase())) out.push(kind)
    } catch {
      /* pasta ausente: build indisponível */
    }
  }
  return out
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

class CharacterRigPanel {
  private readonly dialog: HTMLDialogElement
  private readonly viewEl: HTMLElement
  private readonly overlay: SVGSVGElement
  private readonly statusEl: HTMLElement
  private readonly errorsEl: HTMLElement
  private readonly logCol: HTMLElement
  private readonly logEl: HTMLPreElement
  private readonly outcomeEl: HTMLElement
  private readonly sheetImg: HTMLImageElement
  private readonly reviewBar: HTMLElement
  private readonly approveBtn: HTMLButtonElement
  private readonly rejectBtn: HTMLButtonElement
  private readonly revertBtn: HTMLButtonElement
  private readonly symmetryInput: HTMLInputElement
  private readonly saveBtn: HTMLButtonElement
  private readonly runBtn: HTMLButtonElement
  private readonly stopBtn: HTMLButtonElement
  private readonly dots = new Map<MarkerId, HTMLElement>()
  private readonly tabBtns = new Map<RigTab, HTMLButtonElement>()
  private readonly tabBodies = new Map<RigTab, HTMLElement>()
  private readonly animNotice: HTMLElement
  private readonly preview: RigAnimationPreview
  private readonly selection: RigFbxSelection
  private readonly folderRunBtn: HTMLButtonElement
  private tab: RigTab = 'markers'
  /** Aba pedida na abertura (Animações só depois de saber se há rig). */
  private wantedTab: RigTab | null = null
  private rig: RigEntry | null = null
  private awaitingReview = false
  private builds: RigBuildKind[] = []

  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000)
  private readonly raycaster = new THREE.Raycaster()
  private pivot: THREE.Group | null = null
  private frame: DisplayFrame = { rotateYDeg: 0, offset: [0, 0, 0] }
  private box: Box | null = null
  private viewHeight = 2

  private entry: ConfigEntry
  private markers: MarkerSet = {}
  private errors: ValidationError[] = []
  private lastSide: 'L' | 'R' = 'L'
  private loadToken = 0
  private running = false
  private unsubscribeOutput: (() => void) | null = null
  private log = ''

  constructor(
    private readonly projectDir: string,
    private readonly entries: ConfigEntry[],
    initial: number,
    initialTab: RigTab,
  ) {
    this.entry = entries[initial]!

    this.dialog = document.createElement('dialog')
    this.dialog.className = 'export-modal rig-modal'

    // ── Cabeçalho ───────────────────────────────────────────────────────────
    const select = h('select', { class: 'gs-input rig-select', title: t('characterRig.config') }) as HTMLSelectElement
    entries.forEach((e, i) => select.append(h('option', { value: String(i) }, `${e.config.code} — ${e.fileName}`)))
    select.value = String(initial)
    select.addEventListener('change', () => {
      this.entry = this.entries[Number(select.value)]!
      void this.loadEntry()
    })
    const closeBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => this.dialog.close() }, t('characterRig.close'))
    const tabs = h('div', { class: 'rig-tabs' })
    tabs.setAttribute('role', 'tablist')
    for (const tab of TABS) {
      const btn = h('button', { class: 'rig-tab', type: 'button', 'data-tab': tab, onClick: () => this.setTab(tab) }, t(`characterRig.tab.${tab}`)) as HTMLButtonElement
      btn.setAttribute('role', 'tab')
      this.tabBtns.set(tab, btn)
      tabs.append(btn)
    }
    const header = h('div', { class: 'rig-header' },
      h('div', { class: 'export-modal__header', style: { marginBottom: '0' } },
        h('h2', { class: 'export-modal__title' }, t('characterRig.title')),
        h('div', { class: 'export-modal__subtitle' }, t('characterRig.subtitle'))),
      tabs,
      h('span', { class: 'spacer', style: { flex: '1' } }),
      select,
      closeBtn,
    )

    // ── Coluna dos marcadores ───────────────────────────────────────────────
    const groups = h('div', { class: 'rig-groups' })
    for (const g of MARKER_GROUPS) {
      const dotsEl = h('div', { class: 'rig-dots' })
      for (const id of g.ids) {
        const side = markerSide(id)
        const dot = h('span', {
          class: 'rig-dot',
          'data-id': id,
          title: t(`characterRig.marker.${id}`),
          style: { background: g.color },
          onPointerdown: (ev: Event) => this.startPaletteDrag(id, ev as PointerEvent),
        }, side ? t(`characterRig.side_${side}`) : '')
        this.dots.set(id, dot)
        dotsEl.append(dot)
      }
      groups.append(h('div', { class: 'rig-group' }, h('span', { class: 'rig-group__label' }, t(`characterRig.group.${g.key}`)), dotsEl))
    }

    this.symmetryInput = h('input', { type: 'checkbox' }) as HTMLInputElement
    this.symmetryInput.checked = true
    this.symmetryInput.addEventListener('change', () => {
      if (this.symmetryInput.checked) {
        this.markers = this.refineDepth(symmetrize(this.markers, this.lastSide))
        this.changed()
      }
    })
    const symmetryField = h('label', { class: 'rig-check' }, this.symmetryInput, h('span', {}, t('characterRig.symmetry')))
    const resetBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => this.resetEstimate() }, t('characterRig.reset'))

    this.errorsEl = h('ul', { class: 'rig-errors' })
    this.statusEl = h('div', { class: 'rig-status' })
    this.saveBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.save() }, t('characterRig.save')) as HTMLButtonElement
    this.runBtn = h('button', { class: 'export-modal__btn export-modal__btn--primary', type: 'button', onClick: () => void this.generate() }, t('characterRig.generate')) as HTMLButtonElement
    this.stopBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void window.electronAPI.characterRigStop() }, t('characterRig.stop')) as HTMLButtonElement
    this.stopBtn.hidden = true

    const side = h('aside', { class: 'rig-side' },
      h('div', { class: 'rig-side__title' }, t('characterRig.markers')),
      groups,
      h('div', { class: 'rig-hint' }, t('characterRig.hint')),
      symmetryField,
      resetBtn,
      this.errorsEl,
      h('span', { class: 'spacer', style: { flex: '1' } }),
      this.statusEl,
      h('div', { class: 'rig-actions' }, this.saveBtn, this.runBtn, this.stopBtn),
    )

    // ── Viewport ────────────────────────────────────────────────────────────
    this.overlay = svg('svg', { class: 'rig-overlay' })
    this.viewEl = h('div', { class: 'rig-view' },
      this.overlay,
      h('div', { class: 'rig-view__hint' }, t('characterRig.view_hint')),
    )

    // ── Log / folha ─────────────────────────────────────────────────────────
    this.outcomeEl = h('div', { class: 'rig-outcome' })
    this.logEl = h('pre', { class: 'rig-log__pre' }) as HTMLPreElement
    this.sheetImg = h('img', { class: 'rig-sheet', title: t('characterRig.sheet_open') }) as HTMLImageElement
    this.sheetImg.hidden = true
    this.sheetImg.addEventListener('click', () => {
      const path = this.entry.config.work ? previewSheetPath(this.entry.config.work) : null
      if (path) void window.electronAPI.openPath(path)
    })
    // revisão da folha (código 3): publicar no jogo ou recusar; desfazer a última publicação
    this.approveBtn = h('button', { class: 'export-modal__btn export-modal__btn--primary', type: 'button', onClick: () => void this.run('approve') }, t('characterRig.review.approve')) as HTMLButtonElement
    this.rejectBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => this.reject() }, t('characterRig.review.reject')) as HTMLButtonElement
    this.revertBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.revert() }, t('characterRig.review.revert')) as HTMLButtonElement
    this.approveBtn.hidden = true
    this.rejectBtn.hidden = true
    this.revertBtn.hidden = true
    this.reviewBar = h('div', { class: 'rig-review' }, this.approveBtn, this.rejectBtn, this.revertBtn)
    this.logCol = h('div', { class: 'rig-log' }, h('div', { class: 'rig-side__title' }, t('characterRig.log')), this.outcomeEl, this.reviewBar, this.sheetImg, this.logEl)

    // ── Abas Animações / Pasta ─────────────────────────────────────────────
    this.preview = new RigAnimationPreview()
    this.selection = new RigFbxSelection({
      onChange: () => void this.refreshPreview(),
      onPlay: (name) => {
        this.setTab('animations')
        this.preview.play(name)
      },
    })
    this.animNotice = h('div', { class: 'rig-notice' }, t('characterRig.anim.need_rig'))
    this.animNotice.hidden = true
    this.tabBtns.get('animations')!.disabled = true // até ler o registro
    this.folderRunBtn = h('button', { class: 'export-modal__btn export-modal__btn--primary', type: 'button', onClick: () => void this.generate() }, t('characterRig.generate')) as HTMLButtonElement
    this.selection.footer.append(this.folderRunBtn)

    this.tabBodies.set('markers', h('div', { class: 'rig-body' }, side, this.viewEl))
    this.tabBodies.set('animations', this.preview.el)
    this.tabBodies.set('folder', this.selection.el)
    const main = h('div', { class: 'rig-main' }, h('div', { class: 'rig-tabbody' }, ...this.tabBodies.values()), this.logCol)
    this.dialog.append(header, this.animNotice, main)
    document.body.appendChild(this.dialog)

    this.initThree()
    this.bindView()
    this.dialog.addEventListener('close', () => this.dispose())
    this.dialog.showModal()
    this.wantedTab = initialTab
    this.setTab('markers')
    void this.loadEntry()
  }

  // ── Abas ──────────────────────────────────────────────────────────────────

  private get animationsEnabled(): boolean {
    return !!this.rig && this.builds.length > 0
  }

  private setTab(tab: RigTab): void {
    if (tab === 'animations' && !this.animationsEnabled) return
    this.tab = tab
    for (const [k, btn] of this.tabBtns) {
      btn.classList.toggle('on', k === tab)
      btn.setAttribute('aria-selected', String(k === tab))
    }
    for (const [k, body] of this.tabBodies) body.hidden = k !== tab
    this.preview.setActive(tab === 'animations')
    if (tab === 'markers') this.draw()
  }

  /** Relê o registro de rigs e atualiza as abas Animações e Pasta. */
  private async loadRig(): Promise<void> {
    const code = this.entry.config.code
    const registry = await loadRigRegistry(this.projectDir)
    const rig = registry?.rigs[code] ?? null
    const builds = rig ? await existingBuilds(this.projectDir, rig) : []
    if (code !== this.entry.config.code) return
    this.rig = rig
    this.builds = builds
    this.updateReviewBar()
    const enabled = this.animationsEnabled
    const btn = this.tabBtns.get('animations')!
    btn.disabled = !enabled
    btn.title = enabled ? '' : t('characterRig.anim.need_rig')
    this.animNotice.hidden = enabled
    debug(SCOPE, 'registro de rigs', code, { noRegistro: !!rig, builds })
    if (!enabled && this.tab === 'animations') this.setTab('markers')
    if (this.wantedTab) {
      this.setTab(this.wantedTab === 'animations' && !enabled ? 'markers' : this.wantedTab)
      this.wantedTab = null
    }
    this.selection.setRig(rig)
  }

  private async refreshPreview(): Promise<void> {
    await this.preview.show(this.rig && this.animationsEnabled
      ? { projectDir: this.projectDir, entry: this.rig, builds: this.builds, pending: this.selection.pending() }
      : null)
  }

  // ── three.js ──────────────────────────────────────────────────────────────

  private initThree(): void {
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.className = 'rig-canvas'
      this.viewEl.prepend(renderer.domElement)
      this.renderer = renderer
    } catch (err) {
      // Sem WebGL: o painel abre, mas sem vista (não dá para marcar).
      this.setStatus(t('characterRig.no_webgl'), true)
      debug(SCOPE, 'WebGL indisponível', err)
    }
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 2.0)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(1.5, 3, 4) // de frente (+Z), um pouco de cima/lado
    this.scene.add(hemi, key)
    new ResizeObserver(() => this.resize()).observe(this.viewEl)
  }

  private resize(): void {
    const w = this.viewEl.clientWidth || 1
    const hgt = this.viewEl.clientHeight || 1
    this.renderer?.setSize(w, hgt, false)
    this.overlay.setAttribute('width', String(w))
    this.overlay.setAttribute('height', String(hgt))
    this.updateFrustum()
    this.draw()
  }

  private updateFrustum(): void {
    const aspect = (this.viewEl.clientWidth || 1) / (this.viewEl.clientHeight || 1)
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
    this.camera.position.set(0, (this.box.min[1] + this.box.max[1]) / 2, this.box.max[2] + height * 5)
    this.camera.near = 0.001
    this.camera.far = height * 20
    this.updateFrustum()
  }

  private async loadEntry(): Promise<void> {
    const token = ++this.loadToken
    const { config } = this.entry
    this.rig = null
    this.builds = []
    this.tabBtns.get('animations')!.disabled = true // até reler o registro
    void this.selection.load(this.projectDir, this.entry.path, null).then(() => this.loadRig())
    this.clearModel()
    this.markers = {}
    this.errors = []
    this.setStatus(t('characterRig.loading', { file: config.source }))
    this.draw()
    try {
      const b64 = await window.electronAPI.readFileBase64(config.source)
      if (token !== this.loadToken) return
      const gltf: GLTF = await new Promise((res, rej) => new GLTFLoader().parse(base64ToArrayBuffer(b64), '', res, rej))
      if (token !== this.loadToken) return
      this.setModel(gltf.scene)
      await this.loadMarkers()
      debug(SCOPE, 'modelo carregado', config.code, { rotateZDeg: config.rotateZDeg, frame: this.frame, box: this.box })
    } catch (err) {
      if (token !== this.loadToken) return
      this.setStatus(t('characterRig.load_failed', { error: err instanceof Error ? err.message : String(err) }), true)
    }
  }

  /** Gira por `rotateZDeg` em torno de Y (mesmo sinal do Blender) e centraliza em x/z. */
  private setModel(model: THREE.Object3D): void {
    const pivot = new THREE.Group()
    pivot.rotation.y = THREE.MathUtils.degToRad(this.entry.config.rotateZDeg)
    pivot.add(model)
    pivot.updateMatrixWorld(true)
    const rotated = new THREE.Box3().setFromObject(pivot, true)
    const offset = centeringOffset({ min: rotated.min.toArray(), max: rotated.max.toArray() })
    pivot.position.set(-offset[0], -offset[1], -offset[2])
    pivot.updateMatrixWorld(true)
    const shown = new THREE.Box3().setFromObject(pivot, true)
    this.box = { min: shown.min.toArray(), max: shown.max.toArray() }
    this.frame = { rotateYDeg: this.entry.config.rotateZDeg, offset }
    this.pivot = pivot
    this.scene.add(pivot)
    this.frameModel()
  }

  private clearModel(): void {
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

  private get modelHeight(): number {
    return this.box ? this.box.max[1] - this.box.min[1] : 1
  }

  // ── Marcadores ───────────────────────────────────────────────────────────

  /** `.markers.json` existente (convertido para o espaço exibido) ou a estimativa pela caixa. */
  private async loadMarkers(): Promise<void> {
    const { config } = this.entry
    const path = markersPathFor(this.entry.path)
    let text: string | null = null
    if (this.entry.hasMarkers) {
      try {
        text = await window.electronAPI.readFile(path)
      } catch {
        /* apagado depois da listagem: estima */
      }
    }
    if (text !== null) {
      try {
        const file = parseMarkersFile(text)
        const markers: MarkerSet = {}
        for (const id of MARKER_IDS) {
          const p = file.markers[id]
          if (p) markers[id] = gltfToDisplay(p, this.frame)
        }
        // arquivo antigo, sem os opcionais (ombros): vêm da estimativa
        this.markers = this.box ? fillMissingMarkers(markers, this.refineDepth(estimateMarkers(this.box))) : markers
        this.symmetryInput.checked = file.symmetry
        const mismatch = !sameSource(file.source, config.source) || file.code !== config.code
        this.setStatus(t(mismatch ? 'characterRig.loaded_mismatch' : 'characterRig.loaded', { file: this.fileName(path) }), mismatch)
        this.changed()
        return
      } catch (err) {
        this.setStatus(t('characterRig.markers_invalid', { error: err instanceof Error ? err.message : String(err) }), true)
        this.estimate()
        return
      }
    }
    this.estimate()
    this.setStatus(t('characterRig.estimated'))
  }

  private estimate(): void {
    if (!this.box) return
    this.markers = this.refineDepth(estimateMarkers(this.box))
    this.changed()
  }

  private resetEstimate(): void {
    this.estimate()
    this.setStatus(t('characterRig.estimated'))
  }

  /** Profundidade de cada marcador = onde o raio no seu (x, y) acerta a malha. */
  private refineDepth(markers: MarkerSet): MarkerSet {
    const out: MarkerSet = {}
    for (const id of MARKER_IDS) {
      const p = markers[id]
      if (p) out[id] = this.depthAt(p[0], p[1])
    }
    return out
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

  /** Ponto (x, y) do espaço exibido com a profundidade tirada do raio. */
  private depthAt(x: number, y: number): Vec3 {
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

  /** Coloca `id` sob o cursor (com espelho/centro quando a simetria está ligada). */
  private placeAt(id: MarkerId, clientX: number, clientY: number): void {
    if (!this.pivot) return
    const symmetry = this.symmetryInput.checked
    let p = this.pickNdc(this.clientToNdc(clientX, clientY))
    if (symmetry && isCenterMarker(id)) p = this.depthAt(0, p[1])
    const other = mirrorId(id)
    const mirror = symmetry && other ? this.depthAt(-p[0], p[1]) : undefined
    this.markers = moveMarker(this.markers, id, p, symmetry, mirror)
    this.lastSide = markerSide(id) ?? this.lastSide
    this.changed()
  }

  private changed(): void {
    this.errors = validateMarkers(this.markers, this.modelHeight)
    this.renderErrors()
    for (const [id, dot] of this.dots) dot.classList.toggle('placed', !!this.markers[id])
    this.draw()
  }

  private renderErrors(): void {
    this.errorsEl.textContent = ''
    for (const e of this.errors) {
      const names = e.ids.map((id) => t(`characterRig.marker.${id}`)).join(', ')
      this.errorsEl.append(h('li', {}, t(`characterRig.err.${e.code}`, { names })))
    }
  }

  // ── Interação ────────────────────────────────────────────────────────────

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
      this.draw()
    }, { passive: false })
    // Arrastar no fundo (qualquer botão) = pan; os marcadores param a propagação.
    view.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('.rig-marker')) return
      e.preventDefault()
      let lastX = e.clientX
      let lastY = e.clientY
      this.track(e, (ev) => {
        const unitsPerPx = this.viewHeight / this.camera.zoom / (view.clientHeight || 1)
        this.camera.position.x -= (ev.clientX - lastX) * unitsPerPx
        this.camera.position.y += (ev.clientY - lastY) * unitsPerPx
        this.camera.updateMatrixWorld()
        lastX = ev.clientX
        lastY = ev.clientY
        this.draw()
      })
    })
    view.addEventListener('dblclick', (e) => {
      if ((e.target as Element).closest('.rig-marker')) return
      this.frameModel()
      this.draw()
    })
  }

  /** Acompanha um arraste (move/up na janela) até soltar. */
  private track(start: PointerEvent, onMove: (ev: PointerEvent) => void, onUp?: (ev: PointerEvent) => void): void {
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

  /** Arrasta um marcador já colocado. */
  private startMarkerDrag(id: MarkerId, e: PointerEvent): void {
    e.preventDefault()
    e.stopPropagation()
    this.track(e, (ev) => this.placeAt(id, ev.clientX, ev.clientY))
  }

  /** Arrasta da coluna para o modelo (um círculo fantasma segue o cursor). */
  private startPaletteDrag(id: MarkerId, e: PointerEvent): void {
    e.preventDefault()
    const ghost = h('div', { class: 'rig-ghost', style: { background: markerColor(id), left: `${e.clientX}px`, top: `${e.clientY}px` } })
    this.dialog.append(ghost) // dentro do <dialog>: fica na top layer, acima do backdrop
    this.track(e, (ev) => {
      ghost.style.left = `${ev.clientX}px`
      ghost.style.top = `${ev.clientY}px`
    }, (ev) => {
      ghost.remove()
      const r = this.viewEl.getBoundingClientRect()
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) this.placeAt(id, ev.clientX, ev.clientY)
    })
  }

  // ── Desenho ──────────────────────────────────────────────────────────────

  private toScreen(p: Vec3): [number, number] {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera)
    return [((v.x + 1) / 2) * (this.viewEl.clientWidth || 1), ((1 - v.y) / 2) * (this.viewEl.clientHeight || 1)]
  }

  private draw(): void {
    this.renderer?.render(this.scene, this.camera)
    const o = this.overlay
    o.textContent = ''
    if (!this.box) return

    // Linha vertical do centro (x = 0).
    const [cx] = this.toScreen([0, 0, 0])
    o.append(svg('line', { x1: cx, y1: 0, x2: cx, y2: this.viewEl.clientHeight, class: 'rig-centerline' }))

    for (const line of helperLines(this.markers)) {
      const [x1, y1] = this.toScreen(line.from)
      const [x2, y2] = this.toScreen(line.to)
      o.append(svg('line', { x1, y1, x2, y2, stroke: line.color, class: 'rig-helper' }))
    }

    const bad = new Set(this.errors.flatMap((e) => e.ids))
    for (const id of MARKER_IDS) {
      const p = this.markers[id]
      if (!p) continue
      const [x, y] = this.toScreen(p)
      const g = svg('g', { class: `rig-marker${bad.has(id) ? ' bad' : ''}`, 'data-id': id, transform: `translate(${x} ${y})` })
      const title = svg('title', {})
      title.textContent = t(`characterRig.marker.${id}`)
      g.append(title, svg('circle', { r: MARKER_RADIUS, fill: markerColor(id) }))
      const side = markerSide(id)
      if (side) {
        const label = svg('text', { x: side === 'L' ? MARKER_RADIUS + 4 : -MARKER_RADIUS - 4, y: 4, 'text-anchor': side === 'L' ? 'start' : 'end' })
        label.textContent = t(`characterRig.side_${side}`)
        g.append(label)
      }
      g.addEventListener('pointerdown', (ev) => this.startMarkerDrag(id, ev))
      o.append(g)
    }
  }

  // ── Salvar / gerar ───────────────────────────────────────────────────────

  private setStatus(text: string, warn = false): void {
    this.statusEl.textContent = text
    this.statusEl.classList.toggle('warn', warn)
  }

  private fileName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path
  }

  /** Valida e grava o `.markers.json` no espaço gltf. `false` se não gravou. */
  private async save(): Promise<boolean> {
    this.errors = validateMarkers(this.markers, this.modelHeight)
    this.renderErrors()
    this.draw()
    if (this.errors.length || !this.box) {
      this.setStatus(t('characterRig.fix_errors'), true)
      return false
    }
    const markers = {} as Record<MarkerId, Vec3>
    for (const id of MARKER_IDS) markers[id] = displayToGltf(this.markers[id]!, this.frame)
    const { config } = this.entry
    const path = markersPathFor(this.entry.path)
    try {
      await window.electronAPI.writeFile(path, serializeMarkersFile({ code: config.code, source: config.source, symmetry: this.symmetryInput.checked, markers }))
    } catch (err) {
      this.setStatus(t('characterRig.save_failed', { error: String(err) }), true)
      return false
    }
    this.entry.hasMarkers = true
    debug(SCOPE, 'marcadores salvos', path, markers)
    this.setStatus(t('characterRig.saved', { file: this.fileName(path) }))
    return true
  }

  private appendLog(text: string): void {
    this.log = (this.log + stripAnsi(text)).slice(-LOG_MAX_CHARS)
    this.logEl.textContent = this.log
    this.logEl.scrollTop = this.logEl.scrollHeight
  }

  private setRunning(on: boolean): void {
    this.running = on
    this.runBtn.disabled = on
    this.folderRunBtn.disabled = on
    this.saveBtn.disabled = on
    this.stopBtn.hidden = !on
    this.updateReviewBar()
  }

  /** Aprovar/recusar só com uma folha aguardando revisão; desfazer só com rig publicado. */
  private updateReviewBar(): void {
    const reviewing = this.awaitingReview && !this.running
    this.approveBtn.hidden = !reviewing
    this.rejectBtn.hidden = !reviewing
    this.revertBtn.hidden = this.running || !this.rig?.published
  }

  /** Recusar não roda nada: o staging fica, nada é publicado; ajustar os marcadores e gerar de novo. */
  private reject(): void {
    this.awaitingReview = false
    this.outcomeEl.className = 'rig-outcome rejected'
    this.outcomeEl.textContent = t('characterRig.review.rejected')
    this.updateReviewBar()
    this.setTab('markers')
  }

  private async revert(): Promise<void> {
    if (!(await window.electronAPI.confirmDialog(t('characterRig.review.revert_confirm')))) return
    await this.run('revert')
  }

  /** Salva e roda `bash tools/prepare-character.sh --config tools/characters/<arquivo>`. */
  private async generate(): Promise<void> {
    if (this.running) return
    if (!(await this.save())) {
      this.setTab('markers') // os erros dos marcadores aparecem lá
      return
    }
    if (!(await this.selection.save())) return
    await this.run('generate')
  }

  /** Roda o script com a ação (gerar / `--approve` / `--revert`), mostra o resultado e relê o registro. */
  private async run(action: RigAction): Promise<void> {
    if (this.running) return
    const { config, fileName } = this.entry
    this.logCol.classList.add('on')
    this.log = ''
    this.logEl.textContent = ''
    this.awaitingReview = false
    if (action === 'generate') this.sheetImg.hidden = true
    this.outcomeEl.className = 'rig-outcome'
    this.outcomeEl.textContent = t(`characterRig.running_${action}`)
    this.setRunning(true)
    this.unsubscribeOutput = window.electronAPI.onCharacterRigOutput((text) => this.appendLog(text))
    let code = 2
    try {
      code = (await window.electronAPI.characterRigRun(this.projectDir, configRelPath(fileName), action)).code
    } catch (err) {
      this.appendLog(`\n${String(err)}\n`)
    } finally {
      this.unsubscribeOutput?.()
      this.unsubscribeOutput = null
      this.setRunning(false)
    }
    const outcome = rigOutcome(code, action)
    debug(SCOPE, 'prepare-character terminou', config.code, action, code, outcome)
    this.outcomeEl.textContent = t(`characterRig.outcome.${outcome}`, { code })
    this.outcomeEl.classList.add(outcome)
    this.awaitingReview = outcome === 'review'
    if (outcome !== 'infra') await this.loadRig()
    this.updateReviewBar()
    if (outcome === 'published' || outcome === 'reverted') this.sheetImg.hidden = true
    if (outcome === 'review' && config.work) {
      try {
        this.sheetImg.src = `data:image/png;base64,${await window.electronAPI.readFileBase64(previewSheetPath(config.work))}`
        this.sheetImg.hidden = false
      } catch {
        this.appendLog(`\n${t('characterRig.sheet_missing', { file: previewSheetPath(config.work) })}\n`)
      }
    }
  }

  private dispose(): void {
    this.loadToken++
    if (this.running) void window.electronAPI.characterRigStop()
    this.unsubscribeOutput?.()
    this.preview.dispose()
    this.clearModel()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
    this.renderer = null
    this.dialog.remove()
  }
}
