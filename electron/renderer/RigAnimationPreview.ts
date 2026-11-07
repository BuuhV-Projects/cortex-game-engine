import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { h } from './ui'
import { getLocale, t } from './i18n'
import { debug } from '../../src/core/debug'
import { formatSeconds, resolveProjectPath, type RigBuildKind, type RigClip, type RigEntry } from './characterRigRegistry'
import { fileLabel, parseConfigObject } from './characterRigSelection'
import { RigArmAdjust } from './RigArmAdjust'
import { RigPlaybar } from './RigPlaybar'
import { bakeMessage, runBake } from './RigBakeRun'
import { jointLimitsOf } from './characterRigBake'
import { stripBom } from './rigPoseStore'
import { variantKey, weaponsGlbOf } from './characterRigWeapon'
import { RigPoseEditor } from './RigPoseEditor'
import type { JsonObject } from './characterRigSelection'

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
 * Adendo 8: pose por clipe, junta a junta (`RigPoseEditor`), aplicada depois dos
 * braços na mesma pilha de desfazer do quadro. Os sliders ficam em `RigArmAdjust`.
 * SPEC-0703: com uma arma escolhida, toca a variante `clipe@ARMA` se o build a tem.
 */

const SCOPE = 'characterRig'
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
  private readonly bakeBtn: HTMLButtonElement
  /** JSON do skin do build mostrado (o assado parte dele). */
  private skin: unknown = null
  private readonly bar: RigPlaybar

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
  private current: RigClip | null = null
  private loadToken = 0
  /** Clipe a tocar assim que o GLB carregar (pedido antes da carga terminar). */
  private wanted: string | null = null

  /** GLB das armas da config (relativo ao projeto), resolvido quando o projeto chega. */
  private weaponsGlb = ''
  // ── Ajuste dos braços (adendos 4–7) ──
  private readonly arm: RigArmAdjust
  // ── Pose por clipe (adendo 8) ──
  private readonly pose: RigPoseEditor
  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.el.isConnected && this.el.offsetParent !== null && this.pose.ui.handleKey(e)) e.preventDefault()
  }

  constructor() {
    this.buildSelect = h('select', { class: 'gs-input rig-anim__build', title: t('characterRig.anim.build') }) as HTMLSelectElement
    this.buildSelect.addEventListener('change', () => void this.changeBuild(this.buildSelect.value as RigBuildKind))
    this.buildInfo = h('div', { class: 'rig-anim__info' })
    this.listEl = h('div', { class: 'rig-anim__list' })
    this.statusEl = h('div', { class: 'rig-status' })
    this.bakeBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', title: t('characterRig.bake.hint'), onClick: () => void this.bake() }, t('characterRig.bake.button')) as HTMLButtonElement

    this.viewEl = h('div', { class: 'rig-view rig-anim__view' })
    this.arm = new RigArmAdjust(() => this.current?.name ?? null, () => this.renderList())
    this.bar = new RigPlaybar(() => this.arm.restore())
    this.initThree()
    this.pose = new RigPoseEditor({
      scene: this.scene,
      camera: this.camera,
      canvas: this.renderer?.domElement ?? null,
      orbit: this.controls,
      onChange: () => this.renderList(),
      onWeapon: () => {
        if (this.current) this.play(this.current.name, true)
      },
    })

    this.el = h('div', { class: 'rig-anim' },
      h('aside', { class: 'rig-side' },
        h('div', { class: 'rig-side__title' }, t('characterRig.anim.build')),
        this.buildSelect,
        this.buildInfo,
        this.bakeBtn,
        h('div', { class: 'rig-side__title' }, t('characterRig.anim.clips')),
        this.listEl,
        this.statusEl),
      h('div', { class: 'rig-anim__main' }, this.viewEl, this.bar.el, this.arm.el),
      this.pose.ui.el,
    )

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
    if (!on) {
      window.removeEventListener('keydown', this.onKey)
      return
    }
    window.addEventListener('keydown', this.onKey)
    this.clock.getDelta() // descarta o tempo parado
    const tick = (): void => {
      if (!this.active) return
      this.raf = requestAnimationFrame(tick)
      const dt = this.clock.getDelta()
      this.arm.restore()
      this.bar.update(dt)
      this.arm.apply()
      this.pose.apply(this.arm.undoStack)
      this.controls?.update()
      this.renderer?.render(this.scene, this.camera)
      this.bar.sync()
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
    void this.loadWeapons()
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
    this.arm.render()
    const path = resolveProjectPath(input.projectDir, build.glb)
    this.setStatus(t('characterRig.loading', { file: path }))
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (token !== this.loadToken) return
      const gltf: GLTF = await new Promise((res, rej) => new GLTFLoader().parse(base64ToArrayBuffer(b64), '', res, rej))
      if (token !== this.loadToken) return
      const skin = await this.loadSkin(resolveProjectPath(input.projectDir, build.clips))
      if (token !== this.loadToken) return
      this.setModel(gltf)
      this.skin = skin
      this.arm.setModel(this.model, skin)
      this.pose.setGenerated(skin)
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
    this.pose.setModel(model) // lê o repouso antes do mixer
    this.mixer = new THREE.AnimationMixer(model)
    this.bar.setMixer(this.mixer)
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
    this.bar.setMixer(null)
    this.current = null
    this.arm.setModel(null, null)
    this.pose.setModel(null)
    this.pose.setClip(null)
    this.pose.setGenerated(null)
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
        onClick: () => void this.requestPlay(c.name),
      },
      h('span', { class: 'rig-clip__name' }, c.name),
      h('span', { class: 'rig-clip__meta' }, `${formatSeconds(c.duration)}${c.loop ? ' · ⟳' : ''}`),
      h('span', { class: 'rig-clip__file' }, absent ? t('characterRig.anim.absent') : fileLabel(c.file)),
      ...(this.arm.needsRegen(c.name) || this.pose.needsRegen(c.name) ? [h('span', { class: 'rig-clip__adj' }, t('characterRig.arm.regen_short'))] : []))
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

  /** Pose não salva do clipe mostrado: confirma antes de trocar (adendo 8). */
  private async confirmLeavePose(): Promise<boolean> {
    const name = this.current?.name
    if (!name || !this.pose.isUnsaved()) return true
    return window.electronAPI.confirmDialog(t('characterRig.pose.switch_confirm', { name }))
  }

  private async requestPlay(name: string): Promise<void> {
    if (name !== this.current?.name && !(await this.confirmLeavePose())) return
    this.play(name)
  }

  private async changeBuild(kind: RigBuildKind): Promise<void> {
    if (!(await this.confirmLeavePose())) {
      if (this.kind) this.buildSelect.value = this.kind
      return
    }
    await this.loadBuild(kind)
  }

  /**
   * Toca o clipe `name` do registro (do início), ou a variante `name@ARMA` da arma
   * escolhida se o GLB a tem. `keep` = só a arma mudou: com a mesma animação, não reinicia.
   */
  play(name: string, keep = false): void {
    const weapon = this.pose.weapon.weapon
    const variant = weapon ? variantKey(name, weapon) : null
    const anim = variant && this.gltfClips.has(variant) ? variant : name
    const clip = this.gltfClips.get(anim)
    const rig = this.input?.entry.clips.find((c) => c.name === name)
    if (!this.mixer || !clip || !rig) {
      this.wanted = name // ainda carregando: toca quando chegar
      return
    }
    this.current = rig
    if (!(keep && this.bar.clip === clip)) this.bar.start(clip, rig.loop)
    this.pose.setClip(name, anim)
    this.arm.anim = anim
    this.renderList()
    this.arm.render()
    debug(SCOPE, 'tocando', anim, { loop: rig.loop, duration: clip.duration })
  }

  // ── Config (braços, pose e armas) ─────────────────────────────────────────

  /**
   * (Re)lê os ajustes da config no disco. Mesma config: ajuste ainda não salvo
   * continua valendo; outra config: começa do disco.
   */
  async reloadConfig(configPath: string): Promise<void> {
    let cfg: JsonObject | null = null
    try {
      cfg = parseConfigObject(await window.electronAPI.readFile(configPath))
    } catch (err) {
      debug(SCOPE, 'config ilegível (ajuste dos braços e pose)', configPath, err)
    }
    this.arm.setConfig(configPath, cfg)
    this.pose.limits = jointLimitsOf(cfg)
    this.pose.setConfig(configPath, cfg)
    this.weaponsGlb = weaponsGlbOf(cfg)
    this.renderList()
    await this.loadWeapons()
  }

  /** GLB das armas do projeto no seletor (precisa do projeto: `show`). */
  private async loadWeapons(): Promise<void> {
    if (this.input && this.weaponsGlb) await this.pose.setWeaponsGlb(resolveProjectPath(this.input.projectDir, this.weaponsGlb))
  }

  /** JSON do skin do build (`armOffsets`/`poseOffsets` por clipe); ilegível = `null` (gerado = 0). */
  private async loadSkin(path: string): Promise<unknown> {
    try {
      return JSON.parse(stripBom(await window.electronAPI.readFile(path))) as unknown
    } catch (err) {
      debug(SCOPE, 'JSON do skin ilegível: ajuste e pose gerados = 0', path, err)
      return null
    }
  }

  /**
   * "Gravar no GLB do jogo" (SPEC-0704): salva a config pendente, assa as chaves que diferem do build
   * mostrado e grava o GLB e o JSON do skin dele; depois recarrega o build.
   */
  private async bake(): Promise<void> {
    const input = this.input
    const build = input && this.kind ? input.entry[this.kind] : undefined
    if (!input || !build || !this.kind) return
    this.bakeBtn.disabled = true
    try {
      if (!(await this.saveArm()) || !(await this.savePose())) return
      const out = await runBake({ projectDir: input.projectDir, glb: build.glb, clips: build.clips, pose: this.pose, arm: this.arm, gltfClips: this.gltfClips, skin: this.skin })
      if (out.kind === 'done') await this.loadBuild(this.kind)
      const msg = bakeMessage(out)
      if (msg) this.setStatus(msg.text, msg.warn)
    } catch (err) {
      this.setStatus(t('characterRig.bake.failed', { error: err instanceof Error ? err.message : String(err) }), true)
    } finally {
      this.bakeBtn.disabled = false
    }
  }

  /** Grava os ajustes dos braços pendentes (antes de Gerar rig). */
  saveArm(): Promise<boolean> {
    return this.arm.save()
  }

  /** Grava a pose pendente de todos os clipes (Salvar pose / antes de Gerar rig). */
  savePose(): Promise<boolean> {
    return this.pose.ui.save()
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
    this.pose.dispose()
    this.controls?.dispose()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
    this.renderer = null
  }
}
