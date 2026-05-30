import {
  type Object3D,
  type Bone,
  SkinnedMesh,
  Skeleton,
} from 'cortex-game-engine'

/**
 * Clone profundo que preserva o binding de `SkinnedMesh` ao novo
 * esqueleto — equivale a `THREE.SkeletonUtils.clone(source)`, mas
 * implementado aqui pra não depender de `three/examples/jsm`.
 *
 * O clone padrão `Object3D.clone(true)` duplica meshes e bones, mas
 * cada SkinnedMesh clonado continua apontando para os bones do
 * original. Esta função reescreve o `.skeleton` de cada SkinnedMesh
 * clonado para apontar pros bones equivalentes no novo grafo (match
 * por `name`, que o FBX loader preserva).
 */
export function cloneSkinned(source: Object3D): Object3D {
  const sourceLookup = new Map<Object3D, Object3D>()
  const cloneLookup = new Map<Object3D, Object3D>()
  const clone = source.clone(true)

  parallelTraverse(source, clone, (src, dst) => {
    sourceLookup.set(dst, src)
    cloneLookup.set(src, dst)
  })

  clone.traverse((node: Object3D) => {
    if (!(node instanceof SkinnedMesh)) return
    const cloneSkinnedMesh = node
    const srcSkinnedMesh = sourceLookup.get(node) as SkinnedMesh | undefined
    if (!srcSkinnedMesh) return
    const srcSkeleton = srcSkinnedMesh.skeleton

    const newBones: Bone[] = srcSkeleton.bones.map((bone: Bone) => {
      const cloneBone = cloneLookup.get(bone)
      if (!cloneBone) {
        throw new Error(`cloneSkinned: bone "${bone.name}" do original não está no clone`)
      }
      return cloneBone as Bone
    })
    cloneSkinnedMesh.bind(new Skeleton(newBones, srcSkeleton.boneInverses), cloneSkinnedMesh.matrixWorld)
  })

  return clone
}

function parallelTraverse(
  a: Object3D,
  b: Object3D,
  callback: (src: Object3D, dst: Object3D) => void,
): void {
  callback(a, b)
  for (let i = 0; i < a.children.length; i++) {
    parallelTraverse(a.children[i]!, b.children[i]!, callback)
  }
}
