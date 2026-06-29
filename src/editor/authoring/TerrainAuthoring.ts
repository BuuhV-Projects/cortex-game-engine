import type { Object3D, Vector3 } from 'three';
import { Terrain, type TerrainPaintData } from '../../scene/Terrain.js';
import type { TerrainApi, TerrainBrushMode } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * Efeitos colaterais do editor que o pincel de terreno dispara — injetados pelo
 * `attachEditor` (que detém gizmo/hud/brushRing/editorState). Mantêm a sessão de
 * esculpir + a matemática da pincelada (testáveis) separadas do que é interativo.
 */
export interface TerrainEditorHooks {
  /** Entrou no modo pincel (esconde gizmo, marca editorState.sculptingTerrain). */
  onSculptStart(): void;
  /** Saiu (devolve gizmo, esconde o anel do pincel, limpa o estado). */
  onSculptStop(): void;
  /** Mensagem rápida na HUD. */
  toast(msg: string): void;
}

/** Autoria de terreno extraída (ADR-0060): a `TerrainApi` + ganchos pro layer interativo. */
export interface TerrainAuthoring {
  /** A API que o Inspector consome (get/startSculpt/stopSculpt/setBrush/setMode/setTexture…). */
  api: TerrainApi;
  /** Pincel ativo agora (esculpindo OU pintando)? */
  isSculpting(): boolean;
  /** Objeto-terreno da sessão atual (alvo do raycast do cursor), ou null. */
  sculptObject(): Object3D | null;
  /** Pincel atual (raio/força em unidades de mundo). */
  brush(): { radius: number; strength: number };
  /** Modo atual do pincel (`sculpt` altura / `paint` textura). */
  mode(): TerrainBrushMode;
  /** Pintando (arrastando) agora? */
  isPainting(): boolean;
  /** Liga/desliga o "pintando" (mousedown/up). */
  setPainting(v: boolean): void;
  /** Aplica uma pincelada num ponto de MUNDO (world→local + escala). `invert` = abaixa/apaga. */
  paintAt(worldHit: Vector3, invert: boolean): void;
  /** Grava heightmap (`data.terrain[nome]`) + pintura (`data.terrainPaint[nome]`) e persiste. */
  save(): void;
  /** Informa as texturas disponíveis no projeto (lista do `/__list-assets`, só imagens). */
  setAvailableTextures(urls: string[]): void;
}

/**
 * Cria a autoria de **terreno** (pincel raise/lower + pintura de textura;
 * ADR-0059/0060). Esculpe/pinta o {@link Terrain} (em `userData.cortexTerrain`) e
 * persiste o heightmap em `overlay.data.terrain[nome]` e a pintura em
 * `overlay.data.terrainPaint[nome]` (o `buildScene` reaplica via
 * `overlayTerrain`/`overlayTerrainPaint`). A conversão world→local respeita
 * posição/rotação/ESCALA do objeto (raio/força em unidades de mundo). Os efeitos
 * de UI (gizmo/hud/anel) vêm via {@link TerrainEditorHooks}.
 */
export function createTerrainAuthoring(ctx: EditorAuthoringContext, hooks: TerrainEditorHooks): TerrainAuthoring {
  const brush = { radius: 6, strength: 0.5 };
  let mode: TerrainBrushMode = 'sculpt';
  let availableTextures: string[] = [];
  let activeTexture: string | null = null;
  let sculpt: { terrain: Terrain; obj: Object3D; painting: boolean } | null = null;
  const map = (): Record<string, number[]> => ctx.record<number[]>('terrain');
  const paintMap = (): Record<string, TerrainPaintData> => ctx.record<TerrainPaintData>('terrainPaint');
  const terrainOf = (obj: Object3D): Terrain | undefined =>
    (obj.userData as Record<string, unknown>)['cortexTerrain'] as Terrain | undefined;

  const save = (): void => {
    if (sculpt && sculpt.obj.name) {
      map()[sculpt.obj.name] = sculpt.terrain.getHeights();
      const paint = sculpt.terrain.getPaint();
      if (paint) paintMap()[sculpt.obj.name] = paint;
      ctx.persist();
    }
  };

  /** Tamanho do terreno no MUNDO (lado maior, em metros) = dimensão do mesh × escala do nó. */
  const worldSize = (t: Terrain): number =>
    Math.max(t.width * Math.abs(t.mesh.scale.x), t.depth * Math.abs(t.mesh.scale.z));

  /** Tiling default de uma camada nova: ~1 tile a cada 4 m de MUNDO (ciente da escala). */
  const defaultRepeat = (t: Terrain): number => Math.max(1, Math.round(worldSize(t) / 4));

  /** Repeat (nº de tiles ao longo do terreno) da textura ativa, ou o default. */
  const repeatTilesOf = (t: Terrain): number => {
    const layer = activeTexture ? t.getLayers().find((l) => l.url === activeTexture) : undefined;
    return layer?.repeat ?? defaultRepeat(t);
  };

  /** Tamanho do tile em METROS (o que o Inspector mostra) = mundo ÷ tiles. */
  const tileMetersOf = (t: Terrain): number => worldSize(t) / Math.max(0.001, repeatTilesOf(t));

  /** Garante a camada da textura ativa no terreno; `-1` (e toast) se as 4 já estão em uso. */
  const ensureLayer = (t: Terrain): number => {
    if (!activeTexture) return -1;
    const idx = t.layerFor(activeTexture, defaultRepeat(t));
    if (idx < 0) hooks.toast('Esse terreno já usa 4 texturas (máximo) — reuse uma delas');
    return idx;
  };

  const hint = (): string =>
    mode === 'paint'
      ? 'Texturizar: escolha a textura no Inspector · CLIQUE/ARRASTE pinta · SHIFT apaga'
      : 'Esculpir: CLIQUE/ARRASTE sobe · segure SHIFT pra abaixar';

  const api: TerrainApi = {
    get: (obj) => {
      const t = terrainOf(obj);
      if (!t) return null;
      return {
        sculpting: sculpt?.obj === obj,
        mode,
        radius: brush.radius,
        strength: brush.strength,
        textures: availableTextures,
        texture: activeTexture,
        tileMeters: tileMetersOf(t),
      };
    },
    startSculpt: (obj) => {
      const t = terrainOf(obj);
      if (!t) {
        hooks.toast('Esse objeto não é um terreno');
        return;
      }
      sculpt = { terrain: t, obj, painting: false };
      hooks.onSculptStart();
      hooks.toast(hint());
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
    setMode: (m) => {
      mode = m;
      if (sculpt) hooks.toast(hint());
    },
    setTexture: (obj, url) => {
      activeTexture = url || null;
      const t = terrainOf(obj);
      if (t && activeTexture) {
        if (t.layerFor(activeTexture, defaultRepeat(t)) < 0) {
          hooks.toast('Esse terreno já usa 4 texturas (máximo) — reuse uma delas');
        }
      }
    },
    setTileSize: (obj, meters) => {
      const t = terrainOf(obj);
      if (!t || !activeTexture || !(meters > 0)) return;
      const idx = t.getLayers().findIndex((l) => l.url === activeTexture);
      if (idx < 0) return;
      t.setLayerRepeat(idx, worldSize(t) / meters); // metros por tile → nº de tiles
      if (obj.name) {
        const paint = t.getPaint();
        if (paint) {
          paintMap()[obj.name] = paint;
          ctx.persist();
        }
      }
    },
    importTexture: (obj, name, dataUrl) => {
      if (typeof fetch === 'undefined') {
        hooks.toast('Importação de textura indisponível neste ambiente');
        return;
      }
      void (async () => {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const res = await fetch(`/__upload-asset?name=${encodeURIComponent(name)}`, {
            method: 'POST',
            body: blob,
          });
          if (!res.ok) throw new Error(await res.text());
          const path = await res.text();
          if (!availableTextures.includes(path)) availableTextures = [...availableTextures, path];
          api.setTexture(obj, path);
          hooks.toast(`Textura importada: ${path}`);
        } catch (e) {
          hooks.toast(`Falha ao importar textura: ${String(e)}`);
        }
      })();
    },
  };

  const paintAt = (worldHit: Vector3, invert: boolean): void => {
    if (!sculpt) return;
    const local = sculpt.obj.worldToLocal(worldHit.clone());
    const scl = sculpt.obj.scale.x || 1; // raio/força em unidades de MUNDO
    if (mode === 'paint') {
      const layer = ensureLayer(sculpt.terrain);
      if (layer < 0) {
        if (!activeTexture) hooks.toast('Escolha uma textura no Inspector pra pintar');
        return;
      }
      // Força do pincel vira opacidade da pincelada (clampa em 0..1); SHIFT apaga.
      const amount = Math.max(0.01, Math.min(1, Math.abs(brush.strength))) * (invert ? -1 : 1);
      sculpt.terrain.paint(local.x, local.z, brush.radius / scl, amount, layer);
      return;
    }
    sculpt.terrain.sculpt(local.x, local.z, brush.radius / scl, (brush.strength / scl) * (invert ? -1 : 1));
  };

  return {
    api,
    isSculpting: () => sculpt !== null,
    sculptObject: () => sculpt?.obj ?? null,
    brush: () => brush,
    mode: () => mode,
    isPainting: () => sculpt?.painting ?? false,
    setPainting: (v) => {
      if (sculpt) sculpt.painting = v;
    },
    paintAt,
    save,
    setAvailableTextures: (urls) => {
      availableTextures = urls;
    },
  };
}
