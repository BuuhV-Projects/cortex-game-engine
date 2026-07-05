import { ScriptBehavior, type ScriptFieldSchema } from './ScriptBehavior.js';

/** Construtor de um {@link ScriptBehavior} (sem args — o host injeta as deps depois). */
export type ScriptCtor = (new () => ScriptBehavior) & { fields?: ScriptFieldSchema; scriptName?: string };

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

/**
 * Registra em **lote** os scripts de um projeto — o par do
 * `import.meta.glob` do vite no `main.ts` do template:
 *
 * ```ts
 * registerScripts(import.meta.glob('./scripts/*.ts', { eager: true }))
 * ```
 *
 * Varre os exports de cada módulo e registra as subclasses de
 * {@link ScriptBehavior}. O nome (que o Inspector lista e a cena persiste) vem,
 * em ordem: `static scriptName` (override — ex.: nome amigável em PT) → **nome
 * do arquivo** (estilo Unity; sobrevive à minificação do build) → `class.name`
 * (só quando o arquivo tem mais de um script — aí ligue `keepNames` no build
 * ou declare `scriptName`, senão o nome some na minificação). ⚠️ Renomear o
 * arquivo (ou o `scriptName`) muda o nome persistido — cenas salvas que o
 * referenciam precisam acompanhar. Retorna os nomes registrados (debug/teste).
 */
export function registerScripts(modules: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    if (!mod || typeof mod !== 'object') continue;
    const scripts: ScriptCtor[] = [];
    for (const exp of Object.values(mod as Record<string, unknown>)) {
      if (typeof exp !== 'function') continue;
      const proto = (exp as { prototype?: unknown }).prototype;
      if (proto instanceof ScriptBehavior) scripts.push(exp as unknown as ScriptCtor);
    }
    const fileName = path.split('/').pop()?.replace(/\.[jt]sx?$/, '') ?? '';
    for (const ctor of scripts) {
      // Nome do arquivo só vale quando o arquivo tem UM script (regra Unity).
      const name = ctor.scriptName ?? (scripts.length === 1 ? fileName : ctor.name);
      if (!name) continue;
      registerScript(name, ctor);
      names.push(name);
    }
  }
  return names;
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
