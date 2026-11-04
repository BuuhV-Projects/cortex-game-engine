import type { Object3D } from 'three';
import type { World } from '../ecs/World.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { Object3DComponent } from '../components/Object3DComponent.js';
import { ScriptComponent } from '../components/ScriptComponent.js';
import { isStaticEntity } from '../components/staticEntity.js';
import { Object3DSyncSystem } from '../systems/Object3DSyncSystem.js';

/**
 * O que é cenário parado para o merge estático (SPEC-0120) e para o congelamento do
 * `Object3DSyncSystem` (SPEC-0684): as duas decisões usam esta mesma classificação.
 */

/** Flags de `userData` que tiram um objeto (e a subárvore) do merge. */
const EXCLUDED_USER_DATA = [
  'editorInternal',
  'cortexVegetation',
  'cortexVegetationSub',
  'cortexTerrain',
  'cortexWater',
  'cortexUnderlay',
  'cortexVehicle',
  'cortexDynamic',
] as const;

/** `obj` (ou ancestral) tem flag de exclusão (editor/vegetação/terreno/dinâmico do jogo)? */
export function hasExclusionFlag(obj: Object3D): boolean {
  for (let p: Object3D | null = obj; p; p = p.parent) {
    const ud = p.userData as Record<string, unknown>;
    for (const flag of EXCLUDED_USER_DATA) if (ud[flag]) return true;
  }
  return false;
}

/** `obj` (ou ancestral) tem flag de exclusão ou está invisível? É o critério do merge: não funde o que não é desenhado. */
export function isExcludedByUserData(obj: Object3D): boolean {
  if (hasExclusionFlag(obj)) return true;
  for (let p: Object3D | null = obj; p; p = p.parent) {
    if (!p.visible) return true; // invisível (mannequin oculto, toggles)
  }
  return false;
}

/** `obj` está sob (ou é) algum dos roots? */
export function isUnderAny(obj: Object3D, roots: Set<Object3D>): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (roots.has(p)) return true;
    p = p.parent;
  }
  return false;
}

/** Raízes de entidades dinâmicas do mundo (subárvores que o merge não toca). */
export function dynamicRoots(world: World | undefined): Set<Object3D> {
  const roots = new Set<Object3D>();
  if (!world) return roots;
  for (const e of world.query(Object3DComponent)) {
    // Collider NÃO-sólido = GATILHO (ADR-0220): objeto de jogo, não cenário — o
    // jogo mede o bbox dele, esconde e consome (poder do kart-racer, gatilho de
    // fase). Fundido, sobra um Group VAZIO: bbox vazio e `visible = false` sem
    // efeito (a arte foi pra malha fundida). Fica de fora, como os de script.
    if (!isStaticEntity(e)) {
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

/**
 * Congela no `Object3DSyncSystem` as entidades que o merge tratou como cenário
 * (SPEC-0684): estáticas pelos componentes, fora das raízes dinâmicas e sem flag de
 * exclusão no `userData` (a visibilidade não conta, ao contrário do merge). Chamado pelo `mergeStaticScene` DEPOIS de fundir — o
 * `freeze` faz a escrita que o primeiro quadro do sync faria.
 *
 * @returns Quantas entidades foram congeladas.
 */
export function freezeStaticEntities(world: World, dynRoots: Set<Object3D>): number {
  let frozen = 0;
  for (const e of world.query(Object3DComponent)) {
    if (!e.hasComponent(TransformComponent) || !isStaticEntity(e)) continue;
    const obj = e.getComponent(Object3DComponent)!.object;
    // Só a flag barra: a visibilidade não move o transform. O colisor invisível (caixa de colisão sem arte, ~1,8 mil
    // no DDD 00) e a célula que o streaming escondeu no build são cenário parado como os outros.
    if (isUnderAny(obj, dynRoots) || hasExclusionFlag(obj)) continue;
    if (Object3DSyncSystem.freeze(e)) frozen++;
  }
  return frozen;
}
