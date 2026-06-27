import type { Object3D } from 'three';
import type { VegetationApi, VegetationEditState } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';
import type { SceneNode } from '../../scene/SceneDefinition.js';
import type { Vegetation } from '../../scene/Vegetation.js';

/** Nó `vegetation` como persistido em `overlay.data.added`. */
type VegetationAddedNode = Extract<SceneNode, { type: 'vegetation' }>;

/**
 * Efeitos colaterais do editor que o pincel de vegetação dispara — injetados pelo
 * `attachEditor` (que detém hud/anel/editorState/raycast do terreno). Separam a
 * matemática do espalhamento (testável) do que é interativo.
 */
export interface VegetationEditorHooks {
  /** Entrou no modo pincel (esconde gizmo, marca o estado de pintura). */
  onPaintStart(): void;
  /** Saiu (devolve gizmo, esconde o anel, limpa o estado). */
  onPaintStop(): void;
  /** Mensagem rápida na HUD. */
  toast(msg: string): void;
  /** Altura (Y de mundo) do terreno em `(x,z)`, ou `null` se fora do terreno (raycast). */
  groundAt(x: number, z: number): number | null;
}

/** Autoria de **vegetação** (pincel de espalhar): a `VegetationApi` + ganchos interativos. */
export interface VegetationAuthoring {
  /** API consumida pelo Inspector (get/startPaint/stopPaint/setBrush/setScale). */
  api: VegetationApi;
  /** Pincel ativo agora? */
  isPainting(): boolean;
  /** Objeto-vegetação da sessão atual (alvo do pincel), ou `null`. */
  paintObject(): Object3D | null;
  /** Raio do pincel (mundo) — pro anel visual. */
  brushRadius(): number;
  /** Arrastando (mousedown) agora? */
  isStroking(): boolean;
  /** Liga/desliga o "arrastando" (mousedown/up). */
  setStroking(v: boolean): void;
  /** Espalha (ou apaga, com `erase`) instâncias ao redor do ponto de mundo `(x,z)`. */
  scatterAt(x: number, z: number, erase: boolean): void;
  /** Grava as instâncias no nó (`data.added`) + persiste (ao soltar). */
  save(): void;
}

/**
 * Cria a autoria de **vegetação** (ADR-0077, fase 2): pincel que **espalha** instâncias
 * de árvore/grama no terreno. Mexe na {@link Vegetation} viva (`userData.cortexVegetation`)
 * e grava as `instances` direto no nó (`data.added`) — o `buildScene` (`makeVegetation`)
 * restaura de lá. O espalhamento assenta cada instância na altura do terreno
 * (`hooks.groundAt`), com rotação Y aleatória, escala em `[scaleMin,scaleMax]` e um
 * **espaçamento mínimo** pra não amontoar. `erase` remove num raio (borracha).
 */
export function createVegetationAuthoring(ctx: EditorAuthoringContext, hooks: VegetationEditorHooks): VegetationAuthoring {
  const brush = { radius: 6, density: 4, scaleMin: 0.8, scaleMax: 1.3 };
  let sess: { veg: Vegetation; obj: Object3D; stroking: boolean; dirty: boolean } | null = null;

  const added = (): VegetationAddedNode[] => {
    const a = ctx.overlay.data['added'];
    return Array.isArray(a) ? (a as VegetationAddedNode[]) : [];
  };
  const nodeOf = (obj: Object3D): VegetationAddedNode | undefined =>
    added().find((n) => n.type === 'vegetation' && n.id === obj.name);
  const vegOf = (obj: Object3D): Vegetation | undefined =>
    (obj.userData as Record<string, unknown>)['cortexVegetation'] as Vegetation | undefined;

  const save = (): void => {
    if (!sess || !sess.obj.name) return;
    const node = nodeOf(sess.obj);
    if (node) {
      node.instances = sess.veg.getInstances();
      ctx.persist();
    }
    sess.dirty = false;
  };

  // Determinístico o suficiente pro pincel (sem Math.random no engine puro; aqui é
  // editor interativo). Espalha `density` tentativas no disco do pincel, assenta no
  // terreno e respeita o espaçamento mínimo (não amontoa).
  const scatterAt = (cx: number, cz: number, erase: boolean): void => {
    if (!sess) return;
    const veg = sess.veg;
    if (erase) {
      if (veg.removeNear(cx, cz, brush.radius) > 0) sess.dirty = true;
      return;
    }
    const minSpacing = Math.max(0.4, brush.radius * 0.28);
    const min2 = minSpacing * minSpacing;
    const existing = veg.getInstances(); // [x,y,z,rotY,scale] — checa só o que está perto
    for (let k = 0; k < brush.density; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * brush.radius; // uniforme no disco
      const x = cx + Math.cos(ang) * r;
      const z = cz + Math.sin(ang) * r;
      const y = hooks.groundAt(x, z);
      if (y == null) continue; // fora do terreno
      // Espaçamento mínimo vs. já existentes + as recém-colocadas nesta pincelada.
      let tooClose = false;
      for (let i = 0; i < existing.length; i += 5) {
        const dx = existing[i]! - x;
        const dz = existing[i + 2]! - z;
        if (dx * dx + dz * dz < min2) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const rotY = Math.random() * Math.PI * 2;
      const scale = brush.scaleMin + Math.random() * Math.max(0, brush.scaleMax - brush.scaleMin);
      if (veg.add(x, y, z, rotY, scale)) {
        existing.push(x, y, z, rotY, scale);
        sess.dirty = true;
      }
    }
  };

  const api: VegetationApi = {
    get: (obj) => {
      const veg = vegOf(obj);
      if (!veg) return null;
      const state: VegetationEditState = {
        painting: sess?.obj === obj,
        radius: brush.radius,
        density: brush.density,
        scaleMin: brush.scaleMin,
        scaleMax: brush.scaleMax,
        count: veg.count,
      };
      return state;
    },
    startPaint: (obj) => {
      const veg = vegOf(obj);
      if (!veg) {
        hooks.toast('Esse objeto não é vegetação');
        return;
      }
      sess = { veg, obj, stroking: false, dirty: false };
      hooks.onPaintStart();
      hooks.toast('Vegetação: CLIQUE/ARRASTE espalha · SHIFT apaga');
    },
    stopPaint: () => {
      save();
      sess = null;
      hooks.onPaintStop();
    },
    setBrush: (radius, density) => {
      brush.radius = Math.max(0.5, radius);
      brush.density = Math.max(1, Math.round(density));
    },
    setScale: (min, max) => {
      brush.scaleMin = Math.max(0.05, min);
      brush.scaleMax = Math.max(brush.scaleMin, max);
    },
  };

  return {
    api,
    isPainting: () => sess !== null,
    paintObject: () => sess?.obj ?? null,
    brushRadius: () => brush.radius,
    isStroking: () => sess?.stroking ?? false,
    setStroking: (v) => {
      if (sess) sess.stroking = v;
    },
    scatterAt,
    save,
  };
}
