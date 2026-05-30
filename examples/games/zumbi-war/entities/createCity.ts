import {
  Group,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  PointLight,
  Color,
  type Scene,
} from 'cortex-game-engine'
import { randomInRange } from '../utils/math'

/**
 * Gera a cidade abandonada proceduralmente: chão, ruas, prédios espalhados,
 * postes com luzes piscadas, lixo. Tudo é estático — não vai pro ECS,
 * só pra cena. Retorna o grupo raiz pra controle posterior se preciso.
 */
export function createCity(scene: Scene): Group {
  const city = new Group()

  const groundMat = new MeshStandardMaterial({
    color: 0x1a1a1c,
    roughness: 1,
    metalness: 0,
  })
  const ground = new Mesh(new PlaneGeometry(200, 200), groundMat)
  ground.rotation.x = -Math.PI / 2
  city.add(ground)

  const roadMat = new MeshStandardMaterial({ color: 0x2a2a2e, roughness: 1 })
  const roadH = new Mesh(new PlaneGeometry(200, 8), roadMat)
  roadH.rotation.x = -Math.PI / 2
  roadH.position.y = 0.01
  city.add(roadH)
  const roadV = new Mesh(new PlaneGeometry(8, 200), roadMat)
  roadV.rotation.x = -Math.PI / 2
  roadV.position.y = 0.01
  city.add(roadV)

  const stripeMat = new MeshStandardMaterial({
    color: 0xc9b34a,
    emissive: new Color(0x553311),
    emissiveIntensity: 0.4,
  })
  for (let i = -90; i <= 90; i += 10) {
    if (Math.abs(i) < 5) continue
    const s = new Mesh(new BoxGeometry(2, 0.02, 0.25), stripeMat)
    s.position.set(i, 0.03, 0)
    city.add(s)
  }

  const buildingPalette = [0x3a2f2a, 0x2e3340, 0x4a3a2c, 0x33342e, 0x2c2c30, 0x453a3a]
  const placed: { x: number; z: number; w: number; d: number }[] = []
  const blocks = [
    { cx: -18, cz: -18 },
    { cx: 18, cz: -18 },
    { cx: -18, cz: 18 },
    { cx: 18, cz: 18 },
    { cx: -38, cz: 0 },
    { cx: 38, cz: 0 },
    { cx: 0, cz: -38 },
    { cx: 0, cz: 38 },
    { cx: -55, cz: -55 },
    { cx: 55, cz: 55 },
    { cx: -55, cz: 55 },
    { cx: 55, cz: -55 },
  ]
  for (const b of blocks) {
    const count = Math.floor(randomInRange(3, 5))
    for (let i = 0; i < count; i++) {
      const w = randomInRange(4, 9)
      const d = randomInRange(4, 9)
      const h = randomInRange(4, 14)
      const x = b.cx + randomInRange(-6, 6)
      const z = b.cz + randomInRange(-6, 6)
      if (Math.hypot(x, z) < 8) continue
      let overlap = false
      for (const p of placed) {
        if (Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.z - z) < (p.d + d) / 2) {
          overlap = true
          break
        }
      }
      if (overlap) continue
      placed.push({ x, z, w, d })

      const color = buildingPalette[Math.floor(Math.random() * buildingPalette.length)]!
      const mat = new MeshStandardMaterial({ color, roughness: 0.9 })
      const building = new Mesh(new BoxGeometry(w, h, d), mat)
      building.position.set(x, h / 2, z)
      city.add(building)

      const windowMat = new MeshStandardMaterial({
        color: 0x222222,
        emissive: new Color(Math.random() > 0.7 ? 0x553300 : 0x111111),
        emissiveIntensity: Math.random() > 0.7 ? 0.6 : 0.1,
      })
      const rows = Math.max(1, Math.floor(h / 2.5))
      const cols = Math.max(1, Math.floor(w / 2.5))
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.4) continue
          const wnd = new Mesh(new BoxGeometry(0.6, 0.9, 0.05), windowMat)
          wnd.position.set(
            x - w / 2 + (c + 0.5) * (w / cols),
            1 + r * 2.5,
            z + d / 2 + 0.02,
          )
          city.add(wnd)
        }
      }
    }
  }

  const poleMat = new MeshStandardMaterial({ color: 0x222222 })
  const lampMat = new MeshStandardMaterial({
    color: 0xffd17a,
    emissive: new Color(0xffaa44),
    emissiveIntensity: 1.4,
  })
  const lampPositions = [
    [-6, 0, -6],
    [6, 0, -6],
    [-6, 0, 6],
    [6, 0, 6],
    [-22, 0, -4],
    [22, 0, 4],
    [-4, 0, -22],
    [4, 0, 22],
    [-30, 0, -30],
    [30, 0, 30],
  ]
  for (const [x, , z] of lampPositions) {
    const pole = new Mesh(new CylinderGeometry(0.08, 0.08, 4), poleMat)
    pole.position.set(x!, 2, z!)
    city.add(pole)
    const head = new Mesh(new BoxGeometry(0.5, 0.2, 0.5), lampMat)
    head.position.set(x!, 4, z!)
    city.add(head)
    const light = new PointLight(0xffaa55, 0.9, 12, 2)
    light.position.set(x!, 3.8, z!)
    city.add(light)
  }

  for (let i = 0; i < 25; i++) {
    const trashMat = new MeshStandardMaterial({
      color: [0x2a2218, 0x3a3025, 0x222024][i % 3],
      roughness: 1,
    })
    const trash = new Mesh(
      new BoxGeometry(randomInRange(0.4, 0.9), randomInRange(0.3, 0.7), randomInRange(0.4, 0.9)),
      trashMat,
    )
    let x: number, z: number
    do {
      x = randomInRange(-70, 70)
      z = randomInRange(-70, 70)
    } while (Math.hypot(x, z) < 6)
    trash.position.set(x, 0.2, z)
    trash.rotation.y = Math.random() * Math.PI
    city.add(trash)
  }

  for (let i = 0; i < 6; i++) {
    const carMat = new MeshStandardMaterial({
      color: [0x551111, 0x113355, 0x333322, 0x222222][i % 4],
      roughness: 0.7,
    })
    const car = new Mesh(new BoxGeometry(1.8, 1.1, 4), carMat)
    let x: number, z: number
    do {
      x = randomInRange(-50, 50)
      z = randomInRange(-50, 50)
    } while (Math.hypot(x, z) < 8 || Math.abs(x) < 3 || Math.abs(z) < 3)
    car.position.set(x, 0.55, z)
    car.rotation.y = (Math.PI / 2) * Math.floor(Math.random() * 4)
    city.add(car)
    const top = new Mesh(new BoxGeometry(1.4, 0.7, 2), carMat)
    top.position.set(x, 1.45, z)
    top.rotation.y = car.rotation.y
    city.add(top)
  }

  scene.add(city)
  return city
}
