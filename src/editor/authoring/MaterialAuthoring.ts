import { applyMaterial, type MaterialConfig } from '../../scene/Materials.js';
import type { MaterialApi } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * Autoria do **material/shader por objeto** (ADR-0058/0060): aplica o preset
 * (standard/unlit/toon) ao vivo e persiste a `MaterialConfig` em
 * `overlay.data.material[nome]`. `standard` remove a autoria (volta ao `.glb`).
 */
export function createMaterialApi(ctx: EditorAuthoringContext): MaterialApi {
  const map = (): Record<string, MaterialConfig> => ctx.record<MaterialConfig>('material');
  return {
    get: (obj) => (obj.name ? (map()[obj.name] ?? null) : null),
    set: (obj, config) => {
      applyMaterial(obj, config);
      if (obj.name) {
        if (config.type === 'standard') delete map()[obj.name];
        else map()[obj.name] = config;
      }
      ctx.persist();
    },
  };
}
