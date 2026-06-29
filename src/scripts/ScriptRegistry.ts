import type { ScriptBehavior, ScriptFieldSchema } from './ScriptBehavior.js';

/** Construtor de um {@link ScriptBehavior} (sem args — o host injeta as deps depois). */
export type ScriptCtor = (new () => ScriptBehavior) & { fields?: ScriptFieldSchema };

/**
 * **Registro global de scripts** (ADR-0085). O jogo registra suas classes no boot
 * (`registerScript('PlayerController', PlayerController)`); o {@link ScriptHostSystem} as
 * instancia por nome e o Inspector lista os nomes em "Adicionar Componente → Script".
 *
 * Singleton de módulo (igual ao registro de tipos da Unity) — sem isso, anexar um script
 * por dado não acharia a classe.
 */
const registry = new Map<string, ScriptCtor>();

/** Registra (ou substitui) uma classe de script sob um nome. */
export function registerScript(name: string, ctor: ScriptCtor): void {
  registry.set(name, ctor);
}

/** Construtor registrado sob `name`, ou `undefined`. */
export function getScript(name: string): ScriptCtor | undefined {
  return registry.get(name);
}

/** Nomes registrados (ordenados) — pro dropdown do Inspector. */
export function listScripts(): string[] {
  return [...registry.keys()].sort();
}

/** Schema de campos (`static fields`) de um script registrado, ou `{}`. */
export function getScriptFields(name: string): ScriptFieldSchema {
  return registry.get(name)?.fields ?? {};
}

/** Esvazia o registro (testes). */
export function clearScripts(): void {
  registry.clear();
}
