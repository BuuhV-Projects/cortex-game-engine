/**
 * Sons curtos de UI sintetizados via Web Audio API.
 *
 * Usa o mesmo AudioContext do engineAudio. Cada efeito é um oscilador
 * disposable com envelope de gain (~60-150ms): cria, toca, descarta.
 *
 * NOTA: como `EngineAudio`, isso usa Web Audio direto porque o
 * AudioManager do cortex-engine só lida com AudioBuffer pré-gravado.
 */
import { ensureAudioRunning, getAudioContext } from './engineAudio'

interface BlipOptions {
  /** Forma de onda (default 'triangle'). */
  type?: OscillatorType
  /** Frequência inicial em Hz. */
  fromHz: number
  /** Frequência final em Hz (default = fromHz). */
  toHz?: number
  /** Duração total em segundos (default 0.08). */
  duration?: number
  /** Volume de pico (default 0.18). */
  peak?: number
}

function blip(o: BlipOptions): void {
  try {
    ensureAudioRunning()
    const ctx = getAudioContext()
    // Se ainda não foi destravado (sem user-gesture), `state` fica em
    // "suspended" — o som não rola, mas evitamos exceção.
    if (ctx.state !== 'running') return

    const dur = o.duration ?? 0.08
    const peak = o.peak ?? 0.18
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'triangle'
    osc.frequency.setValueAtTime(o.fromHz, now)
    if (o.toHz !== undefined && o.toHz !== o.fromHz) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.toHz), now + dur)
    }

    const gain = ctx.createGain()
    // Envelope: ataque rápido (5ms), decay até 0 ao fim
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + dur + 0.02)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  } catch { /* contexto fechado / sem permissão — ignora */ }
}

/** Mover foco entre itens — tick curto e seco. */
export function playNav(): void {
  blip({ type: 'square', fromHz: 720, duration: 0.045, peak: 0.10 })
}

/** Confirmar ação (A / Enter) — sobe rápido. */
export function playConfirm(): void {
  blip({ type: 'triangle', fromHz: 520, toHz: 880, duration: 0.12, peak: 0.16 })
}

/** Voltar / cancelar (B / Esc) — desce. */
export function playCancel(): void {
  blip({ type: 'triangle', fromHz: 560, toHz: 220, duration: 0.13, peak: 0.14 })
}
