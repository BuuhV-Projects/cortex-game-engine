import { TAU } from './math'
import type { WorldId } from './constants'

export interface Waypoint { x: number; y: number; z: number }

export interface TrackLayout {
  waypoints: Waypoint[]
  width: number
  startYaw: number
  /** Quando true, parte da pista fica suspensa — risco real de cair. */
  hasGaps: boolean
}

/**
 * Cada fase tem um perfil de curva diferente. Os layouts são paramétricos
 * (sem hardcode de coordenadas) pra ficarem variados sem dor.
 */
const PHASE_PROFILES: Array<(scale: number) => TrackLayout> = [
  // 0 — Oval plano clássico
  (s) => sampleClosedCurve((t) => ({
    x: Math.sin(t * TAU) * 60 * s,
    y: 0,
    z: Math.cos(t * TAU) * 35 * s,
  }), 48, 9),

  // 1 — Oito com cruzamento em VIADUTO. O oito passa pelo ponto (0, 0)
  //     em t=0 e t=0.5; usando y=(1-cos(t*TAU))*2.5 o primeiro cruzamento
  //     fica em Y=0 e o segundo em Y=5, criando um viaduto natural.
  (s) => sampleClosedCurve((t) => ({
    x: Math.sin(t * TAU * 2) * 45 * s,
    y: (1 - Math.cos(t * TAU)) * 2.5,       // [0, 5]
    z: Math.sin(t * TAU) * 50 * s,
  }), 56, 9),

  // 2 — S com elevação suave (Y sempre ≥ 0)
  (s) => sampleClosedCurve((t) => ({
    x: Math.sin(t * TAU) * 55 * s + Math.sin(t * TAU * 3) * 12 * s,
    y: (1 + Math.sin(t * TAU * 2)) * 2.5,   // [0, 5]
    z: Math.cos(t * TAU) * 45 * s,
  }), 60, 9),

  // 3 — Flor com morros
  (s) => sampleClosedCurve((t) => {
    const r = 40 * s + Math.cos(t * TAU * 4) * 14 * s
    return {
      x: Math.sin(t * TAU) * r,
      y: (Math.sin(t * TAU * 4) + 1) * 3,
      z: Math.cos(t * TAU) * r,
    }
  }, 64, 9),

  // 4 — Espiral helicoidal! Sobe ~14m de altura em metade da pista,
  //     desce na outra. Marcado como hasGaps pra ativar reset por queda.
  (s) => {
    const wps: Waypoint[] = []
    const segments = 72
    for (let i = 0; i < segments; i++) {
      const t = i / segments
      const r = 50 * s
      // Primeira metade: sobe em hélice. Segunda metade: desce.
      const ramp = t < 0.5
        ? Math.sin(t * Math.PI) * 14    // 0 → 14 → 0 no meio... ajustando:
        : Math.sin((1 - t) * Math.PI) * 14
      wps.push({
        x: Math.sin(t * TAU) * r,
        y: ramp,
        z: Math.cos(t * TAU) * r,
      })
    }
    const a = wps[0], b = wps[1]
    return { waypoints: wps, width: 10, startYaw: Math.atan2(b.x - a.x, b.z - a.z), hasGaps: true }
  },
]

function sampleClosedCurve(
  fn: (t: number) => Waypoint,
  segments: number,
  width: number,
): TrackLayout {
  const waypoints: Waypoint[] = []
  for (let i = 0; i < segments; i++) waypoints.push(fn(i / segments))
  const a = waypoints[0]
  const b = waypoints[1]
  const startYaw = Math.atan2(b.x - a.x, b.z - a.z)
  return { waypoints, width, startYaw, hasGaps: false }
}

/** Escala por mundo: o mundo 2 tem pistas um pouco maiores. */
export function getTrackLayout(world: WorldId, phase: number): TrackLayout {
  const profile = PHASE_PROFILES[phase % PHASE_PROFILES.length]
  const scale = world === 0 ? 1.0 : 1.15
  return profile(scale)
}
