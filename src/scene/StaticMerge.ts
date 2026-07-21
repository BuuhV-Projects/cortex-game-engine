import {
  BufferGeometry,
  Mesh,
  Object3D,
  Matrix4,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BundleGroup } from 'three/webgpu';
import { isSkinned } from '../physics/raycastAccel.js';
import { debug } from '../core/debug.js';
import type { World } from '../ecs/World.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { ScriptComponent } from '../components/ScriptComponent.js';

/**
 * **Merge da geometria estática da cena** (SPEC-0120) — reduz draw calls fundindo
 * as malhas paradas do cenário (ilhas, árvores, pedras, decoração) em poucas
 * malhas agrupadas por material, com o transform de mundo "assado" (baked).
 *
 * Motivação: o custo de CPU do `WebGPURenderer` é **por objeto por frame**
 * (travessia + node material + encoding). No host nativo (Hermes, sem JIT) uma
 * fase com ~90 draw calls fica em ~19 ms de render; fundir o estático derruba
 * proporcionalmente. No V8 o ganho existe mas raramente é o gargalo.
 *
 * O merge é **destrutivo na cena viva** (remove as malhas originais e adiciona
 * as fundidas na raiz) e por isso NÃO roda no editor — o F2 precisa dos objetos
 * individuais pra selecionar/mover. O caminho pensado é o **export/Play sem
 * editor** (o bootstrap nativo chama depois do buildScene).
 *
 * O que fica de fora (continua desenhado como estava):
 * - Subárvores de entidades DINÂMICAS: qualquer entidade cujo conjunto de
 *   componentes não seja só {Transform, Object3D, Collider2D} (player, scripts
 *   — moedas/balsas/checkpoints —, corpos Rapier, sprites, terreno…). Regra de
 *   allowlist: componente desconhecido ⇒ dinâmico (seguro por default).
 * - Malha skinada (personagens), vegetação instanciada (`cortexVegetation*`),
 *   terreno (`cortexTerrain`, tem pipeline próprio de colisão/sculpt), água,
 *   chrome do editor (`editorInternal`), invisíveis, layers não-default.
 * - Malha com multi-material (array), geometria interleaved ou assinatura de
 *   atributos diferente do grupo (o `mergeGeometries` exige atributos iguais).
 *
 * A física NÃO muda: colliders derivam dos nós ANTES do merge; o raycast de
 * chão/parede do Character enxerga a malha fundida (que preserva
 * `cortexSolid`), e o BVH (SPEC-0108) é construído uma vez sobre ela.
 */
export interface StaticMergeStats {
  /** Malhas originais fundidas (removidas da cena). */
  merged: number;
  /** Malhas fundidas criadas (≈ nº de materiais distintos do estático). */
  groups: number;
  /** Malhas elegíveis puladas (grupo de 1, mismatch de atributos, etc.). */
  kept: number;
}

/** Componentes que NÃO tornam uma entidade dinâmica (por nome de classe). */
const STATIC_COMPONENTS = new Set(['TransformComponent', 'Object3DComponent', 'Collider2DComponent']);

/** `obj` (ou ancestral) tem flag de exclusão (editor/vegetação/terreno)? */
function isExcludedByUserData(obj: Object3D): boolean {
  let p: Object3D | null = obj;
  while (p) {
    const ud = p.userData as Record<string, unknown>;
    if (ud['editorInternal'] || ud['cortexVegetation'] || ud['cortexVegetationSub'] || ud['cortexTerrain'] || ud['cortexWater'] || ud['cortexUnderlay'] || ud['cortexVehicle']) return true;
    if (!p.visible) return true; // invisível (mannequin oculto, toggles)
    p = p.parent;
  }
  return false;
}

/** `obj` está sob (ou é) algum dos roots? */
function isUnderAny(obj: Object3D, roots: Set<Object3D>): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (roots.has(p)) return true;
    p = p.parent;
  }
  return false;
}

/** Raízes de entidades dinâmicas do mundo (subárvores que o merge não toca). */
function dynamicRoots(world: World | undefined): Set<Object3D> {
  const roots = new Set<Object3D>();
  if (!world) return roots;
  for (const e of world.query(Object3DComponent)) {
    const isDynamic = e.getAllComponents().some((c) => !STATIC_COMPONENTS.has(c.type));
    if (isDynamic) {
      const obj = e.getComponent(Object3DComponent)?.object;
      if (obj) roots.add(obj);
    }
  }
  // Entidades de SCRIPT não têm Object3DComponent — o objeto vive DENTRO do
  // ScriptComponent (moedas, balsas, checkpoints…). Fundi-las congelaria o
  // comportamento (o script anima/esconde AQUELA malha).
  for (const e of world.query(ScriptComponent)) {
    const obj = e.getComponent(ScriptComponent)?.object;
    if (obj) roots.add(obj);
  }
  return roots;
}

/** Assinatura de material — malhas com a MESMA assinatura podem dividir um draw. */
function materialKey(m: Material): string {
  const x = m as Material & {
    color?: { getHexString(): string };
    map?: Texture | null;
    emissive?: { getHexString(): string };
    emissiveMap?: Texture | null;
    normalMap?: Texture | null;
    gradientMap?: Texture | null;
    metalness?: number;
    roughness?: number;
    vertexColors?: boolean;
    flatShading?: boolean;
    toneMapped?: boolean;
    depthWrite?: boolean;
    depthTest?: boolean;
  };
  return [
    m.type,
    x.color?.getHexString() ?? '-',
    x.map?.uuid ?? '-',
    x.emissive?.getHexString() ?? '-',
    x.emissiveMap?.uuid ?? '-',
    x.normalMap?.uuid ?? '-',
    x.gradientMap?.uuid ?? '-',
    x.metalness ?? '-',
    x.roughness ?? '-',
    m.side,
    m.transparent ? 1 : 0,
    m.opacity,
    m.alphaTest,
    x.vertexColors ? 1 : 0,
    x.flatShading ? 1 : 0,
    x.toneMapped === false ? 0 : 1,
    x.depthWrite === false ? 0 : 1,
    x.depthTest === false ? 0 : 1,
  ].join('|');
}

/** Assinatura dos atributos da geometria (mergeGeometries exige iguais). */
function attributeKey(g: BufferGeometry): string | null {
  const names = Object.keys(g.attributes).sort();
  const parts: string[] = [g.index ? 'idx' : 'noidx'];
  for (const n of names) {
    const a = g.attributes[n] as { itemSize: number; isInterleavedBufferAttribute?: boolean };
    if (a.isInterleavedBufferAttribute) return null; // interleaved: fora (merge não suporta)
    parts.push(`${n}:${a.itemSize}`);
  }
  if (g.morphAttributes && Object.keys(g.morphAttributes).length > 0) return null; // morph: fora
  return parts.join(',');
}

/** `cortexSolid` efetivo (o CharacterPhysics olha os ancestrais). */
function isSolid(obj: Object3D): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if ((p.userData as Record<string, unknown>)['cortexSolid'] === true) return true;
    p = p.parent;
  }
  return false;
}

interface Candidate {
  mesh: Mesh;
  key: string;
  matrix: Matrix4;
}

/**
 * Funde a geometria estática sob `root` (ver doc do módulo). Idempotente na
 * prática (malhas fundidas têm `cortexMergedStatic` e não são re-fundidas com
 * ganho — mas o uso esperado é UMA vez, logo após o `buildScene`).
 *
 * @param root  Raiz da cena (o `scene.getThreeScene()`).
 * @param world Mundo ECS — usado pra excluir as subárvores de entidades dinâmicas.
 * @param extraDynamicRoots Subárvores adicionais a preservar (ex.: objetos com
 *   `SceneAnimator` — o mixer anima aquelas malhas).
 * @example
 * const handle = await buildScene(scene, defs, { world });
 * mergeStaticScene(scene.getThreeScene(), game.world); // export/Play sem editor
 */
export function mergeStaticScene(
  root: Object3D,
  world?: World,
  extraDynamicRoots: Iterable<Object3D> = [],
): StaticMergeStats {
  root.updateMatrixWorld(true);
  const dynRoots = dynamicRoots(world);
  for (const r of extraDynamicRoots) dynRoots.add(r);

  // 1) Coleta candidatos (elegibilidade por malha).
  const eligible = new Map<Mesh, Candidate>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || isSkinned(mesh)) return;
    if (Array.isArray(mesh.material)) return; // multi-material: fora (v1)
    if ((mesh.userData as Record<string, unknown>)['cortexMergedStatic']) return;
    // (Cascas de contorno/inverted-hull caem na regra geral: a matriz de mundo
    //  já embute a escala da casca e o material BackSide forma o próprio grupo.)
    if (isExcludedByUserData(mesh)) return;
    if (isUnderAny(mesh, dynRoots)) return;
    if (mesh.layers.mask !== 1) return; // layer não-default: fora
    const attrKey = attributeKey(mesh.geometry);
    if (attrKey === null) return;
    const key = [materialKey(mesh.material as Material), attrKey, isSolid(mesh) ? 'S' : '-', mesh.castShadow ? 'c' : '-', mesh.receiveShadow ? 'r' : '-', mesh.renderOrder].join('§');
    eligible.set(mesh, { mesh, key, matrix: mesh.matrixWorld.clone() });
  });

  // 2) Uma malha só pode SAIR da cena se toda a subárvore dela também sair —
  //    remover um pai levaria junto um filho não-fundido (sumiria da tela).
  //    Filho aqui = qualquer descendente renderizável ou com luz/câmera.
  const finalSet = new Set<Mesh>();
  for (const { mesh } of eligible.values()) {
    let ok = true;
    mesh.traverse((d) => {
      if (d === mesh) return;
      const dm = d as Mesh;
      if (dm.isMesh) {
        if (!eligible.has(dm)) ok = false;
      } else if ((d as { isLight?: boolean }).isLight || (d as { isCamera?: boolean }).isCamera || (d as { isSprite?: boolean }).isSprite || (d as { isPoints?: boolean }).isPoints || (d as { isLine?: boolean }).isLine) {
        ok = false; // renderável não-mesh na subárvore: não dá pra remover o pai
      }
    });
    if (ok) finalSet.add(mesh);
  }

  // 3) Agrupa e funde (grupo de 1 não vale o bake — fica como está).
  const groups = new Map<string, Candidate[]>();
  for (const mesh of finalSet) {
    const c = eligible.get(mesh)!;
    const list = groups.get(c.key);
    if (list) list.push(c);
    else groups.set(c.key, [c]);
  }

  const stats: StaticMergeStats = { merged: 0, groups: 0, kept: 0 };
  const toRemove = new Set<Object3D>();
  for (const list of groups.values()) {
    if (list.length < 2) {
      stats.kept += list.length;
      continue;
    }
    const parts: BufferGeometry[] = [];
    for (const c of list) {
      const g = c.mesh.geometry.clone();
      g.applyMatrix4(c.matrix); // baked em world space (posição/rotação/escala + normais)
      parts.push(g);
    }
    const mergedGeo = mergeGeometries(parts, false);
    for (const p of parts) p.dispose(); // os clones intermediários já foram copiados
    if (!mergedGeo) {
      stats.kept += list.length; // mismatch inesperado: mantém os originais
      continue;
    }
    const sample = list[0]!.mesh;
    const merged = new Mesh(mergedGeo, sample.material);
    merged.castShadow = sample.castShadow;
    merged.receiveShadow = sample.receiveShadow;
    merged.renderOrder = sample.renderOrder;
    const ud = merged.userData as Record<string, unknown>;
    ud['cortexMergedStatic'] = true;
    if (isSolid(sample)) ud['cortexSolid'] = true; // parede do Character sobrevive ao merge
    merged.name = `static-merged-${stats.groups}`;
    root.add(merged);
    stats.groups++;
    stats.merged += list.length;
    for (const c of list) toRemove.add(c.mesh);
  }

  // 4) Remove os originais fundidos (só o TOPO de cada subárvore — o resto sai junto).
  for (const mesh of toRemove) {
    if (!mesh.parent || !isUnderAny(mesh.parent, toRemove)) mesh.removeFromParent();
  }

  debug('scene', `mergeStatic: ${stats.merged} malhas → ${stats.groups} grupos (${stats.kept} mantidas)`);
  return stats;
}

/** Uma subárvore top-level é "bundável"? Estática, renderável e sem dinâmica. */
function isBundleable(obj: Object3D, dynRoots: Set<Object3D>): boolean {
  if ((obj as { isLight?: boolean }).isLight || (obj as { isCamera?: boolean }).isCamera) return false;
  if (isUnderAny(obj, dynRoots) || dynRoots.has(obj)) return false;
  if (isExcludedByUserData(obj)) return false; // água/vegetação/veículo/editor/invisível
  let hasMesh = false;
  let ok = true;
  obj.traverse((d) => {
    if (!ok) return;
    if ((d as { isLight?: boolean }).isLight || (d as { isCamera?: boolean }).isCamera) { ok = false; return; }
    const m = d as Mesh;
    if (m.isMesh) {
      if (isSkinned(m) || m.layers.mask !== 1 || isExcludedByUserData(m)) { ok = false; return; }
      hasMesh = true;
    }
  });
  return ok && hasMesh;
}

/**
 * **Render bundles** (M-perf-2b / SPEC-0136) — envolve as subárvores ESTÁTICAS de
 * `root` num {@link BundleGroup}. O `WebGPURenderer` grava os comandos de draw
 * dessas malhas **uma vez** e no replay vira **1 `executeBundles`** por pass,
 * cortando as milhares de travessias JS→C++ (setPipeline/BindGroup/VertexBuffer/
 * draw) por frame no host nativo — o gargalo de render do PRD-0005.
 *
 * Diferente do {@link mergeStaticScene}, NÃO exige geometria fundível: bundla
 * qualquer estático (inclusive `.glb` com buffers interleaved, que o merge
 * rejeita). Ficam FORA: entidades dinâmicas (ECS/script), animados, skinned,
 * água/vegetação/veículo, luzes/câmeras. Reparenta com `attach` (preserva o
 * world transform). O `BundleGroup` assume estrutura estática — reconstrua a cena
 * (novo `buildScene`) pra mudar. Roda DEPOIS do merge (bundla também as malhas
 * fundidas). Chame UMA vez, no fim do build.
 *
 * @returns Nº de subárvores top-level colocadas no bundle.
 */
export function wrapStaticInBundle(
  root: Object3D,
  world?: World,
  extraDynamicRoots: Iterable<Object3D> = [],
): number {
  root.updateMatrixWorld(true);
  const dynRoots = dynamicRoots(world);
  for (const r of extraDynamicRoots) dynRoots.add(r);

  const bundle = new BundleGroup();
  const toWrap = root.children.filter((c) => c !== bundle && isBundleable(c, dynRoots));
  for (const c of toWrap) bundle.attach(c); // attach preserva o world transform
  if (bundle.children.length > 0) {
    bundle.name = 'static-bundle';
    root.add(bundle);
  }
  debug('scene', `renderBundles: ${bundle.children.length} subárvores estáticas no bundle`);
  return bundle.children.length;
}

/**
 * Host nativo (export/console)? O shim de storage registra `__cortexReadUserFile`
 * só lá — no browser/Studio não existe. É onde o merge estático liga por default
 * (não há editor no host; no Studio o F2 precisa dos objetos individuais).
 */
export function isNativeHost(): boolean {
  return typeof (globalThis as { __cortexReadUserFile?: unknown }).__cortexReadUserFile === 'function';
}
