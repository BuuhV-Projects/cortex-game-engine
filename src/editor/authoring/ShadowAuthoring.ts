import type { Object3D } from 'three';
import { setShadows } from '../../scene/SceneAssets.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * **Autoria de sombra** (seção "Sombra" do Inspector — padrão ADR-0060). Os
 * toggles Projeta/Recebe sombra aplicavam ao vivo (`setShadows`) mas NÃO
 * persistiam — no reload voltava o default do nó. Agora gravam em
 * `overlay.data.shadow[nome]` (`{ cast?, recv? }`; campo ausente = sem opinião,
 * vale o nó/default) e o `buildScene` reaplica no boot.
 */

/** Entrada persistida por objeto: só o que o usuário tocou. */
export interface ShadowEntry {
  cast?: boolean;
  recv?: boolean;
}

export interface ShadowApi {
  /** Estado autorado (ou `{}` se o usuário nunca mexeu). */
  get(obj: Object3D): ShadowEntry;
  /** Aplica ao vivo E persiste (merge — só os campos passados). */
  set(obj: Object3D, options: { castShadow?: boolean; receiveShadow?: boolean }): void;
}

/** Cria a {@link ShadowApi}. */
export function createShadowApi(ctx: EditorAuthoringContext): ShadowApi {
  const map = (): Record<string, ShadowEntry> => ctx.record<ShadowEntry>('shadow');
  return {
    get: (obj) => (obj.name ? (map()[obj.name] ?? {}) : {}),
    set(obj, options) {
      setShadows(obj, options);
      if (!obj.name) return;
      const entry = map()[obj.name] ?? {};
      if (options.castShadow !== undefined) entry.cast = options.castShadow;
      if (options.receiveShadow !== undefined) entry.recv = options.receiveShadow;
      map()[obj.name] = entry;
      ctx.persist();
    },
  };
}
