import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { h } from './ui'
import { getLocale, t } from './i18n'
import { debug } from '../../src/core/debug'
import { formatSeconds, resolveProjectPath, type RigBuildKind, type RigClip, type RigEntry } from './characterRigRegistry'

/**
 * Aba **Animações** do painel auto-rig (SPEC-0349, adendo 1): toca os clipes do
 * GLB do registro de rigs (`tools/characters/rigs.json`) com câmera perspectiva,
 * OrbitControls, grade, `AnimationMixer` e uma barra de play/pausa, tempo,
 * velocidade e laço. O laço de desenho só roda com a aba visível.
 */

const SCOPE = 'characterRig'
const SPEED_MIN = 0.25
const SPEED_MAX = 2
const SPEED_STEP = 0.25
/** Distância da câmera em alturas do personagem (enquadra o corpo inteiro com margem). */
const CAMERA_DISTANCE = 1.9

export interface RigPreviewInput {
  projectDir: string
  entry: RigEntry
  /** Builds com GLB existente, o mais recente primeiro (vazio = sem prévia). */
  builds: RigBuildKind[]
  /** Selecionados na config que ainda não estão no rig (nome do clipe, FBX). */
  pending: Array<{ name: string; file: string }>
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export class RigAnimationPreview {
  readonly el: HTMLElement
  private readonly viewEl: HTMLElement
  private readonly buildSelect: HTMLSelectElement
  private readonly buildInfo: HTMLElement
  private readonly listEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly playBtn: HTMLButtonElement
  private readonly timeInput: HTMLInputElement
  private readonly timeLabel: HTMLElement
  private readonly speedInput: HTMLInputElement
  private readonly speedLabel: HTMLElement
  private readonly forceLoopInput: HTMLInputElement

  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200)
  private controls: OrbitControls | null = null
  private readonly resizeObserver: ResizeObserver
  private readonly clock = new THREE.Clock()
  private raf = 0
  private active = false

  private input: RigPreviewInput | null = null
  private kind: RigBuildKind | null = null
  private model: THREE.Object3D | null = null
  private mixer: THREE.AnimationMixer | null = null
  private gltfClips = new Map<string, THREE.AnimationClip>()
  private action: THREE.AnimationAction | null = null
  private current: RigClip | null = null
  private paused = false
  private scrubbing = false
  private loadToken = 0
  /** Clipe a tocar assim que o GLB carregar (pedido antes da carga terminar). */
  private wanted: string | null = null

  constructor() {
    this.buildSelect = h('select', { class: 'gs-input rig-anim__build', title: t('characterRig.anim.build') }) as HTMLSelectElement
    this.buildSelect.addEventListener('change', () => void this.loadBuild(this.buildSelect.value as RigBuildKind))
    this.buildInfo = h('div', { class: 'rig-anim__info' })
    this.listEl = h('div', { class: 'rig-anim__list' })
    this.statusEl = h('div', { class: 'rig-status' })

    this.viewEl = h('div', { class: 'rig-view rig-anim__view' })
    this.playBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary rig-anim__play', type: 'button', onClick: () => this.togglePlay() }, '▶') as HTMLButtonElement
    this.timeInput = h('input', { type: 'range', class: 'rig-anim__time', value: '0' }) as HTMLInputElement
    Object.assign(this.timeInput, { min: '0', max: '1', step: '0.001' })
    this.timeInput.addEventListener('pointerdown', () => (this.scrubbing = true))
    this.timeInput.addEventListener('pointerup', () => (this.scrubbing = false))
    this.timeInput.addEventListener('change', () => (this.scrubbing = false))
    this.timeInput.addEventListener('input', () => this.seek(Number(this.timeInput.value)))
    this.timeLabel = h('span', { class: 'rig-anim__tcode' }, '0.00 / 0.00 s')
    this.speedInput = h('input', { type: 'range', class: 'rig-anim__speed', title: t('characterRig.anim.speed') }) as HTMLInputElement
    Object.assign(this.speedInput, { min: String(SPEED_MIN), max: String(SPEED_MAX), step: String(SPEED_STEP), value: '1' })
    this.speedInput.addEventListener('input', () => this.applySpeed())
    this.speedLabel = h('span', { class: 'rig-anim__tcode' }, '1.00×')
    this.forceLoopInput = h('input', { type: 'checkbox' }) as HTMLInputElement
    this.forceLoopInput.addEventListener('change', () => this.applyLoop())

    const playbar = h('div', { class: 'rig-anim__playbar' },
      this.playBtn,
      this.timeInput,
      this.timeLabel,
      h('span', { class: 'rig-anim__sep' }),
      h('span', { class: 'rig-anim__lbl' }, t('characterRig.anim.speed')),
      this.speedInput,
      this.speedLabel,
      h('label', { class: 'rig-check' }, this.forceLoopInput, h('span', {}, t('characterRig.anim.force_loop'))),
    )

    this.el = h('div', { class: 'rig-anim' },
      h('aside', { class: 'rig-side' },
        h('div', { class: 'rig-side__title' }, t('characterRig.anim.build')),
        this.buildSelect,
        this.buildInfo,
        h('div', { class: 'rig-side__title' }, t('characterRig.anim.clips')),
        this.listEl,
        this.statusEl),
      h('div', { class: 'rig-anim__main' }, this.viewEl, playbar),
    )

    this.initThree()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.viewEl)
  }

  // ── three.js ──────────────────────────────────────────────────────────────

  private initThree(): void {
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.className = 'rig-canvas'
      this.viewEl.append(renderer.domElement)
      this.renderer = renderer
      this.controls = new OrbitControls(this.camera, renderer.domElement)
      this.controls.enableDamping = true
    } catch (err) {
      this.setStatus(t('characterRig.no_webgl'), true)
      debug(SCOPE, 'WebGL indisponível (prévia)', err)
    }
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 2.0)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(2, 4, 3)
    const grid = new THREE.GridHelper(10, 20, 0x5a5d72, 0x33354a)
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.5
    this.scene.add(hemi, key, grid)
  }

  private resize(): void {
    const w = this.viewEl.clientWidth || 1
    const hgt = this.viewEl.clientHeight || 1
    this.renderer?.setSize(w, hgt, false)
    this.camera.aspect = w / hgt
    this.camera.updateProjectionMatrix()
  }

  /** Liga/desliga o laço de desenho (só com a aba visível). */
  setActive(on: boolean): void {
    if (on === this.active) return
    this.active = on
    cancelAnimationFrame(this.raf)
    if (!on) return
    this.clock.getDelta() // descarta o tempo parado
    const tick = (): void => {
      if (!this.active) return
      this.raf = requestAnimationFrame(tick)
      const dt = this.clock.getDelta()
      if (this.mixer && !this.paused && !this.scrubbing) this.mixer.update(dt)
      this.controls?.update()
      this.renderer?.render(this.scene, this.camera)
      this.syncTime()
    }
    tick()
  }

  // ── Carga ─────────────────────────────────────────────────────────────────

  /** Mostra o rig do registro (ou limpa, com `null`). Recarrega o GLB se o build mudou. */
  async show(input: RigPreviewInput | null): Promise<void> {
    const prev = this.input
    this.input = input
    if (!input || !input.builds.length) {
      this.loadToken++
      this.clearModel()
      this.kind = null
      this.renderBuilds()
      this.renderList()
      return
    }
    // Mesmo conjunto de builds e o mostrado não mudou: só atualiza a lista. Se
    // apareceu/sumiu um build (ex.: --approve gravou `published`), volta ao mais recente.
    const keep = prev && this.kind && prev.builds.join() === input.builds.join()
      && prev.entry[this.kind]?.glb === input.entry[this.kind]?.glb
      && prev.entry[this.kind]?.at === input.entry[this.kind]?.at
    this.renderBuilds()
    if (keep) {
      this.renderList()
      return
    }
    await this.loadBuild(input.builds[0]!)
  }

  private renderBuilds(): void {
    const input = this.input
    this.buildSelect.textContent = ''
    for (const k of input?.builds ?? []) this.buildSelect.append(h('option', { value: k }, t(`characterRig.anim.kind_${k}`)))
    this.buildSelect.disabled = (input?.builds.length ?? 0) < 2
    if (this.kind) this.buildSelect.value = this.kind
    const build = input && this.kind ? input.entry[this.kind] : undefined
    this.buildInfo.textContent = build
      ? t('characterRig.anim.build_info', { kind: t(`characterRig.anim.kind_${this.kind}`), at: new Date(build.at).toLocaleString(getLocale() === 'pt' ? 'pt-BR' : 'en-US') })
      : ''
    this.buildInfo.title = build?.glb ?? ''
  }

  private async loadBuild(kind: RigBuildKind): Promise<void> {
    const input = this.input
    const build = input?.entry[kind]
    if (!input || !build) return
    const token = ++this.loadToken
    const playing = this.current?.name ?? this.wanted
    this.clearModel()
    this.kind = kind
    this.renderBuilds()
    this.renderList()
    const path = resolveProjectPath(input.projectDir, build.glb)
    this.setStatus(t('characterRig.loading', { file: path }))
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (token !== this.loadToken) return
      const gltf: GLTF = await new Promise((res, rej) => new GLTFLoader().parse(base64ToArrayBuffer(b64), '', res, rej))
      if (token !== this.loadToken) return
      this.setModel(gltf)
      this.setStatus('')
      debug(SCOPE, 'rig carregado', kind, path, gltf.animations.map((a) => a.name))
      const first = input.entry.clips.find((c) => this.gltfClips.has(c.name))
      const next = playing && this.gltfClips.has(playing) ? playing : first?.name
      this.wanted = null
      if (next) this.play(next)
    } catch (err) {
      if (token !== this.loadToken) return
      this.setStatus(t('characterRig.load_failed', { error: err instanceof Error ? err.message : String(err) }), true)
    }
  }

  private setModel(gltf: GLTF): void {
    const model = gltf.scene
    // No GLB do rig o COLOR_0 é o índice de região do jogo (atributo `slot`),
    // não cor: multiplicado na textura deixaria o boneco vermelho/preto.
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      const mats = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
      for (const m of mats) {
        if ((m as THREE.MeshStandardMaterial).vertexColors) {
          m.vertexColors = false
          m.needsUpdate = true
        }
      }
    })
    this.scene.add(model)
    this.model = model
    this.gltfClips = new Map(gltf.animations.map((a) => [a.name, a]))
    this.mixer = new THREE.AnimationMixer(model)
    this.mixer.addEventListener('finished', () => {
      this.paused = true
      this.syncPlayBtn()
    })
    // Enquadra pela caixa na pose de ligação (pés no chão em y ≈ 0).
    const box = new THREE.Box3().setFromObject(model, true)
    const height = Math.max(box.max.y - box.min.y, 0.1)
    const center = box.getCenter(new THREE.Vector3())
    const target = new THREE.Vector3(center.x, box.min.y + height * 0.5, center.z)
    this.camera.near = height / 100
    this.camera.far = height * 100
    this.camera.position.set(target.x + height * 0.6, target.y + height * 0.15, target.z + height * CAMERA_DISTANCE)
    this.camera.updateProjectionMatrix()
    this.controls?.target.copy(target)
    this.controls?.update()
    this.renderList()
  }

  /** Libera o modelo: mixer, geometrias, materiais, texturas e esqueletos. */
  private clearModel(): void {
    this.action = null
    this.current = null
    if (this.mixer) {
      this.mixer.stopAllAction()
      if (this.model) this.mixer.uncacheRoot(this.model)
      this.mixer = null
    }
    this.gltfClips.clear()
    if (!this.model) return
    this.scene.remove(this.model)
    this.model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      mesh.geometry?.dispose()
      if (mesh.isSkinnedMesh) mesh.skeleton?.dispose()
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
        m.dispose()
      }
    })
    this.model = null
    this.syncTime()
  }

  // ── Lista ─────────────────────────────────────────────────────────────────

  private renderList(): void {
    this.listEl.textContent = ''
    const input = this.input
    if (!input) return
    const loaded = this.gltfClips.size > 0
    for (const c of input.entry.clips) {
      const absent = loaded && !this.gltfClips.has(c.name)
      const row = h('button', {
        type: 'button',
        class: `rig-clip${this.current?.name === c.name ? ' on' : ''}${absent ? ' absent' : ''}`,
        title: c.file,
        onClick: () => this.play(c.name),
      },
      h('span', { class: 'rig-clip__name' }, c.name),
      h('span', { class: 'rig-clip__meta' }, `${formatSeconds(c.duration)}${c.loop ? ' · ⟳' : ''}`),
      h('span', { class: 'rig-clip__file' }, absent ? t('characterRig.anim.absent') : c.file))
      ;(row as HTMLButtonElement).disabled = absent
      this.listEl.append(row)
    }
    for (const p of input.pending) {
      this.listEl.append(h('div', { class: 'rig-clip pending', title: t('characterRig.anim.pending_hint') },
        h('span', { class: 'rig-clip__name' }, p.name),
        h('span', { class: 'rig-clip__meta' }, t('characterRig.anim.pending')),
        h('span', { class: 'rig-clip__file' }, p.file)))
    }
  }

  // ── Reprodução ────────────────────────────────────────────────────────────

  /** Toca o clipe `name` do registro (do início). */
  play(name: string): void {
    const clip = this.gltfClips.get(name)
    const rig = this.input?.entry.clips.find((c) => c.name === name)
    if (!this.mixer || !clip || !rig) {
      this.wanted = name // ainda carregando: toca quando chegar
      return
    }
    this.action?.stop()
    this.current = rig
    this.action = this.mixer.clipAction(clip)
    this.applyLoop()
    this.action.reset().play()
    this.paused = false
    this.applySpeed()
    this.timeInput.max = String(clip.duration)
    this.syncPlayBtn()
    this.renderList()
    debug(SCOPE, 'tocando', name, { loop: rig.loop, duration: clip.duration })
  }

  private applyLoop(): void {
    if (!this.action || !this.current) return
    const loop = this.current.loop || this.forceLoopInput.checked
    this.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    this.action.clampWhenFinished = !loop
    if (loop && this.paused && this.atEnd()) {
      this.action.paused = false
    }
  }

  private applySpeed(): void {
    const s = Number(this.speedInput.value)
    this.speedLabel.textContent = `${s.toFixed(2)}×`
    if (this.mixer) this.mixer.timeScale = s
  }

  private atEnd(): boolean {
    const a = this.action
    return !!a && a.time >= a.getClip().duration - 1e-3
  }

  private togglePlay(): void {
    const a = this.action
    if (!a) return
    if (this.paused) {
      if (this.atEnd() && a.loop === THREE.LoopOnce) a.reset()
      a.paused = false
      a.enabled = true
      if (!a.isRunning()) a.play()
      this.paused = false
    } else {
      this.paused = true
    }
    this.syncPlayBtn()
  }

  private seek(time: number): void {
    const a = this.action
    if (!a || !this.mixer) return
    a.enabled = true
    a.paused = false
    if (!a.isRunning()) a.play()
    a.time = Math.min(time, a.getClip().duration)
    this.mixer.update(0)
    this.syncTime()
  }

  private syncPlayBtn(): void {
    this.playBtn.textContent = this.paused || !this.action ? '▶' : '❚❚'
    this.playBtn.title = t(this.paused ? 'characterRig.anim.play' : 'characterRig.anim.pause')
  }

  private syncTime(): void {
    const a = this.action
    const dur = a?.getClip().duration ?? 0
    const time = a ? Math.min(a.time, dur) : 0
    if (!this.scrubbing) this.timeInput.value = String(time)
    this.timeLabel.textContent = `${time.toFixed(2)} / ${formatSeconds(dur)}`
  }

  private setStatus(text: string, warn = false): void {
    this.statusEl.textContent = text
    this.statusEl.classList.toggle('warn', warn)
  }

  /** Libera tudo (modelo, mixer, controles, renderer). */
  dispose(): void {
    this.loadToken++
    this.setActive(false)
    this.resizeObserver.disconnect()
    this.clearModel()
    this.controls?.dispose()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
    this.renderer = null
  }
}
