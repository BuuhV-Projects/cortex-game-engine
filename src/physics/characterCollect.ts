import type { Object3D } from 'three';
import { nativeRoutable } from './nativeRaycast.js';
import { ensureBoundsTree, isSkinned } from './raycastAccel.js';

/** Raio-base do tronco (×escala da instância) pra colisão barata com vegetação. */
export const TRUNK_RADIUS = 0.4;

/** Floats por instância no formato plano da vegetação (`[x, y, z, rotY, escala]`). */
const VEG_STRIDE = 5;
/** Bits da pilha: o nó está numa subárvore escondida / tem ancestral `cortexSolid`. */
const HIDDEN = 1;
const SOLID_ABOVE = 2;

/** O que a coleta lê de `userData.cortexVegetation` (a {@link Vegetation} da cena). */
interface VegetationLike {
  getInstances(): number[];
  /** Sobe a cada mudança das instâncias (SPEC-0674); sem ele, os troncos são relidos toda vez. */
  readonly version?: number;
}

type Flags = Record<string, unknown>;

/** `obj` (ou ancestral) é marcado SÓLIDO (`cortexSolid`) — vira parede pro Character. */
function isSolid(obj: Object3D | null): boolean {
  let p: Object3D | null = obj;
  while (p) {
    if (p.userData?.['cortexSolid'] === true) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Varredura da cena pro {@link CharacterPhysicsSystem} (SPEC-0302/0307/0320/0328, SPEC-0674), separando o que cada
 * checagem precisa (em vez de cada raycast testar a cena inteira — caro com road/terreno densos):
 * - `trunks` (`[x,z,raio]`): vegetação sólida → colisão por cilindro (sem raycast).
 * - `solidMeshes`: blockout `cortexSolid` → alvo do empurrão de PAREDE.
 * - `terrainMeshes`: `cortexTerrain` → alvo do clamp ANTI-CLIP.
 * - `groundMeshes`: tudo PISÁVEL (terreno/road/solid/modelos) → alvo do raycast de CHÃO.
 * - `visibleMeshes`: toda malha visível não skinada (a câmera da 3ª pessoa reaproveita, SPEC-0328).
 *
 * A **vegetação fica fora de todos os raycasts** (colisão é por cilindro/`trunks`), então o raycast dela pode
 * ficar LIGADO pro editor selecioná-la sem custo na física. Sub-malhas de vegetação, gizmos do editor (a subárvore
 * inteira), `cortexNoCollide`, o que está escondido (`visible = false`, salvo collider invisível declarado) e a
 * decoração de marcação ficam de fora. Subárvore escondida só é percorrida na 1ª vez (pra montar o BVH) —
 * `prepared` guarda as raízes já preparadas.
 *
 * Mesma poda e mesma ordem do `traverseCollidable` recursivo, mas numa pilha explícita reaproveitada (sem closure
 * por nó) e com o "tem ancestral sólido" descendo pela pilha em vez de subir aos ancestrais por malha. Os troncos
 * só são relidos quando a sequência de vegetações sólidas ou a `version` de alguma muda (SPEC-0674).
 */
export class CharacterSceneCollector {
  readonly trunks: number[] = [];
  readonly solidMeshes: Object3D[] = [];
  readonly terrainMeshes: Object3D[] = [];
  readonly groundMeshes: Object3D[] = [];
  readonly visibleMeshes: Object3D[] = [];
  /** `true` quando a última {@link collect} remontou `trunks`. */
  trunksChanged = false;
  /** Nós escondidos já preparados (BVH) — a varredura não desce neles de novo (SPEC-0320). */
  private prepared = new WeakSet<Object3D>();
  private readonly stackNodes: Object3D[] = [];
  private readonly stackFlags: number[] = [];
  private readonly veg: VegetationLike[] = [];
  private readonly vegVersions: number[] = [];
  private readonly lastVeg: VegetationLike[] = [];
  private readonly lastVegVersions: number[] = [];

  /** Esquece o que já foi preparado e os troncos lidos: a próxima {@link collect} refaz tudo. */
  reset(): void {
    this.prepared = new WeakSet<Object3D>();
    this.lastVeg.length = 0;
    this.lastVegVersions.length = 0;
    this.trunks.length = 0;
  }

  /** Varre `roots` e remonta as listas. */
  collect(roots: readonly Object3D[]): void {
    this.visibleMeshes.length = 0;
    this.solidMeshes.length = 0;
    this.terrainMeshes.length = 0;
    this.groundMeshes.length = 0;
    this.veg.length = 0;
    this.vegVersions.length = 0;
    const nodes = this.stackNodes;
    const flags = this.stackFlags;
    for (let r = 0; r < roots.length; r++) {
      const root = roots[r]!;
      nodes.push(root);
      flags.push(isSolid(root.parent) ? SOLID_ABOVE : 0);
      while (nodes.length > 0) {
        const o = nodes.pop()!;
        const f = flags.pop()!;
        const ud = o.userData as Flags;
        if (ud['editorInternal'] || ud['cortexNoCollide']) continue;
        const solidHere = ud['cortexSolid'] === true;
        const hidden = (f & HIDDEN) !== 0 || (!o.visible && !solidHere);
        if (!this.visit(o, ud, hidden, solidHere || (f & SOLID_ABOVE) !== 0)) continue;
        const childFlags = (hidden ? HIDDEN : 0) | (solidHere || (f & SOLID_ABOVE) !== 0 ? SOLID_ABOVE : 0);
        const children = o.children;
        // ao contrário: o 1º filho sai primeiro (pré-ordem, a ordem da recursão)
        for (let c = children.length - 1; c >= 0; c--) {
          nodes.push(children[c]!);
          flags.push(childFlags);
        }
      }
    }
    this.trunksChanged = this.refreshTrunks();
  }

  /** Classifica `o`; `false` = não desce nos filhos. `solid` = ele ou um ancestral é `cortexSolid`. */
  private visit(o: Object3D, ud: Flags, hidden: boolean, solid: boolean): boolean {
    const isMesh = (o as { isMesh?: boolean }).isMesh === true;
    if (hidden) {
      // escondido não colide, mas o BVH sai agora (carga), não no quadro em que o culling o mostrar —
      // senão vira um pico no meio do jogo (SPEC-0307). Já preparada: não desce de novo (SPEC-0320).
      // A malha que o host reproduz não precisa da árvore em JS: o raio vai pro C++ (SPEC-0729).
      if (this.prepared.has(o)) return false;
      this.prepared.add(o);
      if (isMesh && !ud['cortexVegetationSub'] && !ud['cortexWater'] && !isSkinned(o) && !nativeRoutable(o)) {
        ensureBoundsTree(o);
      }
      return true;
    }
    const skinned = isMesh && isSkinned(o);
    // a copa da vegetação fica de fora: a câmera passa por ela (SPEC-0647)
    if (isMesh && !skinned && !ud['cortexVegetationSub']) this.visibleMeshes.push(o);
    if (ud['cortexVegetation'] && ud['cortexSolid'] === true) {
      const v = ud['cortexVegetation'] as VegetationLike;
      this.veg.push(v);
      this.vegVersions.push(typeof v.version === 'number' ? v.version : NaN);
      return true;
    }
    if (!isMesh || ud['cortexVegetationSub']) return true;
    if (ud['cortexRoadMarkings']) return true; // decoração: fora da física
    // Água é cenário LÍQUIDO, nunca colisão (SPEC-0163); o raycast do mesh fica ligado pro picking do editor.
    if (ud['cortexWater']) return true;
    // Personagem/NPC (SkinnedMesh) NUNCA é chão/parede — e raycast em malha skinada computa o skinning por
    // vértice na CPU a cada raio (ver isSkinned).
    if (skinned) return true;
    // Props detalhados ganham árvore BVH → raycast O(log n) em vez de O(nº de triângulos). Ver raycastAccel.
    // No host, a malha que o raycast nativo reproduz fica sem a árvore em JS (SPEC-0729); se deixar de ser
    // roteável, o `jsFirstHit` a monta sob demanda.
    if (!nativeRoutable(o)) ensureBoundsTree(o);
    if (ud['cortexTerrain']) this.terrainMeshes.push(o);
    else if (solid) this.solidMeshes.push(o);
    this.groundMeshes.push(o); // superfície pisável (terreno/road/solid/modelo), exceto vegetação
    return true;
  }

  /** Relê os troncos se a sequência de vegetações sólidas (ou a versão de alguma) mudou. */
  private refreshTrunks(): boolean {
    const n = this.veg.length;
    let same = n === this.lastVeg.length;
    for (let i = 0; i < n && same; i++) {
      // NaN (sem `version`) nunca é igual: relê
      same = this.veg[i] === this.lastVeg[i] && this.vegVersions[i] === this.lastVegVersions[i];
    }
    if (same) return false;
    const trunks = this.trunks;
    trunks.length = 0;
    this.lastVeg.length = this.lastVegVersions.length = n;
    for (let i = 0; i < n; i++) {
      const inst = this.veg[i]!.getInstances();
      for (let k = 0; k < inst.length; k += VEG_STRIDE) {
        const scale = inst[k + 4]!;
        // Escala 0 (o vão que o `writeInstances` zera, SPEC-0675) não desenha: não é tronco na origem.
        if (scale === 0) continue;
        trunks.push(inst[k]!, inst[k + 2]!, TRUNK_RADIUS * scale);
      }
      this.lastVeg[i] = this.veg[i]!;
      this.lastVegVersions[i] = this.vegVersions[i]!;
    }
    return true;
  }
}
