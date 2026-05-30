/**
 * SceneEditor — modo edit-in-place sobre a cena ativa (ADR-0026, Fase 1).
 *
 * Quando `enable()`d:
 *  - Substitui a câmera do jogo por uma `PerspectiveCamera` controlada por
 *    `OrbitControls` (orbita, zoom, pan).
 *  - Permite selecionar `Object3D` clicando no canvas (Raycaster nos
 *    descendentes da scene).
 *  - Manipula o selecionado com `TransformControls` (W=translate,
 *    E=rotate, R=scale — atalhos clássicos de Blender/Three editor).
 *  - Renderiza overlay com inspetor: nome, classe, geometry/material,
 *    inputs editáveis de position/rotation/scale e botão "Copy as code".
 *
 * Quando `disable()`d: restaura câmera do jogo, esconde overlay, desliga
 * controles. O jogo volta ao normal.
 *
 * Integração com IDE (opcional): escuta `postMessage` no `window` —
 * `{type:'cortex:editor:enable'}` ativa, `{type:'cortex:editor:disable'}`
 * desativa. Pode ser disparado por botão no Preview da IDE.
 *
 * Não invasivo: o jogo só precisa instanciar uma vez e chamar `enable()`
 * (ou amarrar a uma hotkey). Não exige refatorar a cena nem mexer no
 * GameLoop — o editor renderiza por cima do mesmo ciclo.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

// ─── Tipos públicos ────────────────────────────────────────────────────────

export interface SceneEditorOptions {
  /** Renderer do engine (já com canvas montado). */
  renderer: { domElement: HTMLCanvasElement; width: number; height: number }
  /** Cena ativa do jogo. */
  scene: THREE.Scene
  /** Câmera do jogo — restaurada ao `disable()`. */
  gameCamera: THREE.Camera
  /**
   * Callback chamado quando o usuário troca a câmera ativa via editor.
   * O `GameLoop` deve usar essa câmera ao renderizar enquanto o editor
   * está ativo. Se omitido, o editor não substitui a câmera (modo
   * "só inspector").
   */
  onCameraChange?: (camera: THREE.Camera) => void
  /** Container onde o overlay HTML é injetado. Default `document.body`. */
  overlayContainer?: HTMLElement
}

// ─── Implementação ──────────────────────────────────────────────────────────

export class SceneEditor {
  private readonly _renderer: SceneEditorOptions['renderer']
  private readonly _scene: THREE.Scene
  private readonly _gameCamera: THREE.Camera
  private readonly _onCameraChange?: (camera: THREE.Camera) => void
  private readonly _overlayContainer: HTMLElement

  private _editorCamera: THREE.PerspectiveCamera
  private _orbit: OrbitControls | null = null
  private _gizmo: TransformControls | null = null
  /** Helper visual do gizmo na cena — `Object3D` em Three r150+. */
  private _gizmoHelper: THREE.Object3D | null = null
  private _raycaster = new THREE.Raycaster()

  private _selected: THREE.Object3D | null = null
  private _enabled = false

  private _overlayEl: HTMLDivElement | null = null
  private _onCanvasPointerDown: ((e: PointerEvent) => void) | null = null
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null
  private _onWindowMessage: ((e: MessageEvent) => void) | null = null

  constructor(options: SceneEditorOptions) {
    this._renderer = options.renderer
    this._scene = options.scene
    this._gameCamera = options.gameCamera
    this._onCameraChange = options.onCameraChange
    this._overlayContainer = options.overlayContainer ?? document.body

    // Câmera do editor — inicializada com aspect razoável; é refrescada no enable().
    this._editorCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    this._editorCamera.position.set(5, 5, 5)
    this._editorCamera.lookAt(0, 0, 0)

    // Bridge IDE → jogo via postMessage. Pode ser disparado por botão no
    // Preview da IDE (sem que o jogo precise importar nada da IDE).
    this._onWindowMessage = (e: MessageEvent): void => {
      const data = e.data as { type?: string } | null
      if (!data || typeof data !== 'object') return
      if (data.type === 'cortex:editor:enable') this.enable()
      else if (data.type === 'cortex:editor:disable') this.disable()
      else if (data.type === 'cortex:editor:toggle') this.toggle()
    }
    window.addEventListener('message', this._onWindowMessage)
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  enable(): void {
    if (this._enabled) return
    this._enabled = true

    // Sincroniza aspect com canvas atual
    this._editorCamera.aspect = this._renderer.width / this._renderer.height
    this._editorCamera.updateProjectionMatrix()

    // OrbitControls — câmera órbita ao redor do ponto (0,0,0) por default
    this._orbit = new OrbitControls(this._editorCamera, this._renderer.domElement)
    this._orbit.enableDamping = true
    this._orbit.dampingFactor = 0.08

    // TransformControls — gizmo de manipulação. Adicionado à scene como
    // helper visual (não vira filho de nenhum objeto do jogo).
    this._gizmo = new TransformControls(this._editorCamera, this._renderer.domElement)
    // Desabilita OrbitControls enquanto arrasta o gizmo (evita conflito).
    this._gizmo.addEventListener('dragging-changed', (e) => {
      if (this._orbit) this._orbit.enabled = !(e as unknown as { value: boolean }).value
    })
    this._gizmo.addEventListener('objectChange', () => this._refreshInspector())
    // TransformControls em Three r150+ usa getHelper(); em versões antigas
    // a própria instância é Object3D. Tenta ambos.
    this._gizmoHelper = (this._gizmo as unknown as { getHelper?: () => THREE.Object3D }).getHelper?.() ??
      (this._gizmo as unknown as THREE.Object3D)
    this._scene.add(this._gizmoHelper)

    // Picking: clique no canvas seleciona o objeto sob o cursor
    this._onCanvasPointerDown = (e: PointerEvent): void => this._handlePick(e)
    this._renderer.domElement.addEventListener('pointerdown', this._onCanvasPointerDown)

    // Atalhos W/E/R/Esc — Blender-like
    this._onKeyDown = (e: KeyboardEvent): void => this._handleKey(e)
    window.addEventListener('keydown', this._onKeyDown)

    this._buildOverlay()
    this._onCameraChange?.(this._editorCamera)
  }

  disable(): void {
    if (!this._enabled) return
    this._enabled = false

    this._selected = null

    if (this._gizmo) {
      this._gizmo.detach()
      if (this._gizmoHelper) {
        this._scene.remove(this._gizmoHelper)
        this._gizmoHelper = null
      }
      this._gizmo.dispose()
      this._gizmo = null
    }
    if (this._orbit) {
      this._orbit.dispose()
      this._orbit = null
    }
    if (this._onCanvasPointerDown) {
      this._renderer.domElement.removeEventListener('pointerdown', this._onCanvasPointerDown)
      this._onCanvasPointerDown = null
    }
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown)
      this._onKeyDown = null
    }
    this._destroyOverlay()

    this._onCameraChange?.(this._gameCamera)
  }

  toggle(): void {
    this._enabled ? this.disable() : this.enable()
  }

  isEnabled(): boolean {
    return this._enabled
  }

  /**
   * Avança o estado dos controles. Chamar uma vez por frame do GameLoop
   * quando o editor está enabled (Orbit precisa pra damping suave).
   */
  update(): void {
    if (this._enabled && this._orbit) this._orbit.update()
  }

  /**
   * Libera todos os recursos. Não destrói a cena nem a câmera do jogo.
   */
  dispose(): void {
    this.disable()
    if (this._onWindowMessage) {
      window.removeEventListener('message', this._onWindowMessage)
      this._onWindowMessage = null
    }
  }

  // ─── Picking ───────────────────────────────────────────────────────────────

  private _handlePick(e: PointerEvent): void {
    // Ignora cliques no overlay (sidebar de inspetor)
    if (this._overlayEl?.contains(e.target as Node)) return
    // Ignora clique enquanto arrasta gizmo
    if (this._gizmo && (this._gizmo as unknown as { dragging?: boolean }).dragging === true) return

    const rect = this._renderer.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this._raycaster.setFromCamera(mouse, this._editorCamera)
    // Filtra alvos pra evitar selecionar o próprio gizmo
    const helper = this._gizmoHelper
    const targets: THREE.Object3D[] = []
    this._scene.traverse((obj) => {
      // Pula o helper do gizmo e seus descendentes
      if (helper !== null) {
        let cur: THREE.Object3D | null = obj
        while (cur !== null) {
          if (cur === helper) return
          cur = cur.parent
        }
      }
      if ((obj as THREE.Mesh).isMesh === true) targets.push(obj)
    })
    const hits = this._raycaster.intersectObjects(targets, false)
    if (hits.length === 0) {
      this._selectMesh(null)
      return
    }
    this._selectMesh(hits[0].object)
  }

  private _selectMesh(mesh: THREE.Object3D | null): void {
    this._selected = mesh
    if (mesh && this._gizmo) this._gizmo.attach(mesh)
    else this._gizmo?.detach()
    this._refreshInspector()
  }

  private _handleKey(e: KeyboardEvent): void {
    // Não interferir quando o foco está em input de texto (inspector)
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    if (!this._gizmo) return

    if (e.key === 'w' || e.key === 'W') this._gizmo.setMode('translate')
    else if (e.key === 'e' || e.key === 'E') this._gizmo.setMode('rotate')
    else if (e.key === 'r' || e.key === 'R') this._gizmo.setMode('scale')
    else if (e.key === 'Escape') this._selectMesh(null)
  }

  // ─── Overlay (inspector) ───────────────────────────────────────────────────

  private _buildOverlay(): void {
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed',
      'top:12px',
      'right:12px',
      'width:280px',
      'max-height:90vh',
      'overflow:auto',
      'z-index:99999',
      'background:rgba(9,9,11,0.92)',
      'color:#f4f4f5',
      'border:1px solid #3f3f46',
      'border-radius:8px',
      'padding:12px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:12px',
      'backdrop-filter:blur(4px)',
      'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
    ].join(';')
    this._overlayContainer.appendChild(overlay)
    this._overlayEl = overlay
    this._refreshInspector()
  }

  private _destroyOverlay(): void {
    if (this._overlayEl) {
      this._overlayEl.remove()
      this._overlayEl = null
    }
  }

  private _refreshInspector(): void {
    const el = this._overlayEl
    if (!el) return

    const header = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong style="font-size:13px;letter-spacing:0.02em;">Scene Editor</strong>
        <span style="font-size:10px;color:#71717a;">W/E/R · Esc</span>
      </div>
      <div style="height:1px;background:#3f3f46;margin:0 -12px 10px;"></div>
    `

    if (!this._selected) {
      el.innerHTML = `${header}<div style="color:#71717a;font-size:11px;">Click any mesh to inspect.</div>`
      return
    }

    const m = this._selected
    const mesh = m as THREE.Mesh
    const matName = Array.isArray(mesh.material)
      ? mesh.material.map((mat) => mat.type).join(', ')
      : mesh.material?.type ?? '-'
    const geomName = mesh.geometry?.type ?? '-'

    const px = m.position.x.toFixed(3)
    const py = m.position.y.toFixed(3)
    const pz = m.position.z.toFixed(3)
    const rx = THREE.MathUtils.radToDeg(m.rotation.x).toFixed(1)
    const ry = THREE.MathUtils.radToDeg(m.rotation.y).toFixed(1)
    const rz = THREE.MathUtils.radToDeg(m.rotation.z).toFixed(1)
    const sx = m.scale.x.toFixed(3)
    const sy = m.scale.y.toFixed(3)
    const sz = m.scale.z.toFixed(3)

    el.innerHTML = `
      ${header}
      <div style="margin-bottom:10px;">
        <div style="font-weight:600;color:#f4f4f5;">${escapeHtml(m.name || '(unnamed)')}</div>
        <div style="font-size:10px;color:#71717a;">${escapeHtml(m.type)} · ${escapeHtml(geomName)} · ${escapeHtml(matName)}</div>
      </div>

      ${vec3Row('Position', 'p', px, py, pz)}
      ${vec3Row('Rotation°', 'r', rx, ry, rz)}
      ${vec3Row('Scale', 's', sx, sy, sz)}

      <button data-act="copy" style="margin-top:12px;width:100%;padding:8px;background:#0ea5e9;border:none;color:white;border-radius:4px;cursor:pointer;font-weight:500;">Copy as code</button>
      <div data-toast style="margin-top:6px;font-size:10px;color:#22c55e;height:14px;"></div>
    `

    // Bind input changes
    el.querySelectorAll<HTMLInputElement>('input[data-axis]').forEach((input) => {
      input.addEventListener('input', () => this._applyInputChange(input))
    })
    el.querySelector<HTMLButtonElement>('button[data-act="copy"]')?.addEventListener('click', () => {
      this._copyAsCode()
    })
  }

  private _applyInputChange(input: HTMLInputElement): void {
    if (!this._selected) return
    const axis = input.dataset['axis'] as 'x' | 'y' | 'z'
    const group = input.dataset['group'] as 'p' | 'r' | 's'
    const raw = parseFloat(input.value)
    if (Number.isNaN(raw)) return
    const m = this._selected
    if (group === 'p') m.position[axis] = raw
    else if (group === 'r') m.rotation[axis] = THREE.MathUtils.degToRad(raw)
    else m.scale[axis] = raw
  }

  private _copyAsCode(): void {
    if (!this._selected) return
    const m = this._selected
    const name = m.name || 'mesh'
    const code =
      `// ${name}\n` +
      `${name}.position.set(${m.position.x.toFixed(3)}, ${m.position.y.toFixed(3)}, ${m.position.z.toFixed(3)})\n` +
      `${name}.rotation.set(${m.rotation.x.toFixed(4)}, ${m.rotation.y.toFixed(4)}, ${m.rotation.z.toFixed(4)})\n` +
      `${name}.scale.set(${m.scale.x.toFixed(3)}, ${m.scale.y.toFixed(3)}, ${m.scale.z.toFixed(3)})`
    void navigator.clipboard.writeText(code).then(() => {
      const toast = this._overlayEl?.querySelector<HTMLElement>('[data-toast]')
      if (toast) {
        toast.textContent = '✓ Copied to clipboard'
        window.setTimeout(() => {
          if (toast.textContent === '✓ Copied to clipboard') toast.textContent = ''
        }, 1800)
      }
    })
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function vec3Row(label: string, group: 'p' | 'r' | 's', x: string, y: string, z: string): string {
  return `
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;color:#a1a1aa;margin-bottom:3px;letter-spacing:0.05em;text-transform:uppercase;">${escapeHtml(label)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;">
        ${vec3Input(group, 'x', x)}
        ${vec3Input(group, 'y', y)}
        ${vec3Input(group, 'z', z)}
      </div>
    </div>
  `
}

function vec3Input(group: 'p' | 'r' | 's', axis: 'x' | 'y' | 'z', value: string): string {
  return `<input type="number" step="0.1" data-group="${group}" data-axis="${axis}" value="${escapeAttr(value)}" style="width:100%;padding:4px 6px;background:#18181b;border:1px solid #3f3f46;color:#f4f4f5;border-radius:3px;font-family:ui-monospace,monospace;font-size:11px;" />`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}
