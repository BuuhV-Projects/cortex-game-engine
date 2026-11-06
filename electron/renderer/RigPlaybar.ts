import * as THREE from 'three'
import { h } from './ui'
import { t } from './i18n'
import { formatSeconds } from './characterRigRegistry'

/**
 * Barra de reprodução da aba Animações (SPEC-0349 adendo 1): play/pausa, tempo
 * (arrastável), velocidade e "forçar laço", e a `AnimationAction` do clipe tocando
 * no `AnimationMixer` do modelo.
 */

const SPEED_MIN = 0.25
const SPEED_MAX = 2
const SPEED_STEP = 0.25
/** Folga (s) para considerar a ação no fim do clipe. */
const END_EPS = 1e-3

export class RigPlaybar {
  readonly el: HTMLElement
  private readonly playBtn: HTMLButtonElement
  private readonly timeInput: HTMLInputElement
  private readonly timeLabel: HTMLElement
  private readonly speedInput: HTMLInputElement
  private readonly speedLabel: HTMLElement
  private readonly forceLoopInput: HTMLInputElement
  private mixer: THREE.AnimationMixer | null = null
  private action: THREE.AnimationAction | null = null
  /** O clipe tocando tem laço no registro. */
  private loop = false
  private paused = false
  private scrubbing = false

  /** `beforeSeek` roda antes do `mixer.update(0)` do arrasto do tempo (devolve a pose do mixer). */
  constructor(private readonly beforeSeek: () => void) {
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
    this.el = h('div', { class: 'rig-anim__playbar' },
      this.playBtn,
      this.timeInput,
      this.timeLabel,
      h('span', { class: 'rig-anim__sep' }),
      h('span', { class: 'rig-anim__lbl' }, t('characterRig.anim.speed')),
      this.speedInput,
      this.speedLabel,
      h('label', { class: 'rig-check' }, this.forceLoopInput, h('span', {}, t('characterRig.anim.force_loop'))),
    )
  }

  /** Mixer do modelo carregado (`null` = sem modelo). */
  setMixer(mixer: THREE.AnimationMixer | null): void {
    this.action = null
    this.mixer = mixer
    mixer?.addEventListener('finished', () => {
      this.paused = true
      this.syncPlayBtn()
    })
    this.sync()
  }

  /** Clipe tocando agora. */
  get clip(): THREE.AnimationClip | null {
    return this.action?.getClip() ?? null
  }

  /** Toca `clip` do início (`loop` = laço do registro). */
  start(clip: THREE.AnimationClip, loop: boolean): void {
    if (!this.mixer) return
    this.action?.stop()
    this.loop = loop
    this.action = this.mixer.clipAction(clip)
    this.applyLoop()
    this.action.reset().play()
    this.paused = false
    this.applySpeed()
    this.timeInput.max = String(clip.duration)
    this.syncPlayBtn()
  }

  /** Avança o mixer (parado, pausado ou arrastando o tempo: não). */
  update(dt: number): void {
    if (this.mixer && !this.paused && !this.scrubbing) this.mixer.update(dt)
  }

  private applyLoop(): void {
    if (!this.action) return
    const loop = this.loop || this.forceLoopInput.checked
    this.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    this.action.clampWhenFinished = !loop
    if (loop && this.paused && this.atEnd()) this.action.paused = false
  }

  private applySpeed(): void {
    const s = Number(this.speedInput.value)
    this.speedLabel.textContent = `${s.toFixed(2)}×`
    if (this.mixer) this.mixer.timeScale = s
  }

  private atEnd(): boolean {
    const a = this.action
    return !!a && a.time >= a.getClip().duration - END_EPS
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
    this.beforeSeek()
    this.mixer.update(0)
    this.sync()
  }

  private syncPlayBtn(): void {
    this.playBtn.textContent = this.paused || !this.action ? '▶' : '❚❚'
    this.playBtn.title = t(this.paused ? 'characterRig.anim.play' : 'characterRig.anim.pause')
  }

  /** Tempo e rótulo de acordo com a ação. */
  sync(): void {
    const a = this.action
    const dur = a?.getClip().duration ?? 0
    const time = a ? Math.min(a.time, dur) : 0
    if (!this.scrubbing) this.timeInput.value = String(time)
    this.timeLabel.textContent = `${time.toFixed(2)} / ${formatSeconds(dur)}`
  }
}
