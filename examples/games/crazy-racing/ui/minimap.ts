import type { Entity } from 'cortex-game-engine'
import { TransformComponent } from '../components/TransformComponent'
import type { TrackLayout } from '../utils/trackLayouts'

export interface MinimapData {
  layout: TrackLayout
  allCars: Entity[]
  playerEntities: Entity[]
  /** Qual viewport está renderizando (0 ou 1) — define qual carro é o "eu". */
  viewportIndex: number
}

/**
 * Desenha o minimap num canvas 2D. Mantém aspect ratio da pista,
 * centraliza no canvas com padding.
 */
export function drawMinimap(canvas: HTMLCanvasElement, data: MinimapData): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height

  ctx.clearRect(0, 0, W, H)

  // Fundo
  ctx.fillStyle = 'rgba(16, 20, 28, 0.7)'
  roundRect(ctx, 0, 0, W, H, 10)
  ctx.fill()

  // Bbox dos waypoints (no plano XZ)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const wp of data.layout.waypoints) {
    if (wp.x < minX) minX = wp.x
    if (wp.x > maxX) maxX = wp.x
    if (wp.z < minZ) minZ = wp.z
    if (wp.z > maxZ) maxZ = wp.z
  }
  const pad = 12
  const innerW = W - pad * 2
  const innerH = H - pad * 2
  const trackW = maxX - minX || 1
  const trackH = maxZ - minZ || 1
  const scale = Math.min(innerW / trackW, innerH / trackH)
  const offsetX = pad + (innerW - trackW * scale) / 2
  const offsetY = pad + (innerH - trackH * scale) / 2

  const toMap = (wx: number, wz: number): [number, number] => [
    offsetX + (wx - minX) * scale,
    offsetY + (wz - minZ) * scale,
  ]

  // Pista — desenha asfalto como linha grossa cinza + linha fina de centro
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const wps = data.layout.waypoints
  ctx.beginPath()
  for (let i = 0; i < wps.length; i++) {
    const [x, y] = toMap(wps[i].x, wps[i].z)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.strokeStyle = 'rgba(60, 70, 90, 0.95)'
  ctx.lineWidth = Math.max(4, data.layout.width * scale * 0.6)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255, 210, 63, 0.6)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.stroke()
  ctx.setLineDash([])

  // Linha de chegada
  const start = wps[0]
  const [sx, sy] = toMap(start.x, start.z)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(sx - 2, sy - 2, 4, 4)

  // Carros
  for (const car of data.allCars) {
    const tr = car.getComponent(TransformComponent)!
    const isPlayer = data.playerEntities.includes(car)
    const isMe = data.playerEntities[data.viewportIndex] === car

    const [cx, cy] = toMap(tr.x, tr.z)

    if (isMe) {
      // Triângulo apontando o yaw — "eu"
      drawTriangle(ctx, cx, cy, tr.yaw, '#ffd23f', '#000')
    } else if (isPlayer) {
      drawDot(ctx, cx, cy, 4, '#9ad0ff', '#000')
    } else {
      drawDot(ctx, cx, cy, 3, '#ff6b6b', '#000')
    }
  }
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  fill: string, stroke: string,
): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, yaw: number,
  fill: string, stroke: string,
): void {
  // No mundo o carro anda em (sin yaw, cos yaw); no canvas Z+ aponta pra baixo
  // (Y do canvas cresce pra baixo), então usamos cos yaw direto e tudo certo.
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const size = 5
  ctx.beginPath()
  ctx.moveTo(x + fx * size,       y + fz * size)
  ctx.lineTo(x - fx * size * 0.6 - fz * size * 0.6, y - fz * size * 0.6 + fx * size * 0.6)
  ctx.lineTo(x - fx * size * 0.6 + fz * size * 0.6, y - fz * size * 0.6 - fx * size * 0.6)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1
  ctx.stroke()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

