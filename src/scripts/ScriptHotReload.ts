import type { ScriptSlot } from '../components/ScriptComponent.js';
import {
  collectScripts,
  getScript,
  listScripts,
  registerScript,
  unregisterScript,
  setPathScripts,
  type ScriptCtor,
} from './ScriptRegistry.js';
import { forEachLiveScriptSlot, destroyScriptSlot } from '../systems/ScriptHostSystem.js';
import { debug } from '../core/debug.js';

/**
 * **Hot reload de um módulo de script** (SPEC-0697, ADR-0696) — chamado pelo `accept`
 * que o `createHotReloadPlugin` injeta em `scripts/*.ts`.
 *
 * Registra as classes novas (instâncias criadas depois usam o construtor novo) e troca
 * a classe das instâncias **vivas** sem recriá-las: `setPrototypeOf` para a classe nova,
 * cópia das propriedades próprias que a instância não tinha (de um `new NovaClasse()`
 * descartável), campos novos do schema com o valor do slot, `started` preservado e
 * `onHotReload()` no fim. Os scripts que este caminho registrou antes e sumiram do
 * módulo são derrubados (`onDestroy`) e saem do registro. Fora do Play só o registro
 * muda — o próximo Play instancia a classe nova.
 *
 * Um módulo sem exports devolve `true` e só derruba o que sumiu: não há nada que
 * invalide o estado, então o reload completo não ganharia nada.
 *
 * @param path Caminho do módulo relativo à raiz (`scripts/Girar.ts`).
 * @param mod O namespace novo do módulo.
 * @returns `false`, sem mudar nada, se o módulo exporta algum valor que não é
 *   `ScriptBehavior` ou se algum script dele é base de um script de outro arquivo — o
 *   plugin então faz o reload completo.
 */
export function hotReplaceScripts(path: string, mod: unknown): boolean {
  const { scripts, foreign } = collectScripts(path, mod);
  if (foreign) return false;
  const next = new Map(scripts.map((s) => [s.name, s.ctor]));
  // Base de um script de outro arquivo: o vite para a propagação aqui (módulo
  // self-accepting) e a derivada seguiria herdando a base velha. `false` → invalidate →
  // o glob do main.ts importa todo script, então vira reload completo.
  if ([...next.keys()].some((name) => isBaseOfOtherScript(name, next))) return false;
  const gone = new Set(setPathScripts(path, [...next.keys()]).filter((n) => !next.has(n)));
  for (const [name, ctor] of next) registerScript(name, ctor);
  forEachLiveScriptSlot((slot) => {
    if (!slot.instance) return;
    const Next = next.get(slot.type);
    if (Next) swapInstance(slot, Next);
    else if (gone.has(slot.type)) destroyScriptSlot(slot);
  });
  for (const name of gone) unregisterScript(name);
  return true;
}

/** A classe registrada hoje sob `name` está na cadeia de um script que não é deste módulo. */
function isBaseOfOtherScript(name: string, own: Map<string, ScriptCtor>): boolean {
  const old = getScript(name);
  if (!old) return false;
  return listScripts().some((other) => !own.has(other) && old.prototype.isPrototypeOf(getScript(other)!.prototype));
}

/** Troca a classe da instância viva do slot preservando identidade e estado. */
function swapInstance(slot: ScriptSlot, Next: ScriptCtor): void {
  const inst = slot.instance as unknown as Record<string, unknown>;
  const hadBefore = (key: string): boolean => Object.prototype.hasOwnProperty.call(inst, key);
  // Campos do schema que a instância ainda não tinha — decididos ANTES da cópia abaixo.
  const newFields = Object.entries(Next.fields ?? {}).filter(([name]) => !hadBefore(name));
  Object.setPrototypeOf(inst, Next.prototype);
  try {
    const fresh = new Next() as unknown as Record<string, unknown>;
    for (const key of Object.keys(fresh)) if (!hadBefore(key)) inst[key] = fresh[key];
  } catch (err) {
    debug('script', 'construtor novo falhou no hot reload de', slot.type, err);
  }
  // Mesma regra do applyScriptFields: override do slot, senão o default do schema.
  for (const [name, def] of newFields) inst[name] = slot.fields[name] !== undefined ? slot.fields[name] : def.default;
  try {
    slot.instance?.onHotReload?.();
  } catch (err) {
    debug('script', 'onHotReload falhou em', slot.type, err);
  }
}
