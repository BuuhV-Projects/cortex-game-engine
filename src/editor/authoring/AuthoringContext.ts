import type { Object3D } from 'three';
import type { Game } from '../../core/Game.js';
import type { SceneFileV1 } from '../../scene/SceneFile.js';

/**
 * **Contexto compartilhado das autorias do editor** (ADR-0060). Cada módulo de
 * autoria (`createXAuthoring(ctx)`) recebe isto e mexe **só** no seu pedaço do
 * overlay (via {@link EditorAuthoringContext.record}) + aplica a edição ao vivo no
 * `World`/cena. Substitui os acessores `xMap()` repetidos do antigo `attachEditor`.
 */
export interface EditorAuthoringContext {
  /** Jogo (world, scene, input). */
  game: Game;
  /** Raiz THREE da cena (raycast/colisão/roots de sistemas). */
  three: Object3D;
  /** Arquivo de overlay (persistência da autoria: `data.*`, `objects`). */
  overlay: SceneFileV1;
  /** Agenda a gravação do overlay (debounced; `immediate` força na hora). */
  persist(immediate?: boolean): void;
  /**
   * Acessor tipado a um sub-objeto de `overlay.data` (cria `{}` se faltar) — o
   * **OverlayStore**. Ex.: `record<boolean>('matte')` → `data.matte` por nome.
   */
  record<T>(key: string): Record<string, T>;
}

/** Cria o {@link EditorAuthoringContext} a partir das peças do `attachEditor`. */
export function createAuthoringContext(
  game: Game,
  three: Object3D,
  overlay: SceneFileV1,
  persist: (immediate?: boolean) => void,
): EditorAuthoringContext {
  return {
    game,
    three,
    overlay,
    persist,
    record<T>(key: string): Record<string, T> {
      // Lê `overlay.data` DINAMICAMENTE (não capturar por referência!): o attachEditor
      // SUBSTITUI `overlay.data = f.data` ao semear o arquivo (async no boot). Se a
      // gente capturasse `overlay.data` aqui, a autoria escreveria no objeto antigo
      // (órfão) e o persist salvaria o novo — a edição se perdia. (Bug do save.)
      const data = overlay.data as Record<string, unknown>;
      const m = data[key];
      if (m && typeof m === 'object' && !Array.isArray(m)) return m as Record<string, T>;
      const o: Record<string, T> = {};
      data[key] = o;
      return o;
    },
  };
}
