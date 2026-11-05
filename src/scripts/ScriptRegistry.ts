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
    const { scripts } = collectScripts(path, mod);
    for (const { name, ctor } of scripts) {
      registerScript(name, ctor);
      names.push(name);
    }
    setPathScripts(path, scripts.map((s) => s.name));
  }
  return names;
}

/** Scripts de um módulo + se ele exporta algo que não é script (ver {@link collectScripts}). */
export interface CollectedScripts {
  scripts: { name: string; ctor: ScriptCtor }[];
  /** O módulo exporta algum valor que não é subclasse de {@link ScriptBehavior}. */
  foreign: boolean;
}

/**
 * Lê os scripts de um módulo com a **regra de nome** do {@link registerScripts}
 * (`scriptName` > nome do arquivo > `class.name`). Compartilhada com o hot reload
 * (SPEC-0697) para os dois não divergirem. `foreign` marca qualquer export que não é
 * subclasse de {@link ScriptBehavior} (função, objeto, primitivo) — tipos não contam,
 * somem na compilação. Um módulo que não é objeto conta como estrangeiro.
 *
 * @param path Caminho do módulo (o nome do arquivo vira o nome do script).
 * @param mod O namespace do módulo (`import * as mod`).
 */
export function collectScripts(path: string, mod: unknown): CollectedScripts {
  if (!mod || typeof mod !== 'object') return { scripts: [], foreign: true };
  // Set: `export default class X` + `export { X }` é a mesma classe, registrada uma vez.
  const ctors = new Set<ScriptCtor>();
  let exportCount = 0;
  let foreign = false;
  for (const exp of Object.values(mod as Record<string, unknown>)) {
    const proto = typeof exp === 'function' ? (exp as { prototype?: unknown }).prototype : undefined;
    if (proto instanceof ScriptBehavior) {
      ctors.add(exp as unknown as ScriptCtor);
      exportCount++;
    } else foreign = true;
  }
  const fileName = path.split('/').pop()?.replace(/\.[jt]sx?$/, '') ?? '';
  const scripts: CollectedScripts['scripts'] = [];
  for (const ctor of ctors) {
    // Nome do arquivo só vale quando o arquivo tem UM export-script (regra Unity). Conta
    // exports, não classes: default + named da mesma classe segue com `class.name`, o nome
    // que as cenas salvas já persistem (ADR-0085).
    const name = ctor.scriptName ?? (exportCount === 1 ? fileName : ctor.name);
    if (name) scripts.push({ name, ctor });
  }
  return { scripts, foreign };
}

/** Nomes registrados por caminho de módulo (sem `./` nem `/` inicial). */
const pathScripts = new Map<string, string[]>();

/**
 * Grava os nomes que o módulo `path` registrou e devolve os da vez anterior — o hot
 * reload derruba os que sumiram (SPEC-0697). `./scripts/X.ts` (glob do `main.ts`) e
 * `scripts/X.ts` (plugin) são o mesmo caminho.
 */
export function setPathScripts(path: string, names: string[]): string[] {
  const key = path.replace(/^\.?\//, '');
  const previous = pathScripts.get(key) ?? [];
  pathScripts.set(key, names);
  return previous;
}

/** Tira `name` do registro (o hot reload, quando o script some do módulo). */
export function unregisterScript(name: string): void {
  registry.delete(name);
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
  pathScripts.clear();
}
