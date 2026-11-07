import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import {
  MARKER_GROUPS,
  MARKER_IDS,
  displayToGltf,
  estimateMarkers,
  fillMissingMarkers,
  gltfToDisplay,
  helperLines,
  isCenterMarker,
  markerColor,
  markerSide,
  markersPathFor,
  mirrorId,
  moveMarker,
  parseMarkersFile,
  sameSourceIn,
  sourcePathOf,
  serializeMarkersFile,
  symmetrize,
  validateMarkers,
  type MarkerId,
  type MarkerSet,
  type ValidationError,
  type Vec3,
} from './characterRig'
import type { ConfigEntry } from './characterRigProject'
import { RigMarkerViewport, trackPointer } from './RigMarkerViewport'

/**
 * Aba **Marcadores** do character-auto-rig (SPEC-0349): coluna com os círculos
 * (queixo, pulsos, cotovelos, joelhos, virilha…), simetria e erros; viewport com
 * o overlay SVG dos marcadores projetado pela câmera; lê e grava
 * `tools/characters/<CODE>.markers.json` (no espaço gltf).
 */

const SCOPE = 'characterRig'
const SVG_NS = 'http://www.w3.org/2000/svg'
const MARKER_RADIUS = 7
/** Distância do rótulo L/R à borda do círculo, em px. */
const LABEL_GAP = 4
/** Ajuste vertical do rótulo para centrar no círculo, em px. */
const LABEL_BASELINE = 4

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export class RigMarkerView {
  /** Corpo da aba (coluna + viewport). */
  readonly el: HTMLElement
  private readonly overlay: SVGSVGElement
  private readonly statusEl: HTMLElement
  private readonly errorsEl: HTMLElement
  private readonly symmetryInput: HTMLInputElement
  private readonly dots = new Map<MarkerId, HTMLElement>()
  private readonly viewport: RigMarkerViewport
  private markers: MarkerSet = {}
  private errors: ValidationError[] = []
  private lastSide: 'L' | 'R' = 'L'
  private loadToken = 0

  /** `dialog`: o fantasma do arraste vai dentro dele (top layer); `actions`: botões do rodapé da coluna. */
  constructor(private readonly dialog: HTMLDialogElement, actions: HTMLElement) {
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
    const side = h('aside', { class: 'rig-side' },
      h('div', { class: 'rig-side__title' }, t('characterRig.markers')),
      groups,
      h('div', { class: 'rig-hint' }, t('characterRig.hint')),
      symmetryField,
      resetBtn,
      this.errorsEl,
      h('span', { class: 'spacer', style: { flex: '1' } }),
      this.statusEl,
      actions,
    )

    this.overlay = svg('svg', { class: 'rig-overlay' })
    const viewEl = h('div', { class: 'rig-view' },
      this.overlay,
      h('div', { class: 'rig-view__hint' }, t('characterRig.view_hint')),
    )
    this.el = h('div', { class: 'rig-body' }, side, viewEl)
    this.viewport = new RigMarkerViewport(viewEl, this.overlay, () => this.draw(), (err) => {
      this.setStatus(t('characterRig.no_webgl'), true)
      debug(SCOPE, 'WebGL indisponível', err)
    })
  }

  setStatus(text: string, warn = false): void {
    this.statusEl.textContent = text
    this.statusEl.classList.toggle('warn', warn)
  }

  /** Carrega o GLB fonte da config e os marcadores (ou a estimativa). */
  async load(projectDir: string, entry: ConfigEntry): Promise<void> {
    const token = ++this.loadToken
    const { config } = entry
    this.viewport.clearModel()
    this.markers = {}
    this.errors = []
    this.setStatus(t('characterRig.loading', { file: config.source }))
    this.draw()
    try {
      const b64 = await window.electronAPI.readFileBase64(sourcePathOf(projectDir, config))
      if (token !== this.loadToken) return
      const gltf: GLTF = await new Promise((res, rej) => new GLTFLoader().parse(base64ToArrayBuffer(b64), '', res, rej))
      if (token !== this.loadToken) return
      this.viewport.setModel(gltf.scene, config.rotateZDeg)
      await this.loadMarkers(projectDir, entry)
      debug(SCOPE, 'modelo carregado', config.code, { rotateZDeg: config.rotateZDeg, frame: this.viewport.frame, box: this.viewport.box })
    } catch (err) {
      if (token !== this.loadToken) return
      this.setStatus(t('characterRig.load_failed', { error: err instanceof Error ? err.message : String(err) }), true)
    }
  }

  /** `.markers.json` existente (convertido para o espaço exibido) ou a estimativa pela caixa. */
  private async loadMarkers(projectDir: string, entry: ConfigEntry): Promise<void> {
    const { config } = entry
    const path = markersPathFor(entry.path)
    let text: string | null = null
    if (entry.hasMarkers) {
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
          if (p) markers[id] = gltfToDisplay(p, this.viewport.frame)
        }
        // arquivo antigo, sem os opcionais (ombros): vêm da estimativa
        const box = this.viewport.box
        this.markers = box ? fillMissingMarkers(markers, this.refineDepth(estimateMarkers(box))) : markers
        this.symmetryInput.checked = file.symmetry
        const mismatch = !sameSourceIn(projectDir, file.source, config.source) || file.code !== config.code
        this.setStatus(t(mismatch ? 'characterRig.loaded_mismatch' : 'characterRig.loaded', { file: fileName(path) }), mismatch)
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
    const box = this.viewport.box
    if (!box) return
    this.markers = this.refineDepth(estimateMarkers(box))
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
      if (p) out[id] = this.viewport.depthAt(p[0], p[1])
    }
    return out
  }

  /** Coloca `id` sob o cursor (com espelho/centro quando a simetria está ligada). */
  private placeAt(id: MarkerId, clientX: number, clientY: number): void {
    if (!this.viewport.hasModel) return
    const symmetry = this.symmetryInput.checked
    let p = this.viewport.pickClient(clientX, clientY)
    if (symmetry && isCenterMarker(id)) p = this.viewport.depthAt(0, p[1])
    const other = mirrorId(id)
    const mirror = symmetry && other ? this.viewport.depthAt(-p[0], p[1]) : undefined
    this.markers = moveMarker(this.markers, id, p, symmetry, mirror)
    this.lastSide = markerSide(id) ?? this.lastSide
    this.changed()
  }

  private changed(): void {
    this.errors = validateMarkers(this.markers, this.viewport.modelHeight)
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

  /** Arrasta um marcador já colocado. */
  private startMarkerDrag(id: MarkerId, e: PointerEvent): void {
    e.preventDefault()
    e.stopPropagation()
    trackPointer(e, (ev) => this.placeAt(id, ev.clientX, ev.clientY))
  }

  /** Arrasta da coluna para o modelo (um círculo fantasma segue o cursor). */
  private startPaletteDrag(id: MarkerId, e: PointerEvent): void {
    e.preventDefault()
    const ghost = h('div', { class: 'rig-ghost', style: { background: markerColor(id), left: `${e.clientX}px`, top: `${e.clientY}px` } })
    this.dialog.append(ghost) // dentro do <dialog>: fica na top layer, acima do backdrop
    trackPointer(e, (ev) => {
      ghost.style.left = `${ev.clientX}px`
      ghost.style.top = `${ev.clientY}px`
    }, (ev) => {
      ghost.remove()
      if (this.viewport.contains(ev.clientX, ev.clientY)) this.placeAt(id, ev.clientX, ev.clientY)
    })
  }

  draw(): void {
    const vp = this.viewport
    vp.render()
    const o = this.overlay
    o.textContent = ''
    if (!vp.box) return

    // Linha vertical do centro (x = 0).
    const [cx] = vp.toScreen([0, 0, 0])
    o.append(svg('line', { x1: cx, y1: 0, x2: cx, y2: vp.height, class: 'rig-centerline' }))

    for (const line of helperLines(this.markers)) {
      const [x1, y1] = vp.toScreen(line.from)
      const [x2, y2] = vp.toScreen(line.to)
      o.append(svg('line', { x1, y1, x2, y2, stroke: line.color, class: 'rig-helper' }))
    }

    const bad = new Set(this.errors.flatMap((e) => e.ids))
    for (const id of MARKER_IDS) {
      const p = this.markers[id]
      if (!p) continue
      const [x, y] = vp.toScreen(p)
      const g = svg('g', { class: `rig-marker${bad.has(id) ? ' bad' : ''}`, 'data-id': id, transform: `translate(${x} ${y})` })
      const title = svg('title', {})
      title.textContent = t(`characterRig.marker.${id}`)
      g.append(title, svg('circle', { r: MARKER_RADIUS, fill: markerColor(id) }))
      const side = markerSide(id)
      if (side) {
        const offset = MARKER_RADIUS + LABEL_GAP
        const label = svg('text', { x: side === 'L' ? offset : -offset, y: LABEL_BASELINE, 'text-anchor': side === 'L' ? 'start' : 'end' })
        label.textContent = t(`characterRig.side_${side}`)
        g.append(label)
      }
      g.addEventListener('pointerdown', (ev) => this.startMarkerDrag(id, ev))
      o.append(g)
    }
  }

  /** Valida e grava o `.markers.json` no espaço gltf. `false` se não gravou. */
  async save(entry: ConfigEntry): Promise<boolean> {
    this.errors = validateMarkers(this.markers, this.viewport.modelHeight)
    this.renderErrors()
    this.draw()
    if (this.errors.length || !this.viewport.box) {
      this.setStatus(t('characterRig.fix_errors'), true)
      return false
    }
    const markers = {} as Record<MarkerId, Vec3>
    for (const id of MARKER_IDS) markers[id] = displayToGltf(this.markers[id]!, this.viewport.frame)
    const { config } = entry
    const path = markersPathFor(entry.path)
    try {
      await window.electronAPI.writeFile(path, serializeMarkersFile({ code: config.code, source: config.source, symmetry: this.symmetryInput.checked, markers }))
    } catch (err) {
      this.setStatus(t('characterRig.save_failed', { error: String(err) }), true)
      return false
    }
    entry.hasMarkers = true
    debug(SCOPE, 'marcadores salvos', path, markers)
    this.setStatus(t('characterRig.saved', { file: fileName(path) }))
    return true
  }

  dispose(): void {
    this.loadToken++
    this.viewport.dispose()
  }
}
