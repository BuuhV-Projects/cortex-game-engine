/**
 * **Células do bench baked** (M-perf-4). O `city.glb` (gerado por `bake-city.mjs`)
 * já traz a geometria fundida por célula em nós `cell-<key>`, com os vértices em
 * coordenada de MUNDO. Aqui o runtime só ENVOLVE cada célula num `BundleGroup` —
 * sem buildScene/merge por prédio.
 *
 * **Sem LOD de geometria:** os modelos-fonte já são low-poly (pré-decimados no
 * `prepare-assets`); decimar de novo abre buracos (paredes somem) e triângulos
 * esticados (mesh atravessando). A performance de longe vem de:
 * - {@link CellStreamingSystem} — só as células no raio ficam residentes;
 * - frustum culling do three — não desenha o que está fora da tela;
 * - render bundles ({@link BundleGroup}) — 1 `executeBundles` por pass (poucas
 *   travessias NAPI no host nativo).
 * LOD de verdade pra esses assets seria impostor/billboard, não geometria.
 */
import { Group, Mesh, type Object3D, type BufferGeometry } from 'three';
import { deinterleaveGeometry } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BundleGroup } from 'three/webgpu';

/**
 * **De-interleave** as geometrias de um nó: o `city.glb` sai INTERLEAVED do
 * gltf-transform (POSITION/NORMAL/UV num bufferView com byteStride), e o renderer
 * nativo (WebGPU) renderiza ERRADO buffer interleaved — triângulos esticados/espeto
 * atravessando os prédios. Separa cada atributo num buffer próprio (mesma correção
 * que o {@link mergeStaticScene} aplica no caminho antigo). Ver architecture.md §
 * armadilhas e [[native-vertex-color-naga-branco]].
 */
function deinterleaveCell(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) deinterleaveGeometry(mesh.geometry as BufferGeometry);
  });
}

/**
 * Envolve os meshes fundidos de um nó `cell-<key>` num `BundleGroup` (ou `Group`),
 * na origem — a geometria é world-absoluta, então renderiza no lugar certo. O
 * {@link CellStreamingSystem} adiciona/remove por distância. Barato: sem merge.
 */
export function wrapBakedCell(fullNode: Object3D, useBundle = true): Object3D {
  deinterleaveCell(fullNode); // interleaved quebra o host → separa os atributos (ver acima)
  const group = useBundle ? new BundleGroup() : new Group();
  for (const child of [...fullNode.children]) group.attach(child); // meshes fundidos → grupo
  return group;
}
