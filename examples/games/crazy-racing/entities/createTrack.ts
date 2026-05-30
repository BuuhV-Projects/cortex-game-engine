import {
  Group,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  MeshLambertMaterial,
  type Scene,
} from 'cortex-game-engine'
import type { TrackLayout } from '../utils/trackLayouts'
import type { WorldProfile } from '../utils/constants'

/**
 * Constrói a pista 3D usando BoxGeometry fina por segmento — cada box é
 * orientada com yaw + pitch pra acompanhar variações de elevação entre
 * waypoints. Acompanha também muretas laterais inclinadas.
 */
export function createTrackMesh(
  scene: Scene,
  layout: TrackLayout,
  world: WorldProfile,
): Group {
  const root = new Group()

  // Chão (apenas se a pista NÃO tem trechos suspensos — senão vira "muro")
  if (!layout.hasGaps) {
    const groundSize = 500
    const ground = new Mesh(
      new PlaneGeometry(groundSize, groundSize, 1, 1),
      new MeshLambertMaterial({ color: world.groundColor }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.05
    root.add(ground)
  } else {
    // Em pistas com gap, faz só um chão pequeno na largada pra dar referência
    const startGround = new Mesh(
      new PlaneGeometry(180, 180, 1, 1),
      new MeshLambertMaterial({ color: world.groundColor }),
    )
    startGround.rotation.x = -Math.PI / 2
    startGround.position.set(layout.waypoints[0].x, -0.05, layout.waypoints[0].z)
    root.add(startGround)
  }

  const asphaltMat = new MeshStandardMaterial({ color: world.trackColor, roughness: 0.9 })
  const pillarMat = new MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.85 })
  const wps = layout.waypoints
  for (let i = 0; i < wps.length; i++) {
    const a = wps[i]
    const b = wps[(i + 1) % wps.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dz = b.z - a.z
    const horizontal = Math.hypot(dx, dz) || 0.001
    const len = Math.hypot(dx, dy, dz)
    const yaw = Math.atan2(dx, dz)
    const pitch = Math.atan2(dy, horizontal)

    const midY = (a.y + b.y) / 2

    // Box fino: width x 0.15 x length. +Z local = "frente do segmento"
    const seg = new Mesh(new BoxGeometry(layout.width, 0.15, len), asphaltMat)
    seg.position.set((a.x + b.x) / 2, midY, (a.z + b.z) / 2)
    seg.rotation.order = 'YXZ'
    seg.rotation.set(-pitch, yaw, 0)
    root.add(seg)

    addFence(root, a, b, layout.width / 2 + 0.4, world.fenceColor)
    addFence(root, a, b, -(layout.width / 2 + 0.4), world.fenceColor)

    // Pilar de apoio sob segmentos elevados — a cada 2 segmentos pra não
    // poluir. Box estreita do chão até embaixo do asfalto.
    if (midY > 0.8 && i % 2 === 0) {
      const pillarH = midY
      const pillar = new Mesh(
        new BoxGeometry(0.7, pillarH, 0.7),
        pillarMat,
      )
      pillar.position.set((a.x + b.x) / 2, pillarH / 2, (a.z + b.z) / 2)
      pillar.rotation.y = yaw
      root.add(pillar)
    }
  }

  // Faixa de largada
  const start = wps[0]
  const next = wps[1]
  const startYaw = Math.atan2(next.x - start.x, next.z - start.z)
  const line = new Mesh(
    new PlaneGeometry(layout.width, 1.5),
    new MeshStandardMaterial({ color: 0xffffff }),
  )
  line.rotation.x = -Math.PI / 2
  line.rotation.z = -startYaw
  line.position.set(start.x, start.y + 0.12, start.z)
  root.add(line)

  scene.add(root)
  return root
}

function addFence(
  root: Group,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  side: number,
  color: number,
): void {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const horizontal = Math.hypot(dx, dz) || 0.001
  const len = Math.hypot(dx, dy, dz)
  const yaw = Math.atan2(dx, dz)
  const pitch = Math.atan2(dy, horizontal)
  // Normal perpendicular (plano horizontal)
  const nx = Math.cos(yaw)
  const nz = -Math.sin(yaw)
  const cx = (a.x + b.x) / 2 + nx * side
  const cz = (a.z + b.z) / 2 + nz * side
  const cy = (a.y + b.y) / 2 + 0.3
  const mesh = new Mesh(
    new BoxGeometry(0.3, 0.6, len),
    new MeshStandardMaterial({ color, roughness: 0.6 }),
  )
  mesh.position.set(cx, cy, cz)
  mesh.rotation.order = 'YXZ'
  mesh.rotation.set(-pitch, yaw, 0)
  root.add(mesh)
}
