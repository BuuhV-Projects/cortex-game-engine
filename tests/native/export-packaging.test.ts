/**
 * Contrato de EMPACOTAMENTO do export nativo no Studio Windows (TDR-0003).
 *
 * O export re-bundla o jogo NA MÁQUINA DO USUÁRIO (bundle.mjs roda esbuild+
 * babel puxando three, o src/ da engine e os shims) e cozinha os assets
 * (cook-assets.mjs → gltf-transform + encoder basis). Pra isso funcionar no
 * `.exe` instalado — e não só em dev — o electron-builder tem que embarcar
 * um layout mínimo em `resources/`, e o toolchain auto-contido tem que pinar
 * TODA dep bare do GRAFO de imports do export, não só as do bundle.mjs.
 *
 * Estes testes travam esse contrato: se alguém adicionar um `import` novo em
 * qualquer script do export, ou remover uma entrada do win.extraResources, o
 * export quebraria NO USUÁRIO (não no dev) — aqui quebra no CI, que é onde
 * deve. Foi exatamente o furo do `@gltf-transform/core` (SPEC-0177): o teste
 * olhava só o bundle.mjs e o cook passou por baixo.
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
    'native/tools/basis-encoder', // encoder WASM do cook KTX2 (SPEC-0177)
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

  it('o filtro do basis-encoder inclui o glue e o wasm', () => {
    const enc = builder.win.extraResources.find(
      (r: { from: string }) => r.from.replace(/\\/g, '/') === 'native/tools/basis-encoder',
    );
    expect(enc.filter).toEqual(expect.arrayContaining(['basis_encoder.js', 'basis_encoder.wasm']));
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

  /** Todo specifier importado por um arquivo — `import … from 'x'` e `import('x')`. */
  function importsOf(src: string): string[] {
    const specs: string[] = [];
    const statics = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const dynamics = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const re of [statics, dynamics]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) specs.push(m[1]);
    }
    return specs;
  }

  /** Pacote raiz de um specifier bare: `@scope/name/sub` → `@scope/name`. */
  function packageRoot(spec: string): string {
    return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  }

  /**
   * Fecho transitivo dos imports BARE a partir de um entrypoint, seguindo os
   * imports RELATIVOS (os scripts do export se chamam entre si: export-game →
   * pak/cook-assets/fs-clean/… → ktx2-glb → encode-ktx2). É o conjunto que
   * precisa existir em `resources/node_modules` na máquina do usuário.
   */
  function walkExportGraph(entries: string[]): { bare: string[]; missing: string[] } {
    const bare = new Set<string>();
    const missing = new Set<string>();
    const seen = new Set<string>();
    const queue = entries.map((e) => e.replace(/\\/g, '/'));
    while (queue.length > 0) {
      const rel = queue.shift() as string;
      if (seen.has(rel)) continue;
      seen.add(rel);
      for (const spec of importsOf(read(rel))) {
        // O bundle.mjs GERA código com `import` dentro de template literal
        // (o barrel de scripts do jogo) — não é import dele, é string de saída.
        if (spec.includes('${')) continue;
        if (spec.startsWith('node:')) continue;
        if (!spec.startsWith('.')) {
          bare.add(packageRoot(spec));
          continue;
        }
        const target = path.posix.join(path.posix.dirname(rel), spec);
        if (fs.existsSync(path.join(repoRoot, target))) queue.push(target);
        else missing.add(`${rel} → ${spec}`);
      }
    }
    return { bare: [...bare], missing: [...missing] };
  }

  // Entrypoints REAIS do export: o electron/main.ts spawna o export-game.mjs, e
  // ele spawna o bundle.mjs como PROCESSO à parte (execFileSync) — por não ser
  // um import, o bundle não entra no fecho do primeiro; entra como raiz própria.
  const graph = walkExportGraph(['native/scripts/export-game.mjs', 'native/scripts/bundle.mjs']);

  it('o grafo do export alcança esbuild, @babel/core e o gltf-transform', () => {
    expect(graph.bare).toEqual(
      expect.arrayContaining(['esbuild', '@babel/core', '@gltf-transform/core', '@gltf-transform/extensions']),
    );
  });

  it('nenhum import relativo do export aponta pra arquivo inexistente', () => {
    expect(graph.missing).toEqual([]);
  });

  it.each(graph.bare)('toolchain pina a dep de runtime do export: %s', (dep) => {
    expect(deps).toHaveProperty(dep);
  });

  // O engine (bundlado a partir do src/) importa estas em runtime; sem elas o
  // esbuild falha ao resolver DENTRO do bundle do jogo.
  it.each(['three', 'three-mesh-bvh', 'zod'])('toolchain pina a dep de runtime da engine: %s', (dep) => {
    expect(deps).toHaveProperty(dep);
  });

  // Ícone do launcher (SPEC-0127): o embed-icon.mjs resolve estas do toolchain.
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
