import type { Object3D } from 'three';
import { ScriptComponent, type ScriptDecl } from '../../components/ScriptComponent.js';
import { listScripts, getScriptFields } from '../../scripts/ScriptRegistry.js';
import type { ScriptApi } from '../EditorInspector.js';
import type { EditorAuthoringContext } from './AuthoringContext.js';

/**
 * Autoria de **scripts anexados** (estilo MonoBehaviour — ADR-0085). Adiciona/remove
 * componentes Script no objeto selecionado e edita seus campos. Tudo **ao vivo** (muta a
 * instância em execução, regra absoluta de tempo real) e persiste em
 * `overlay.data.scripts[id]`; o `buildScene` reanexa no reload (overlay vence).
 */
export function createScriptApi(ctx: EditorAuthoringContext): ScriptApi {
  const decls = (): Record<string, ScriptDecl[]> => ctx.record<ScriptDecl[]>('scripts');

  /** ScriptComponent vivo cujo `object` é este nó, ou `null`. */
  const findComp = (obj: Object3D): ScriptComponent | null => {
    for (const e of ctx.game.world.query(ScriptComponent)) {
      const c = e.getComponent(ScriptComponent);
      if (c && c.object === obj) return c;
    }
    return null;
  };
  /** Acha o ScriptComponent do nó ou cria uma entidade nova com um vazio. */
  const ensureComp = (obj: Object3D): ScriptComponent => {
    const found = findComp(obj);
    if (found) return found;
    const c = new ScriptComponent(obj, []);
    ctx.game.world.createEntity().addComponent(c);
    return c;
  };
  const save = (obj: Object3D, comp: ScriptComponent): void => {
    if (!obj.name) return;
    decls()[obj.name] = comp.scripts.map((s) => ({ type: s.type, fields: { ...s.fields } }));
    ctx.persist();
  };

  return {
    get: (obj) => ({
      available: listScripts(),
      scripts: (findComp(obj)?.scripts ?? []).map((slot) => {
        const schema = getScriptFields(slot.type);
        return {
          type: slot.type,
          fields: Object.entries(schema).map(([name, def]) => ({
            name,
            type: def.type,
            label: def.label ?? name,
            value: slot.fields[name] !== undefined ? slot.fields[name] : def.default,
            ...(def.options ? { options: def.options } : {}),
          })),
        };
      }),
    }),
    addScript: (obj, type) => {
      const comp = ensureComp(obj);
      comp.scripts.push({ type, fields: {}, instance: null, started: false });
      save(obj, comp);
    },
    removeScript: (obj, index) => {
      const comp = findComp(obj);
      const slot = comp?.scripts[index];
      if (!comp || !slot) return;
      slot.instance?.onDestroy?.();
      comp.scripts.splice(index, 1);
      save(obj, comp);
    },
    setField: (obj, index, name, value) => {
      const comp = findComp(obj);
      const slot = comp?.scripts[index];
      if (!comp || !slot) return;
      slot.fields[name] = value;
      // tempo real: aplica na instância já rodando (se já foi instanciada no Play)
      if (slot.instance) (slot.instance as unknown as Record<string, unknown>)[name] = value;
      save(obj, comp);
    },
  };
}
