/**
 * Som de motor via samples (BAC Mono) com crossfade entre 7 buffers.
 *
 * Os 7 samples têm RPM âncora e estado de carga (acelerador on/off):
 *   off:  low | mid | high | veryhigh
 *   on:   low | mid | high
 *
 * Cada source toca em loop num GainNode próprio. A cada `setSpeed` os
 * volumes são interpolados:
 *   1. peso_rpm[i] = triangular em volta de `anchor[i].rpm` (largura 0.35)
 *   2. peso_throttle[i] = throttle se sample é "on", senão 1 - throttle
 *   3. ganho final = peso_rpm * peso_throttle * masterMul
 *
 * Tudo roteado por um master GainNode → (PannerNode opcional) → destination.
 *
 * NOTA: Os buffers vêm do AssetLoader do engine. O AudioContext é
 * compartilhado (singleton via getAudioContext).
 */
import type { EngineSampleSet } from './engineSamples'

let sharedCtx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const C = (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ?? window.AudioContext
    sharedCtx = new C()
  }
  return sharedCtx
}

export function ensureAudioRunning(): void {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => { /* ignora */ })
  }
}

interface SampleAnchor {
  key: keyof EngineSampleSet
  rpm: number        // 0..1 (relativo a maxSpeed)
  isOn: boolean
}

const ANCHORS: SampleAnchor[] = [
  { key: 'offlow',      rpm: 0.00, isOn: false },
  { key: 'offmid',      rpm: 0.40, isOn: false },
  { key: 'offhigh',     rpm: 0.75, isOn: false },
  { key: 'offveryhigh', rpm: 1.00, isOn: false },
  { key: 'onlow',       rpm: 0.10, isOn: true  },
  { key: 'onmid',       rpm: 0.50, isOn: true  },
  { key: 'onhigh',      rpm: 0.90, isOn: true  },
]
/**
 * Largura do triângulo de peso por RPM. Mais largo = mais samples
 * sobrepõem simultaneamente, evitando o efeito "só um som".
 */
const ANCHOR_WIDTH = 0.55
/**
 * Mistura mínima entre on e off — mesmo no acelerador travado, mantemos
 * 25% do timbre "off" e vice-versa, pra os 7 samples sempre serem
 * audíveis e a transição não estourar a sensação.
 */
const ON_OFF_FLOOR = 0.25

export interface EngineAudioOptions {
  samples: EngineSampleSet
  /** Cria PannerNode (atenuação 3D) — usar pros AI; player fica não-posicional. */
  positional: boolean
  /** Multiplicador global de volume (default 0.25). */
  master?: number
  /** Tempo (s) de suavização do gain por sample (default 0.20). */
  smoothing?: number
}

export class EngineAudio {
  private readonly ctx: AudioContext
  private readonly sources: AudioBufferSourceNode[] = []
  private readonly gains: GainNode[] = []
  private readonly masterGain: GainNode
  private readonly panner: PannerNode | null
  private readonly masterMul: number
  private readonly smoothing: number
  private disposed = false

  constructor(options: EngineAudioOptions) {
    this.ctx = getAudioContext()
    this.masterMul = options.master ?? 0.25
    this.smoothing = options.smoothing ?? 0.20

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 1

    if (options.positional) {
      this.panner = this.ctx.createPanner()
      this.panner.distanceModel = 'inverse'
      this.panner.refDistance = 6
      this.panner.maxDistance = 90
      this.panner.rolloffFactor = 1.5
      this.masterGain.connect(this.panner)
      this.panner.connect(this.ctx.destination)
    } else {
      this.panner = null
      this.masterGain.connect(this.ctx.destination)
    }

    for (const a of ANCHORS) {
      const src = this.ctx.createBufferSource()
      src.buffer = options.samples[a.key]
      src.loop = true
      const g = this.ctx.createGain()
      g.gain.value = 0.0001
      src.connect(g)
      g.connect(this.masterGain)
      src.start(0, Math.random() * (src.buffer.duration || 0))  // fase aleatória pra não sincronizar
      this.sources.push(src)
      this.gains.push(g)
    }
  }

  /**
   * Atualiza pesos dos samples com base na velocidade atual e no estado
   * do acelerador (0 = solto, 1 = pressionado).
   */
  setSpeed(speed: number, maxSpeed: number, throttle: number): void {
    if (this.disposed) return
    const t = Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed))
    const thr = Math.max(0, Math.min(1, throttle))
    // Piso de mistura: "on" sempre escuta um pouco do "off" e vice-versa.
    // Resultado em [FLOOR, 1 - FLOOR] em vez de [0, 1].
    const onWeight  = ON_OFF_FLOOR + thr        * (1 - 2 * ON_OFF_FLOOR)
    const offWeight = ON_OFF_FLOOR + (1 - thr)  * (1 - 2 * ON_OFF_FLOOR)
    const now = this.ctx.currentTime

    for (let i = 0; i < ANCHORS.length; i++) {
      const a = ANCHORS[i]
      const wRpm = Math.max(0, 1 - Math.abs(t - a.rpm) / ANCHOR_WIDTH)
      const wThr = a.isOn ? onWeight : offWeight
      const target = Math.max(0.0001, wRpm * wThr * this.masterMul)
      this.gains[i].gain.setTargetAtTime(target, now, this.smoothing)
    }
  }

  setPosition(x: number, y: number, z: number): void {
    if (this.disposed || !this.panner) return
    const now = this.ctx.currentTime
    this.panner.positionX.setValueAtTime(x, now)
    this.panner.positionY.setValueAtTime(y, now)
    this.panner.positionZ.setValueAtTime(z, now)
  }

  /**
   * Muta ou desmuta com fade curto — pra pausar a corrida sem dispose.
   * O som volta com o mesmo perfil quando `setMute(false)` for chamado.
   */
  setMute(muted: boolean, fadeMs = 180): void {
    if (this.disposed) return
    const now = this.ctx.currentTime
    const target = muted ? 0.0001 : 1
    this.masterGain.gain.setTargetAtTime(target, now, fadeMs / 1000 / 3)
  }

  /**
   * Fade out o motor e dispõe os nós após o fade. Idempotente.
   */
  stop(fadeMs = 250): void {
    if (this.disposed) return
    const now = this.ctx.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setTargetAtTime(0.0001, now, fadeMs / 1000 / 3)
    setTimeout(() => this.dispose(), fadeMs + 60)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const s of this.sources) { try { s.stop() } catch { /* já parado */ } s.disconnect() }
    for (const g of this.gains) g.disconnect()
    this.masterGain.disconnect()
    this.panner?.disconnect()
  }
}

/** Posiciona o listener (ouvinte) no espaço 3D do AudioContext. */
export function setAudioListenerPosition(x: number, y: number, z: number): void {
  const ctx = getAudioContext()
  const listener = ctx.listener
  const now = ctx.currentTime
  if (listener.positionX) {
    listener.positionX.setValueAtTime(x, now)
    listener.positionY.setValueAtTime(y, now)
    listener.positionZ.setValueAtTime(z, now)
  } else {
    (listener as AudioListener & { setPosition?: (x:number,y:number,z:number)=>void })
      .setPosition?.(x, y, z)
  }
}
