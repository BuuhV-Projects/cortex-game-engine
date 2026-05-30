import type { TrackLayout, Waypoint } from './trackLayouts'

/**
 * Wrapper imutável passado aos systems que precisam da pista.
 * Pré-calcula comprimentos de segmento e total — usado pra ranking.
 */
export class TrackContext {
  readonly segmentLengths: number[]
  readonly totalLength: number

  constructor(public readonly layout: TrackLayout) {
    this.segmentLengths = []
    let total = 0
    const wps = layout.waypoints
    for (let i = 0; i < wps.length; i++) {
      const a = wps[i]
      const b = wps[(i + 1) % wps.length]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      this.segmentLengths.push(len)
      total += len
    }
    this.totalLength = total
  }

  get count(): number { return this.layout.waypoints.length }

  wp(i: number): Waypoint {
    const n = this.layout.waypoints.length
    return this.layout.waypoints[((i % n) + n) % n]
  }

  /**
   * Retorna o índice de waypoint mais próximo do ponto (x,z) e a distância
   * perpendicular ao segmento que começa nesse waypoint.
   */
  nearestSegment(x: number, z: number): { index: number; perpDist: number; alongT: number } {
    let bestIdx = 0
    let bestDist2 = Infinity
    let bestT = 0
    const n = this.layout.waypoints.length
    for (let i = 0; i < n; i++) {
      const a = this.wp(i)
      const b = this.wp(i + 1)
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len2 = dx * dx + dz * dz
      if (len2 === 0) continue
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
      const px = a.x + dx * t
      const pz = a.z + dz * t
      const d2 = (x - px) * (x - px) + (z - pz) * (z - pz)
      if (d2 < bestDist2) {
        bestDist2 = d2
        bestIdx = i
        bestT = t
      }
    }
    return { index: bestIdx, perpDist: Math.sqrt(bestDist2), alongT: bestT }
  }

  /** Posição acumulada ao longo da pista até `waypoint` + fração `t` no segmento. */
  distanceAt(waypoint: number, t: number): number {
    let d = 0
    for (let i = 0; i < waypoint; i++) d += this.segmentLengths[i]
    d += this.segmentLengths[waypoint] * t
    return d
  }

  /**
   * Y interpolado do asfalto no ponto (x,z) — usado pra o carro acompanhar
   * o relevo da pista em rampas/colinas.
   */
  getYAt(x: number, z: number): number {
    const seg = this.nearestSegment(x, z)
    const a = this.wp(seg.index)
    const b = this.wp(seg.index + 1)
    return a.y + (b.y - a.y) * seg.alongT
  }
}
