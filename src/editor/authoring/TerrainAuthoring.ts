import type { Object3D, Vector3 } from 'three';
import { Terrain } from '../../scene/Terrain.js';
import type { TerrainApi } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * Efeitos colaterais do editor que o pincel de terreno dispara — injetados pelo
 * `attachEditor` (que detém gizmo/hud/brushRing/editorState). Mantêm a sessão de
 * esculpir + a matemática da pincelada (testáveis) separadas do que é interativo.
 */
export interface TerrainEditorHooks {
  /** Entrou no modo esculpir (esconde gizmo, marca editorState.sculptingTerrain). */
  onSculptStart(): void;
  /** Saiu (devolve gizmo, esconde o anel do pincel, limpa o estado). */
  onSculptStop(): void;
  /** Mensagem rápida na HUD. */
  toast(msg: string): void;
}

/** Autoria de terreno extraída (ADR-0060): a `TerrainApi` + ganchos pro layer interativo. */
export interface TerrainAuthoring {
  /** A API que o Inspector consome (get/startSculpt/stopSculpt/setBrush). */
  api: TerrainApi;
  /** Esculpindo agora? */
  isSculpting(): boolean;
  /** Objeto-terreno da sessão atual (alvo do raycast do cursor), ou null. */
  sculptObject(): Object3D | null;
  /** Pincel atual (raio/força em unidades de mundo). */
  brush(): { radius: number; strength: number };
  /** Pintando (arrastando) agora? */
  isPainting(): boolean;
  /** Liga/desliga o "pintando" (mousedown/up). */
  setPainting(v: boolean): void;
  /** Aplica uma pincelada num ponto de MUNDO (world→local + escala). `lower` = abaixa. */
  paintAt(worldHit: Vector3, lower: boolean): void;
  /** Grava o heightmap esculpido no overlay (`data.terrain[nome]`) + persiste. */
  save(): void;
}

/**
 * Cria a autoria de **terreno** (pincel raise/lower; ADR-0058/0060). Esculpe o
 * {@link Terrain} (em `userData.cortexTerrain`) e persiste o heightmap em
 * `overlay.data.terrain[nome]` (o `buildScene` reaplica via `overlayTerrain`). A
 * conversão world→local respeita posição/rotação/ESCALA do objeto (raio/força em
 * unidades de mundo). Os efeitos de UI (gizmo/hud/anel) vêm via {@link TerrainEditorHooks}.
 */
export function createTerrainAuthoring(ctx: EditorAuthoringContext, hooks: TerrainEditorHooks): TerrainAuthoring {
  const brush = { radius: 6, strength: 0.5 };
  let sculpt: { terrain: Terrain; obj: Object3D; painting: boolean } | null = null;
  const map = (): Record<string, number[]> => ctx.record<number[]>('terrain');
  const terrainOf = (obj: Object3D): Terrain | undefined =>
    (obj.userData as Record<string, unknown>)['cortexTerrain'] as Terrain | undefined;

  const save = (): void => {
    if (sculpt && sculpt.obj.name) {
      map()[sculpt.obj.name] = sculpt.terrain.getHeights();
      ctx.persist();
    }
  };

  const api: TerrainApi = {
    get: (obj) =>
      terrainOf(obj) ? { sculpting: sculpt?.obj === obj, radius: brush.radius, strength: brush.strength } : null,
    startSculpt: (obj) => {
      const t = terrainOf(obj);
      if (!t) {
        hooks.toast('Esse objeto não é um terreno');
        return;
      }
      sculpt = { terrain: t, obj, painting: false };
      hooks.onSculptStart();
      hooks.toast('Esculpir: CLIQUE/ARRASTE sobe · segure SHIFT pra abaixar');
    },
    stopSculpt: () => {
      save();
      sculpt = null;
      hooks.onSculptStop();
    },
    setBrush: (radius, strength) => {
      brush.radius = radius;
      brush.strength = strength;
    },
  };

  const paintAt = (worldHit: Vector3, lower: boolean): void => {
    if (!sculpt) return;
    const local = sculpt.obj.worldToLocal(worldHit.clone());
    const scl = sculpt.obj.scale.x || 1; // raio/força em unidades de MUNDO
    sculpt.terrain.sculpt(local.x, local.z, brush.radius / scl, (brush.strength / scl) * (lower ? -1 : 1));
  };

  return {
    api,
    isSculpting: () => sculpt !== null,
    sculptObject: () => sculpt?.obj ?? null,
    brush: () => brush,
    isPainting: () => sculpt?.painting ?? false,
    setPainting: (v) => {
      if (sculpt) sculpt.painting = v;
    },
    paintAt,
    save,
  };
}
