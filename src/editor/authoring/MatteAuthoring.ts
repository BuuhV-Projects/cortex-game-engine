import { setMatte, clearMatte, isMatte } from '../../scene/SceneAssets.js';
import type { MatteApi } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * Autoria do estado **fosco (matte)** por objeto (ADR-0060). Liga/desliga o look
 * cartoon ao vivo e persiste em `overlay.data.matte[nome]` (true/false explícito —
 * `false` sobrescreve um matte do código); o `buildScene` reaplica no boot.
 */
export function createMatteApi(ctx: EditorAuthoringContext): MatteApi {
  const map = (): Record<string, boolean> => ctx.record<boolean>('matte');
  return {
    get: (obj) => isMatte(obj),
    set: (obj, v) => {
      if (v) setMatte(obj);
      else clearMatte(obj);
      if (obj.name) map()[obj.name] = v;
      ctx.persist();
    },
  };
}
