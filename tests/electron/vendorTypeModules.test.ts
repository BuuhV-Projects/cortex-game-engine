/**
 * Os `.d.ts` que o Studio copia para o `vendor/` (e carrega no Monaco) são os do `VENDOR_TYPE_MODULES`
 * (`electron/main/vendorTypeModules.ts`). Um `import`/`export … from` relativo num deles que aponte para um módulo FORA da lista
 * vira tipo não resolvido no editor do jogo (SPEC-0688).
 *
 * O teste emite as declarações em memória com a API do TypeScript (sem depender de `dist/`) e confere cada
 * referência relativa dos módulos da lista.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
/** Emitir as declarações de ~150 módulos leva poucos segundos; folga para máquina de CI lenta. */
const EMIT_TIMEOUT_MS = 120_000;

/**
 * Referências quebradas que JÁ existiam na `main` antes da SPEC-0688. Corrigi-las exige pôr os módulos na lista,
 * que mora em `electron/main/vendorTypeModules.ts`. Fica explícito aqui para nenhuma
 * nova entrar sem aviso; quando uma for corrigida, o teste pede para tirá-la daqui.
 */
const KNOWN_BROKEN = new Set([
  'core/Game -> ./FrameProfiler.js',
  'core/PerfTrace -> ./FrameProfiler.js',
  'core/PerfTrace -> ./RenderPhaseProbe.js',
  'scene/SceneDefinition -> ./scenes/ilha.json',
  'ui/DebugHud -> ../core/FrameProfiler.js',
]);

/** Lê o objeto literal `VENDOR_TYPE_MODULES` de `electron/main/vendorTypeModules.ts` e devolve `subdir/Modulo`. */
function vendorTypeModules(): string[] {
  const main = readFileSync(join(ROOT, 'electron/main/vendorTypeModules.ts'), 'utf8');
  const start = main.indexOf('export const VENDOR_TYPE_MODULES = {');
  expect(start).toBeGreaterThanOrEqual(0);
  const open = main.indexOf('{', start);
  const close = main.indexOf('\n}', open);
  const literal = main.slice(open, close + 2);
  const list = Function(`return (${literal})`)() as Record<string, string[]>;
  return Object.entries(list).flatMap(([subdir, modules]) => modules.map((m) => `${subdir}/${m}`));
}

/** Declarações emitidas, por `subdir/Modulo`. */
function emitDeclarations(modules: string[]): Map<string, string> {
  const srcDir = join(ROOT, 'src');
  const program = ts.createProgram(
    modules.map((m) => join(srcDir, `${m}.ts`)),
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      declaration: true,
      emitDeclarationOnly: true,
      noCheck: true,
      rootDir: srcDir,
      outDir: join(ROOT, '.vendor-dts-check'),
    },
  );
  const out = new Map<string, string>();
  const outDir = join(ROOT, '.vendor-dts-check').replace(/\\/g, '/');
  program.emit(undefined, (file, text) => {
    const path = file.replace(/\\/g, '/');
    if (path.endsWith('.d.ts') && path.startsWith(`${outDir}/`)) out.set(path.slice(outDir.length + 1, -'.d.ts'.length), text);
  });
  return out;
}

/** `import … from './x.js'`, `export … from './x.js'` e `import('./x.js')` relativos de uma declaração. */
function relativeReferences(text: string): string[] {
  const refs: string[] = [];
  for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    refs.push((m[1] ?? m[2])!);
  }
  return refs;
}

describe('VENDOR_TYPE_MODULES', () => {
  it(
    'todo import relativo dos .d.ts vendorizados aponta para outro módulo da lista',
    () => {
      const modules = vendorTypeModules();
      const listed = new Set(modules);
      const declarations = emitDeclarations(modules);
      const broken: string[] = [];
      for (const mod of modules) {
        const text = declarations.get(mod);
        if (text === undefined) {
          broken.push(`${mod}: .d.ts não emitido`);
          continue;
        }
        for (const ref of relativeReferences(text)) {
          const target = posix.normalize(posix.join(posix.dirname(mod), ref)).replace(/\.js$/, '');
          if (!listed.has(target)) broken.push(`${mod} -> ${ref}`);
        }
      }
      const unique = [...new Set(broken)];
      expect(unique.filter((b) => !KNOWN_BROKEN.has(b))).toEqual([]);
      // Corrigida uma das antigas, tire-a de KNOWN_BROKEN.
      expect([...KNOWN_BROKEN].filter((b) => !unique.includes(b))).toEqual([]);
    },
    EMIT_TIMEOUT_MS,
  );

  it('o PerfTrace.d.ts não importa os módulos internos de core/perfTrace (SPEC-0688)', () => {
    const text = emitDeclarations(['core/PerfTrace']).get('core/PerfTrace') ?? '';
    expect(text).toContain('export interface PerfSample');
    expect(relativeReferences(text).filter((r) => r.includes('perfTrace/'))).toEqual([]);
  }, EMIT_TIMEOUT_MS);
});
