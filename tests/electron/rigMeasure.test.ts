/**
 * Medida das mãos contra a arma (SPEC-0746): distância até a malha, dentro/fora e o ponto mais perto de cada mão.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { distanceToMesh, insideMesh, measureHand, worldTriangles } from '../../electron/renderer/rigMeasure.js'

/** Cubo de 2 cm de lado no centro `at`, em mundo. */
function cube(at: THREE.Vector3): THREE.Mesh {
  const SIDE = 0.02
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(SIDE, SIDE, SIDE))
  mesh.position.copy(at)
  return mesh
}

describe('rigMeasure', () => {
  const root = new THREE.Group()
  root.add(cube(new THREE.Vector3(0.5, 0, 0)))
  const tris = worldTriangles(root)

  it('triângulos em mundo (com a posição do nó)', () => {
    const CUBE_TRIS = 12
    expect(tris.length).toBe(CUBE_TRIS * 9)
    expect(Math.min(...tris.filter((_, i) => i % 3 === 0))).toBeCloseTo(0.49, 6)
  })

  it('distância até a face mais perto e dentro/fora', () => {
    expect(distanceToMesh(new THREE.Vector3(0.5, 0.05, 0), tris)).toBeCloseTo(0.04, 6)
    expect(insideMesh(new THREE.Vector3(0.5, 0, 0), tris)).toBe(true)
    expect(insideMesh(new THREE.Vector3(0.5, 0.05, 0), tris)).toBe(false)
  })

  it('o ponto dentro vence o mais perto de fora', () => {
    const m = measureHand([
      { name: 'fora', pos: new THREE.Vector3(0.5, 0.011, 0) },
      { name: 'dentro', pos: new THREE.Vector3(0.5, 0.005, 0) },
    ], tris)
    expect(m.closest?.name).toBe('dentro')
    expect(m.points[0]).toMatchObject({ name: 'fora', inside: false, distCm: 0.1 })
  })

  it('sem malha: distância infinita e nada dentro', () => {
    const none = new Float32Array(0)
    expect(distanceToMesh(new THREE.Vector3(), none)).toBe(Infinity)
    expect(insideMesh(new THREE.Vector3(), none)).toBe(false)
  })
})
