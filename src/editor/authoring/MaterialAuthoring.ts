import { applyMaterial, type MaterialConfig } from '../../scene/Materials.js';
import type { MaterialApi } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * Autoria do **material/shader por objeto** (SPEC-0058/0060): aplica o preset
 * (standard/unlit/toon) ao vivo e persiste a `MaterialConfig` em
 * `overlay.data.material[nome]`.
 *
 * O `get` mostra o valor **efetivo**: override do editor > `material` declarado
 * no NÓ (via `userData.cortexNodeDef`) — senão o Inspector exibia "Padrão" em
 * objeto que o level.json/código declara unlit/toon. `standard` remove a
 * autoria (volta ao `.glb`) — MAS, se o nó declara material, persiste um
 * `{type:'standard'}` explícito (deletar deixaria o material do nó voltar no
 * reload; o buildScene resolve `overlay ?? nó`).
 */
export function createMaterialApi(ctx: EditorAuthoringContext): MaterialApi {
  const map = (): Record<string, MaterialConfig> => ctx.record<MaterialConfig>('material');
  const nodeMaterial = (obj: Parameters<MaterialApi['get']>[0]): MaterialConfig | null => {
    const def = (obj.userData as Record<string, unknown> | undefined)?.['cortexNodeDef'] as
      | { material?: MaterialConfig }
      | undefined;
    return def?.material ?? null;
  };
  return {
    get: (obj) => (obj.name ? (map()[obj.name] ?? nodeMaterial(obj)) : nodeMaterial(obj)),
    set: (obj, config) => {
      applyMaterial(obj, config);
      if (obj.name) {
        if (config.type === 'standard' && !nodeMaterial(obj)) delete map()[obj.name];
        else map()[obj.name] = config;
      }
      ctx.persist();
    },
  };
}
