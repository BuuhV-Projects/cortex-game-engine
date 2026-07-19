/**
 * Contrato de EMPACOTAMENTO do export nativo no Studio Windows (TDR-0003).
 *
 * O export re-bundla o jogo NA MÁQUINA DO USUÁRIO (bundle.mjs roda esbuild+
 * babel puxando three, o src/ da engine e os shims). Pra isso funcionar no
 * `.exe` instalado — e não só em dev — o electron-builder tem que embarcar
 * um layout mínimo em `resources/`, e o toolchain auto-contido tem que pinar
 * TODA dep bare que o bundle.mjs importa.
 *
 * Estes testes travam esse contrato: se alguém adicionar um `import` novo no
 * bundle.mjs, ou remover uma entrada do win.extraResources, o export quebraria
 * NO USUÁRIO (não no dev) — aqui quebra no CI, que é onde deve.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const readJson = (rel: string): any => JSON.parse(read(rel));

describe('export nativo — win.extraResources (TDR-0003)', () => {
  const builder = readJson('electron-builder.json');
  const froms: string[] = (builder.win?.extraResources ?? []).map(
    (r: { from: string }) => r.from.replace(/\\/g, '/'),
  );

  // O que o export-game.mjs/bundle.mjs esperam em resources/ (= resourceBase).
  const required = [
    'native/build', // host compilado (exe + dlls + fonte)
    'native/scripts', // export-game.mjs, bundle.mjs, pak.mjs
    'native/js', // shims (prelude, rapier-compat, game-entry)
    'native/third_party/hermes/tools/native/release/x86', // hermesc
    'src', // bundle.mjs resolve cortex-game-engine → src/index-runtime.ts
    'native/export-toolchain/node_modules', // esbuild/babel/three em runtime
  ];

  it.each(required)('embarca %s', (from) => {
    expect(froms).toContain(from);
  });

  it('mapeia o toolchain pra resources/node_modules (resolução de módulo)', () => {
    const tc = builder.win.extraResources.find(
      (r: { from: string }) => r.from.replace(/\\/g, '/') === 'native/export-toolchain/node_modules',
    );
    expect(tc.to).toBe('node_modules');
  });

  it('o filtro de native/build inclui exe, dlls e a fonte', () => {
    const b = builder.win.extraResources.find(
      (r: { from: string }) => r.from.replace(/\\/g, '/') === 'native/build',
    );
    expect(b.filter).toEqual(expect.arrayContaining(['cortex_host.exe', '*.dll', 'Roboto-Medium.ttf']));
  });
});

describe('export nativo — toolchain auto-contido (TDR-0003)', () => {
  const toolchain = readJson('native/export-toolchain/package.json');
  const deps: Record<string, string> = toolchain.dependencies ?? {};

  // Extrai os imports BARE (não relativos, não node:) do bundle.mjs — é o que
  // precisa existir no node_modules embarcado em runtime.
  function bareImports(src: string): string[] {
    const found = new Set<string>();
    const re = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('node:')) continue;
      // pacote raiz do specifier (@scope/name ou name)
      const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      found.add(root);
    }
    return [...found];
  }

  const bundleDeps = bareImports(read('native/scripts/bundle.mjs'));

  it('bundle.mjs importa pelo menos esbuild + @babel/core', () => {
    expect(bundleDeps).toEqual(expect.arrayContaining(['esbuild', '@babel/core']));
  });

  it.each(bundleDeps)('toolchain pina a dep de runtime do bundle.mjs: %s', (dep) => {
    expect(deps).toHaveProperty(dep);
  });

  // O engine (bundlado a partir do src/) importa estas em runtime; sem elas o
  // esbuild falha ao resolver DENTRO do bundle do jogo.
  it.each(['three', 'three-mesh-bvh', 'zod'])('toolchain pina a dep de runtime da engine: %s', (dep) => {
    expect(deps).toHaveProperty(dep);
  });

  // Ícone do launcher (ADR-0127): o embed-icon.mjs resolve estas do toolchain.
  it.each(['png-to-ico', 'rcedit'])('toolchain pina a dep do embed de ícone: %s', (dep) => {
    expect(deps).toHaveProperty(dep);
  });

  it('versões pinadas (sem "latest"/ranges) — determinismo no export', () => {
    for (const [name, range] of Object.entries(deps)) {
      expect(range, `${name} deve ser versão exata`).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('three e zod não divergem da versão que a engine usa (drift)', () => {
    const engine = readJson('package.json').dependencies;
    // engine usa ranges (~/^); a major.minor tem que bater com a pinada.
    const major = (v: string): string => v.replace(/^[~^]/, '').split('.')[0];
    expect(major(deps.three)).toBe(major(engine.three));
    expect(major(deps.zod)).toBe(major(engine.zod));
  });
});
