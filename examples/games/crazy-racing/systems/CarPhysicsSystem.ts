import { System, type Entity } from 'cortex-game-engine'
import { CarComponent } from '../components/CarComponent'
import { TransformComponent } from '../components/TransformComponent'
import { clamp, lerp, wrapAngle } from '../utils/math'
import type { TrackContext } from '../utils/trackContext'

const NITRO_MUL = 1.6
const GRAVITY = 22  // unidades/s² — só atua quando o carro está no ar

/**
 * Integra velocidade, direção e posição do carro.
 *
 *   - Pista plana: tr.y é interpolado para o asfalto sob o carro.
 *   - Fora do asfalto: drag aumenta (efeito grama) e mantemos tr.y na pista.
 *   - Pista com gaps (hasGaps=true) e carro muito longe da linha central:
 *     ativa queda livre — tr.y cai com gravidade até CarRescueSystem
 *     teleportar de volta.
 */
export class CarPhysicsSystem extends System {
  static override requiredComponents = [CarComponent, TransformComponent]
  override priority = 20

  constructor(private readonly track: TrackContext) { super() }

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000
    const halfWidth = this.track.layout.width / 2

    for (const e of entities) {
      const car = e.getComponent(CarComponent)!
      const tr  = e.getComponent(TransformComponent)!

      // ─── Nitro decai ────────────────────────────────────────────────────
      if (car.nitroTimer > 0) car.nitroTimer = Math.max(0, car.nitroTimer - dt)
      const boost = car.nitroTimer > 0 ? NITRO_MUL : 1
      const effMaxSpeed = car.maxSpeed * boost
      const effAccel = car.accel * boost

      // ─── Entrada → velocidade longitudinal ──────────────────────────────
      const throttle = clamp(car.inputThrottle, 0, 1)
      const brake    = clamp(car.inputBrake,    0, 1)
      if (throttle > 0) car.speed += effAccel * throttle * dt
      if (brake > 0) {
        if (car.speed > 0) car.speed -= car.brakeForce * brake * dt
        else car.speed -= effAccel * 0.6 * brake * dt
      }
      if (throttle === 0 && brake === 0) {
        if (car.speed > 0) car.speed = Math.max(0, car.speed - car.drag * dt)
        else if (car.speed < 0) car.speed = Math.min(0, car.speed + car.drag * dt)
      }
      car.speed = clamp(car.speed, car.reverseMax, effMaxSpeed)

      // ─── Steering ───────────────────────────────────────────────────────
      const speedNorm = clamp(Math.abs(car.speed) / Math.max(1, car.maxSpeed), 0, 1)
      const turn = car.inputSteer * car.turnRate * dt * speedNorm * Math.sign(car.speed || 1)
      tr.yaw += turn

      // ─── Integração XZ ──────────────────────────────────────────────────
      const fx = Math.sin(tr.yaw)
      const fz = Math.cos(tr.yaw)
      tr.x += fx * car.speed * dt
      tr.z += fz * car.speed * dt

      // ─── Snap em Y / queda ──────────────────────────────────────────────
      let seg = this.track.nearestSegment(tr.x, tr.z)
      const trackY = this.track.getYAt(tr.x, tr.z)

      const inAir = this.track.layout.hasGaps && seg.perpDist > halfWidth + 0.5
      if (inAir) {
        // Queda livre — gravity puxa pra baixo
        car.vy -= GRAVITY * dt
        tr.y += car.vy * dt
      } else {
        // Em pista (ou perto): cola no asfalto suavemente
        tr.y = lerp(tr.y, trackY, Math.min(1, 18 * dt))
        car.vy = 0
      }

      // ─── Colisão lateral (mureta) com deflexão ─────────────────────────
      // Em pistas sem gap, empurra o carro de volta se ultrapassar a
      // mureta E gira o yaw gradualmente pra ficar paralelo, evitando o
      // bug de "nariz encostado" sem força nenhuma. Pistas com gap deixam
      // passar — queda livre + CarRescueSystem teleporta.
      const wallLimit = halfWidth + 0.3
      if (!this.track.layout.hasGaps && seg.perpDist > wallLimit) {
        const a = this.track.wp(seg.index)
        const b = this.track.wp(seg.index + 1)
        const tx = b.x - a.x
        const tz = b.z - a.z
        const segLen = Math.hypot(tx, tz) || 1
        const projX = a.x + (tx / segLen) * seg.alongT * segLen
        const projZ = a.z + (tz / segLen) * seg.alongT * segLen
        const lateralX = tr.x - projX
        const lateralZ = tr.z - projZ
        const lateralDist = Math.hypot(lateralX, lateralZ) || 1
        // Clamp posicional — encosta o carro na mureta
        const factor = wallLimit / lateralDist
        tr.x = projX + lateralX * factor
        tr.z = projZ + lateralZ * factor

        // Deflexão: redireciona yaw pra paralelo à mureta quando o carro
        // está apontando contra ela. Suave (proporcional ao dt).
        const fx = Math.sin(tr.yaw), fz = Math.cos(tr.yaw)
        const wallNormX = lateralX / lateralDist
        const wallNormZ = lateralZ / lateralDist
        const dot = fx * wallNormX + fz * wallNormZ
        if (dot > 0.2) {
          // Componente paralela à mureta (vetor frente menos a parte normal)
          const paraX = fx - wallNormX * dot
          const paraZ = fz - wallNormZ * dot
          const paraMag = Math.hypot(paraX, paraZ)
          if (paraMag > 0.05) {
            const targetYaw = Math.atan2(paraX, paraZ)
            const diff = wrapAngle(targetYaw - tr.yaw)
            tr.yaw += diff * Math.min(1, 8 * dt)  // ~8 rad/s em direção ao paralelo
          }
          // Perda de velocidade modesta — bater mais de frente perde mais,
          // mas sem chegar a zero (mantém pelo menos 60% pra não travar).
          car.speed *= Math.max(0.6, 1 - 0.4 * dot)
        }
        seg = this.track.nearestSegment(tr.x, tr.z)
      }

      // ─── Penalidade de grama ────────────────────────────────────────────
      if (seg.perpDist > halfWidth && !inAir) {
        const over = seg.perpDist - halfWidth
        const cap = clamp(effMaxSpeed * (1 - over * 0.15), effMaxSpeed * 0.25, effMaxSpeed)
        if (Math.abs(car.speed) > cap) car.speed = Math.sign(car.speed) * cap
      }
    }
  }
}
