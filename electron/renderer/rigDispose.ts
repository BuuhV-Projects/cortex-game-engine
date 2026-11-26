import * as THREE from 'three'

/**
 * Limpeza do modelo da prévia do auto-rig (tirada do `RigAnimationPreview`, SPEC-0746): o COLOR_0 do rig e a liberação
 * de geometria, material, textura e esqueleto.
 */

/** Materiais de uma malha (um ou vários). */
function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
}

/**
 * No GLB do rig o COLOR_0 é o índice de região do jogo (atributo `slot`), não cor: multiplicado na textura deixaria o
 * boneco vermelho/preto. Desliga as cores de vértice.
 */
export function stripSlotColors(model: THREE.Object3D): void {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of materialsOf(mesh)) {
      if ((m as THREE.MeshStandardMaterial).vertexColors) {
        m.vertexColors = false
        m.needsUpdate = true
      }
    }
  })
}

/** Libera geometrias, esqueletos, materiais e texturas sob `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    mesh.geometry?.dispose()
    if (mesh.isSkinnedMesh) mesh.skeleton?.dispose()
    for (const m of materialsOf(mesh)) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
      m.dispose()
    }
  })
}
