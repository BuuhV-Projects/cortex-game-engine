import {
  Group, Mesh,
  BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry,
  MeshStandardMaterial, MeshLambertMaterial,
  type Scene,
} from 'cortex-game-engine'
import { mulberry32 } from '../utils/math'
import type { TrackContext } from '../utils/trackContext'
import type { WorldProfile } from '../utils/constants'

/**
 * Popula o entorno da pista com prédios, casas e árvores formando uma
 * cidade. A pista corre entre as construções:
 *
 *   1. **Ruas** — para cada segmento da pista amostra pontos ao longo e
 *      tenta encaixar uma construção encostada (offset lateral pequeno).
 *      Yaw da construção é alinhado ao segmento, dando fachadas viradas
 *      pra rua.
 *   2. **Fundo** — geração aleatória mais esparsa preenchendo o restante,
 *      garantindo skyline em volta.
 *
 * Tudo descartado se cair perto demais do asfalto (`perpDist < keepout`).
 * Usa RNG seedado: a mesma fase reproduz a mesma cidade.
 */
export function createCity(
  scene: Scene,
  track: TrackContext,
  world: WorldProfile,
  seed: number,
): Group {
  const root = new Group()
  const rng = mulberry32(seed)
  const isDesert = world.id === 1

  // Paletas por mundo
  const buildingColors = isDesert
    ? [0xc9a06b, 0xa37a4f, 0x8c6643, 0xb88a5d, 0xd9b56b]
    : [0xd0d8e0, 0xeaeaea, 0xb8c2c8, 0xc6d2e8, 0xe2c9a0]
  const houseColors = isDesert
    ? [0xe8c891, 0xd1a36b, 0xb8845a]
    : [0xffd7a8, 0xffadad, 0xffe066, 0xc8e6c9, 0xb3e5fc]
  const roofColors = [0x8b3a3a, 0x4a3320, 0x2f2f2f, 0x5c4033]
  const trunkColor = 0x6b4226
  const leafColor = isDesert ? 0x9aa55a : 0x2e7d32

  const halfTrack = track.layout.width / 2
  // distância da beira do asfalto onde construções começam a aparecer
  const sidewalk = 1.6

  // ─── RUAS: construções alinhadas com a pista ──────────────────────────
  // Pra cada segmento, amostra pontos a cada ~stride metros e tenta colocar
  // uma construção em cada lado. O `lateral` é a distância do centro do
  // segmento (halfTrack + sidewalk + variação).
  const segCount = track.count
  for (let i = 0; i < segCount; i++) {
    const a = track.wp(i)
    const b = track.wp(i + 1)
    const segLen = track.segmentLengths[i]
    const dx = (b.x - a.x) / segLen
    const dz = (b.z - a.z) / segLen
    // Normal apontando "pra esquerda" do sentido do segmento (lado A)
    // e o oposto pra lado B
    const nx = -dz, nz = dx
    const segYaw = Math.atan2(dx, dz)

    const stride = 7
    const steps = Math.max(1, Math.floor(segLen / stride))
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps
      const cx = a.x + dx * segLen * t
      const cz = a.z + dz * segLen * t

      for (const side of [+1, -1]) {
        // Pula um lote ocasionalmente pra abrir "vielas"
        if (rng() < 0.18) continue

        // Decide o tipo PRIMEIRO pra reservar largura suficiente.
        // Pior caso (placeBuilding): w/d até 9m → metade 4.5m.
        // placeHouse: até 5.5m → metade 2.75m. Árvore: ~1m.
        // Pega a diagonal (sqrt(2) * half) pra cobrir rotação:
        const roll = rng()
        let halfFootprint: number
        let kind: 'house' | 'building' | 'tree'
        if (roll < 0.45)      { kind = 'house';    halfFootprint = 2.75 * Math.SQRT2 }
        else if (roll < 0.85) { kind = 'building'; halfFootprint = 4.5  * Math.SQRT2 }
        else                  { kind = 'tree';     halfFootprint = 1.0 }

        const lateral = halfTrack + sidewalk + halfFootprint + rng() * 2.5
        const x = cx + nx * side * lateral
        const z = cz + nz * side * lateral
        // Defesa: testa contra TODA a pista (pode haver um segmento vizinho
        // mais próximo do que o segmento atual). Garante folga real.
        const minClearance = halfTrack + sidewalk * 0.6 + halfFootprint
        if (track.nearestSegment(x, z).perpDist < minClearance) continue

        const facingYaw = segYaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2)
        if (kind === 'house') {
          placeHouse(root, x, z, facingYaw, rng, houseColors, roofColors)
        } else if (kind === 'building') {
          placeBuilding(root, x, z, facingYaw, rng, buildingColors)
        } else {
          placeTree(root, x, z, rng, trunkColor, leafColor, isDesert)
        }
      }
    }
  }

  // ─── FUNDO: skyline esparsa em volta ──────────────────────────────────
  // Extents da pista pra dimensionar o entorno
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const wp of track.layout.waypoints) {
    if (wp.x < minX) minX = wp.x
    if (wp.x > maxX) maxX = wp.x
    if (wp.z < minZ) minZ = wp.z
    if (wp.z > maxZ) maxZ = wp.z
  }
  const pad = 80
  const x0 = minX - pad, x1 = maxX + pad
  const z0 = minZ - pad, z1 = maxZ + pad
  const farKeepout = halfTrack + 10  // longe da pista — não confunde com "rua"

  const bgBuildings = 40
  for (let i = 0; i < bgBuildings; i++) {
    const x = x0 + rng() * (x1 - x0)
    const z = z0 + rng() * (z1 - z0)
    if (track.nearestSegment(x, z).perpDist < farKeepout) continue
    placeBuilding(root, x, z, rng() * Math.PI * 2, rng, buildingColors)
  }

  const bgTrees = isDesert ? 40 : 100
  for (let i = 0; i < bgTrees; i++) {
    const x = x0 + rng() * (x1 - x0)
    const z = z0 + rng() * (z1 - z0)
    // Considera o raio da copa (~1.6m no pior caso) pra não invadir asfalto
    if (track.nearestSegment(x, z).perpDist < halfTrack + sidewalk + 1.6) continue
    placeTree(root, x, z, rng, trunkColor, leafColor, isDesert)
  }

  scene.add(root)
  return root
}

function placeBuilding(
  root: Group,
  x: number, z: number,
  yaw: number,
  rng: () => number,
  palette: number[],
): void {
  const w = 4 + rng() * 5
  const d = 4 + rng() * 5
  const h = 8 + rng() * 20
  const color = palette[Math.floor(rng() * palette.length)]
  const mat = new MeshStandardMaterial({ color, roughness: 0.85 })
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat)
  mesh.position.set(x, h / 2, z)
  mesh.rotation.y = yaw
  root.add(mesh)

  // Topo destacado (caixa d'água/maquinário) ocasional
  if (rng() < 0.35) {
    const top = new Mesh(
      new BoxGeometry(w * 0.4, 1.2, d * 0.4),
      new MeshStandardMaterial({ color: 0x444444, roughness: 0.7 }),
    )
    top.position.set(x, h + 0.6, z)
    top.rotation.y = yaw
    root.add(top)
  }
}

function placeHouse(
  root: Group,
  x: number, z: number,
  yaw: number,
  rng: () => number,
  wallPalette: number[],
  roofPalette: number[],
): void {
  const w = 3 + rng() * 2.5
  const d = 3 + rng() * 2.5
  const h = 2.2 + rng() * 1.5

  const walls = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({
      color: wallPalette[Math.floor(rng() * wallPalette.length)],
      roughness: 0.9,
    }),
  )
  walls.position.set(x, h / 2, z)
  walls.rotation.y = yaw
  root.add(walls)

  const roofR = Math.max(w, d) * 0.75
  const roof = new Mesh(
    new ConeGeometry(roofR, 1.6, 4),
    new MeshStandardMaterial({
      color: roofPalette[Math.floor(rng() * roofPalette.length)],
      roughness: 0.8,
    }),
  )
  roof.position.set(x, h + 0.8, z)
  roof.rotation.y = yaw + Math.PI / 4
  root.add(roof)
}

function placeTree(
  root: Group,
  x: number, z: number,
  rng: () => number,
  trunkColor: number,
  leafColor: number,
  isDesert: boolean,
): void {
  const trunkH = 1.4 + rng() * 1.2
  const trunk = new Mesh(
    new CylinderGeometry(0.18, 0.22, trunkH, 6),
    new MeshLambertMaterial({ color: trunkColor }),
  )
  trunk.position.set(x, trunkH / 2, z)
  root.add(trunk)

  if (isDesert) {
    const body = new Mesh(
      new CylinderGeometry(0.4, 0.4, trunkH * 1.4, 8),
      new MeshLambertMaterial({ color: leafColor }),
    )
    body.position.set(x, trunkH * 0.9, z)
    root.add(body)
  } else {
    const r = 0.9 + rng() * 0.7
    const leaves = new Mesh(
      new SphereGeometry(r, 8, 6),
      new MeshLambertMaterial({ color: leafColor }),
    )
    leaves.position.set(x, trunkH + r * 0.6, z)
    root.add(leaves)
  }
}
