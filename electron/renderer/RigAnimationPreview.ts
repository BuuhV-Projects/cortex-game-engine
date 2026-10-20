import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { h } from './ui'
import { getLocale, t } from './i18n'
import { debug } from '../../src/core/debug'
import { formatSeconds, resolveProjectPath, splitPath, type RigBuildKind, type RigClip, type RigEntry } from './characterRigRegistry'
import { fileLabel, parseConfigObject, serializeConfig } from './characterRigSelection'
import {
  ARM_OFFSET_KEYS,
  ARM_OFFSET_LIMITS,
  ARM_SIDES,
  CHEST_BONE,
  ZERO_OFFSETS,
  applyArmOffsets,
  applyArmOffsetsToAll,
  armOffsetsFromConfig,
  armOffsetsFromSkin,
  chestAxis,
  chestUp,
  clampOffset,
  configClipNames,
  localAfterWorldRotation,
  offsetDelta,
  sameOffsets,
  sideRotations,
  twistRotation,
  undoInReverse,
  type ArmOffsetKey,
  type ArmOffsets,
  type Quat,
  type Vec3,
} from './characterRigArmSpace'

/**
 * Aba **Animações** do painel auto-rig (SPEC-0349, adendo 1): toca os clipes do
 * GLB do registro de rigs (`tools/characters/rigs.json`) com câmera perspectiva,
 * OrbitControls, grade, `AnimationMixer` e uma barra de play/pausa, tempo,
 * velocidade e laço. O laço de desenho só roda com a aba visível.
 *
 * Adendo 4: ajuste dos braços por clipe (`shoulderLift`/`armSpace` da config,
 * o "Character Arm-Space" do Mixamo). A prévia aplica por cima do GLB só a
 * diferença entre o slider e o `armOffsets` gravado no JSON do skin do build.
 * Adendo 5: `shoulderBack` (ombros pra trás) e "aplicar a todos os clipes".
 * Adendo 7: `armTwist`/`foreArmTwist` (giro no eixo do braço e do antebraço).
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

const ARM_LABEL: Record<ArmOffsetKey, string> = {
  shoulderLift: 'characterRig.arm.shoulder',
  armSpace: 'characterRig.arm.space',
  elbowSpace: 'characterRig.arm.elbow',
  shoulderBack: 'characterRig.arm.back',
  armTwist: 'characterRig.arm.arm_twist',
  foreArmTwist: 'characterRig.arm.forearm_twist',
}

function toQuat(q: THREE.Quaternion): Quat {
  return [q.x, q.y, q.z, q.w]
}

function formatDeg(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}°`
}

/** Parâmetros `{lift, space, elbow, back, armTwist, foreTwist}` das mensagens de estado. */
function degParams(o: ArmOffsets): Record<string, string> {
  return { lift: formatDeg(o.shoulderLift), space: formatDeg(o.armSpace), elbow: formatDeg(o.elbowSpace), back: formatDeg(o.shoulderBack), armTwist: formatDeg(o.armTwist), foreTwist: formatDeg(o.foreArmTwist) }
}

/** Tira o BOM do começo do texto. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

interface ArmControl {
  range: HTMLInputElement
  num: HTMLInputElement
  reset: HTMLButtonElement
}

interface ArmBones {
  model: THREE.Object3D
  chest: THREE.Object3D
  /** Rotação do peito no repouso, no espaço do modelo. */
  chestRest: Quat
  sides: Array<{ sign: number; shoulder: THREE.Object3D; arm: THREE.Object3D; foreArm: THREE.Object3D; hand: THREE.Object3D }>
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
  private readonly armControls = new Map<ArmOffsetKey, ArmControl>()
  private readonly armStateEl: HTMLElement
  private readonly armSaveBtn: HTMLButtonElement
  private readonly armAllBtn: HTMLButtonElement

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

  // ── Ajuste dos braços (adendo 4) ──
  private configPath = ''
  /** Na config do disco, por clipe de `skinned.clips` (só os que existem na config). */
  private savedOffsets = new Map<string, ArmOffsets>()
  /** Editados no painel (pendentes de gravar). */
  private editedOffsets = new Map<string, ArmOffsets>()
  /** Gravados no build mostrado (`clips[nome].armOffsets` do JSON do skin). */
  private generatedOffsets = new Map<string, ArmOffsets>()
  private bones: ArmBones | null = null
  /**
   * Pose do mixer nos ossos girados, antes do ajuste. O `PropertyMixer` do three
   * só reescreve o osso quando o valor do clipe muda: sem restaurar antes de cada
   * `mixer.update`, o ajuste somaria a cada quadro (pausado ou quadro repetido).
   */
  private readonly armPose: Array<[THREE.Object3D, THREE.Quaternion]> = []
  private readonly tmpQ = new THREE.Quaternion()
  private readonly tmpQ2 = new THREE.Quaternion()
  private readonly tmpV = new THREE.Vector3()
  private readonly tmpV2 = new THREE.Vector3()

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

    for (const key of ARM_OFFSET_KEYS) {
      const { min, max, step } = ARM_OFFSET_LIMITS[key]
      const range = h('input', { type: 'range', class: 'rig-arm__range' }) as HTMLInputElement
      const num = h('input', { type: 'number', class: 'gs-input rig-arm__num' }) as HTMLInputElement
      for (const el of [range, num]) Object.assign(el, { min: String(min), max: String(max), step: String(step), value: '0' })
      range.addEventListener('input', () => this.setOffset(key, Number(range.value)))
      num.addEventListener('change', () => this.setOffset(key, Number(num.value)))
      const reset = h('button', { class: 'export-modal__btn export-modal__btn--secondary rig-arm__reset', type: 'button', onClick: () => this.setOffset(key, 0) }, t('characterRig.arm.reset')) as HTMLButtonElement
      this.armControls.set(key, { range, num, reset })
    }
    this.armStateEl = h('div', { class: 'rig-arm__state' })
    this.armSaveBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.saveArm() }, t('characterRig.arm.save')) as HTMLButtonElement
    this.armAllBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', title: t('characterRig.arm.apply_all_hint'), onClick: () => void this.applyToAll() }, t('characterRig.arm.apply_all')) as HTMLButtonElement
    const armRows = ARM_OFFSET_KEYS.map((key) => {
      const c = this.armControls.get(key)!
      const { min, max } = ARM_OFFSET_LIMITS[key]
      return h('label', { class: 'rig-arm__row', title: t('characterRig.arm.range', { min, max }) },
        h('span', { class: 'rig-anim__lbl rig-arm__lbl' }, t(ARM_LABEL[key])), c.range, c.num, h('span', { class: 'rig-anim__lbl' }, '°'), c.reset)
    })
    const armBar = h('div', { class: 'rig-arm', title: t('characterRig.arm.hint') },
      h('div', { class: 'rig-side__title' }, t('characterRig.arm.title')),
      h('div', { class: 'rig-arm__rows' }, ...armRows),
      h('div', { class: 'rig-arm__foot' }, this.armStateEl, this.armAllBtn, this.armSaveBtn))

    this.el = h('div', { class: 'rig-anim' },
      h('aside', { class: 'rig-side' },
        h('div', { class: 'rig-side__title' }, t('characterRig.anim.build')),
        this.buildSelect,
        this.buildInfo,
        h('div', { class: 'rig-side__title' }, t('characterRig.anim.clips')),
        this.listEl,
        this.statusEl),
      h('div', { class: 'rig-anim__main' }, this.viewEl, playbar, armBar),
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
      this.restoreArmPose()
      if (this.mixer && !this.paused && !this.scrubbing) this.mixer.update(dt)
      this.applyArmOffsets()
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
    this.renderArm()
    const path = resolveProjectPath(input.projectDir, build.glb)
    this.setStatus(t('characterRig.loading', { file: path }))
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (token !== this.loadToken) return
      const gltf: GLTF = await new Promise((res, rej) => new GLTFLoader().parse(base64ToArrayBuffer(b64), '', res, rej))
      if (token !== this.loadToken) return
      const generated = await this.loadGeneratedOffsets(resolveProjectPath(input.projectDir, build.clips))
      if (token !== this.loadToken) return
      this.generatedOffsets = generated
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
    this.bones = this.findArmBones(model)
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
    this.bones = null
    this.armPose.length = 0
    this.generatedOffsets = new Map()
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
      h('span', { class: 'rig-clip__file' }, absent ? t('characterRig.anim.absent') : fileLabel(c.file)),
      ...(this.needsRegen(c.name) ? [h('span', { class: 'rig-clip__adj' }, t('characterRig.arm.regen_short'))] : []))
      ;(row as HTMLButtonElement).disabled = absent
      this.listEl.append(row)
    }
    for (const p of input.pending) {
      this.listEl.append(h('div', { class: 'rig-clip pending', title: t('characterRig.anim.pending_hint') },
        h('span', { class: 'rig-clip__name' }, p.name),
        h('span', { class: 'rig-clip__meta' }, t('characterRig.anim.pending')),
        h('span', { class: 'rig-clip__file' }, fileLabel(p.file))))
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
    this.renderArm()
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
    this.restoreArmPose()
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

  // ── Ajuste dos braços (adendo 4) ──────────────────────────────────────────

  /**
   * (Re)lê os ajustes da config no disco. Mesma config: ajuste ainda não salvo
   * continua valendo; outra config: começa do disco.
   */
  async reloadConfig(configPath: string): Promise<void> {
    let saved = new Map<string, ArmOffsets>()
    try {
      saved = armOffsetsFromConfig(parseConfigObject(await window.electronAPI.readFile(configPath)))
    } catch (err) {
      debug(SCOPE, 'config ilegível (ajuste dos braços)', configPath, err)
    }
    if (configPath !== this.configPath) {
      this.editedOffsets = new Map()
    } else {
      for (const name of [...this.editedOffsets.keys()]) if (!this.isUnsaved(name)) this.editedOffsets.delete(name)
    }
    this.configPath = configPath
    this.savedOffsets = saved
    this.renderList()
    this.renderArm()
  }

  /** `armOffsets` por clipe do JSON do skin do build (ausente/ilegível = 0). */
  private async loadGeneratedOffsets(path: string): Promise<Map<string, ArmOffsets>> {
    try {
      return armOffsetsFromSkin(JSON.parse(stripBom(await window.electronAPI.readFile(path))))
    } catch (err) {
      debug(SCOPE, 'JSON do skin ilegível: ajuste gerado = 0', path, err)
      return new Map()
    }
  }

  private wantedOffsets(name: string): ArmOffsets {
    return this.editedOffsets.get(name) ?? this.savedOffsets.get(name) ?? ZERO_OFFSETS
  }

  private generatedOf(name: string): ArmOffsets {
    return this.generatedOffsets.get(name) ?? ZERO_OFFSETS
  }

  /** O ajuste desejado difere do que está no GLB mostrado. */
  private needsRegen(name: string): boolean {
    return !!this.kind && this.savedOffsets.has(name) && !sameOffsets(this.wantedOffsets(name), this.generatedOf(name))
  }

  private isUnsaved(name: string): boolean {
    const v = this.editedOffsets.get(name)
    return !!v && !sameOffsets(v, this.savedOffsets.get(name) ?? ZERO_OFFSETS)
  }

  private setOffset(key: ArmOffsetKey, value: number): void {
    const name = this.current?.name
    if (!name || !this.savedOffsets.has(name)) return
    this.editedOffsets.set(name, { ...this.wantedOffsets(name), [key]: clampOffset(key, value) })
    this.renderArm()
    this.renderList()
  }

  private renderArm(): void {
    const name = this.current?.name ?? null
    const editable = !!name && this.savedOffsets.has(name)
    const v = name ? this.wantedOffsets(name) : ZERO_OFFSETS
    for (const [key, c] of this.armControls) {
      c.range.value = String(v[key])
      c.num.value = String(v[key])
      c.range.disabled = c.num.disabled = !editable
      c.reset.disabled = !editable || v[key] === 0
    }
    this.armSaveBtn.disabled = ![...this.editedOffsets.keys()].some((n) => this.isUnsaved(n))
    this.armAllBtn.disabled = !editable || this.savedOffsets.size < 2
    this.armStateEl.classList.remove('warn')
    if (!name) {
      this.armStateEl.textContent = t('characterRig.arm.no_clip')
      return
    }
    if (!editable) {
      this.armStateEl.textContent = t('characterRig.arm.not_in_config', { name })
      this.armStateEl.classList.add('warn')
      return
    }
    const gen = this.generatedOf(name)
    const parts = [t('characterRig.arm.generated', degParams(gen))]
    if (this.needsRegen(name)) {
      parts.push(t('characterRig.arm.regen', degParams(offsetDelta(v, gen))))
      this.armStateEl.classList.add('warn')
    }
    if (this.isUnsaved(name)) parts.push(t('characterRig.arm.unsaved'))
    this.armStateEl.textContent = parts.join(' ')
  }

  /**
   * Relê a config do disco e grava os ajustes pendentes (campo 0 sai), só se o
   * texto muda. `false` se não conseguiu gravar.
   */
  async saveArm(): Promise<boolean> {
    const path = this.configPath
    const pending = new Map([...this.editedOffsets].filter(([n]) => this.isUnsaved(n)))
    if (!path || !pending.size) return true
    try {
      const before = stripBom(await window.electronAPI.readFile(path))
      const next = applyArmOffsets(parseConfigObject(before), pending)
      const text = serializeConfig(next)
      if (text !== before) {
        await window.electronAPI.writeFile(path, text)
        debug(SCOPE, 'ajuste dos braços gravado', path, Object.fromEntries(pending))
      }
      this.savedOffsets = armOffsetsFromConfig(next)
      this.editedOffsets = new Map()
      this.renderList()
      this.renderArm()
      this.armStateEl.textContent = `${this.armStateEl.textContent} ${t('characterRig.arm.saved', { file: splitPath(path).name })}`
      return true
    } catch (err) {
      this.armStateEl.textContent = t('characterRig.save_failed', { error: err instanceof Error ? err.message : String(err) })
      this.armStateEl.classList.add('warn')
      return false
    }
  }

  /**
   * Copia os 4 valores do clipe atual para todos os clipes de `skinned.clips`
   * (adendo 5): confirma, relê a config do disco e grava na hora (só se o texto
   * muda). Edições pendentes de outros clipes são substituídas.
   */
  async applyToAll(): Promise<boolean> {
    const path = this.configPath
    const name = this.current?.name
    if (!path || !name || !this.savedOffsets.has(name)) return false
    const offsets = this.wantedOffsets(name)
    try {
      const before = stripBom(await window.electronAPI.readFile(path))
      const cfg = parseConfigObject(before)
      const count = configClipNames(cfg).length
      if (!(await window.electronAPI.confirmDialog(t('characterRig.arm.apply_all_confirm', { name, count, ...degParams(offsets) })))) return false
      const next = applyArmOffsetsToAll(cfg, offsets)
      const text = serializeConfig(next)
      if (text !== before) {
        await window.electronAPI.writeFile(path, text)
        debug(SCOPE, 'ajuste dos braços aplicado a todos os clipes', path, { from: name, count, offsets })
      }
      this.savedOffsets = armOffsetsFromConfig(next)
      this.editedOffsets = new Map()
      this.renderList()
      this.renderArm()
      this.armStateEl.textContent = `${this.armStateEl.textContent} ${t('characterRig.arm.applied_all', { count, file: splitPath(path).name })}`
      return true
    } catch (err) {
      this.armStateEl.textContent = t('characterRig.save_failed', { error: err instanceof Error ? err.message : String(err) })
      this.armStateEl.classList.add('warn')
      return false
    }
  }

  /** Direção `from` → `to` no espaço do modelo (getWorldPosition recalcula a cadeia já girada). */
  private boneDir(from: THREE.Object3D, to: THREE.Object3D, model: THREE.Object3D): Vec3 {
    const a = model.worldToLocal(from.getWorldPosition(this.tmpV))
    const c = model.worldToLocal(to.getWorldPosition(this.tmpV2))
    return [c.x - a.x, c.y - a.y, c.z - a.z]
  }

  /** Rotação de mundo de `o` no espaço do modelo. */
  private modelQuat(o: THREE.Object3D, model: THREE.Object3D): Quat {
    model.getWorldQuaternion(this.tmpQ2).invert()
    return toQuat(this.tmpQ2.multiply(o.getWorldQuaternion(this.tmpQ)))
  }

  private findArmBones(model: THREE.Object3D): ArmBones | null {
    const chest = model.getObjectByName(CHEST_BONE)
    const sides = ARM_SIDES.map((s) => ({ sign: s.sign, shoulder: model.getObjectByName(s.shoulder), arm: model.getObjectByName(s.arm), foreArm: model.getObjectByName(s.foreArm), hand: model.getObjectByName(s.hand) }))
    if (!chest || sides.some((s) => !s.shoulder?.parent || !s.arm?.parent || !s.foreArm?.parent || !s.hand)) {
      debug(SCOPE, 'rig sem os ossos do ajuste dos braços', { chest: !!chest })
      return null
    }
    model.updateMatrixWorld(true)
    return {
      model,
      chest,
      chestRest: this.modelQuat(chest, model),
      sides: sides.map((s) => ({ sign: s.sign, shoulder: s.shoulder!, arm: s.arm!, foreArm: s.foreArm!, hand: s.hand! })),
    }
  }

  /** Devolve aos ossos a pose do mixer (desfaz o ajuste do quadro anterior). */
  private restoreArmPose(): void {
    undoInReverse(this.armPose, (bone, q) => bone.quaternion.copy(q))
  }

  /** Depois do mixer: gira clavícula e braço pela diferença (mesma conta do `arm_offsets` do jogo). */
  private applyArmOffsets(): void {
    const b = this.bones
    const name = this.current?.name
    if (!b || !name) return
    const d = offsetDelta(this.wantedOffsets(name), this.generatedOf(name))
    if (ARM_OFFSET_KEYS.every((k) => !d[k])) return
    const chest = this.modelQuat(b.chest, b.model)
    const axis = chestAxis(chest, b.chestRest)
    const up = chestUp(chest, b.chestRest)
    for (const side of b.sides) {
      const r = sideRotations(axis, up, side.sign, d)
      // clavícula, braço, antebraço: cada um lê o pai já girado (getWorldQuaternion recalcula a cadeia)
      // a torção usa a direção do osso já girado (pivô dele → pivô do filho), como o `arm_offsets`
      const steps: Array<[THREE.Object3D, () => Quat | null]> = [
        [side.shoulder, () => r.shoulder],
        [side.arm, () => r.arm],
        [side.arm, () => (d.armTwist ? twistRotation(this.boneDir(side.arm, side.foreArm, b.model), side.sign, d.armTwist) : null)],
        [side.foreArm, () => r.foreArm],
        [side.foreArm, () => (d.foreArmTwist ? twistRotation(this.boneDir(side.foreArm, side.hand, b.model), side.sign, d.foreArmTwist) : null)],
      ]
      for (const [bone, rotOf] of steps) {
        const rot = rotOf()
        if (!rot) continue
        this.armPose.push([bone, bone.quaternion.clone()])
        const local = localAfterWorldRotation(this.modelQuat(bone.parent!, b.model), toQuat(bone.quaternion), rot)
        bone.quaternion.set(local[0], local[1], local[2], local[3])
      }
    }
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
