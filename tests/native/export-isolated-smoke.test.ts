/**
 * Smoke do export numa árvore ISOLADA — o teste que reproduz o Studio
 * instalado (SPEC-0177).
 *
 * Por que RODAR o bundle em vez de só olhar o código: as deps do export
 * chegam por três caminhos diferentes e a análise estática só enxerga o
 * primeiro —
 *   1. `import` nos scripts (ex.: `@gltf-transform/core` no cook);
 *   2. `import` bare DENTRO do src/ da engine, resolvido pelo esbuild
 *      (three, three-mesh-bvh, zod);
 *   3. NOME em string, resolvido em runtime pelo Babel
 *      (`@babel/plugin-transform-block-scoping`) ou por `require.resolve`.
 * Os furos (2) e (3) já quebraram o export do usuário depois de o teste
 * estático passar verde. Aqui o pipeline roda de verdade contra um layout
 * igual ao `resources/` do `.exe`: `native/scripts` + `native/js` + `src`
 * copiados e UM ÚNICO `node_modules` — o do toolchain auto-contido. Se
 * faltar qualquer dep, por qualquer caminho, o bundle falha aqui.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const toolchainModules = path.join(repoRoot, 'native', 'export-toolchain', 'node_modules');

// O toolchain tem node_modules PRÓPRIO (não é workspace): quem clonou e não
// rodou `yarn install` lá não consegue rodar este smoke. Local isso PULA; no
// CI é erro — lá o step de install existe, e um smoke que some sem avisar é
// pior que smoke nenhum (foi assim que dois furos chegaram no usuário).
const hasToolchain = fs.existsSync(toolchainModules);
if (!hasToolchain && process.env.CI) {
  throw new Error(
    'native/export-toolchain/node_modules ausente no CI — o step "Install export toolchain" ' +
      'precisa rodar antes do yarn test (TDR-0003/SPEC-0177)',
  );
}

/**
 * Fixture de jogo mínima: puxa o índice inteiro da engine pro bundle e
 * carrega uma SONDA de block-scoping — closure dentro de `for (let …)`, o
 * padrão que o Hermes executa errado sem o transform (ADR-0146). O nome é
 * único de propósito: o assert procura por ele no bundle de saída.
 */
const GAME_MAIN = [
  "import * as cortex from 'cortex-game-engine';",
  'const cortexProbes: Array<() => number> = [];',
  'for (let cortexProbeIndex = 0; cortexProbeIndex < 3; cortexProbeIndex++) {',
  '  cortexProbes.push(() => cortexProbeIndex);',
  '}',
  "print('exports: ' + Object.keys(cortex).length + cortexProbes.length);",
  '',
].join('\n');

let iso = '';
let bundleOut = '';

/** Monta em tmp o layout que o electron-builder produz em `resources/`. */
function buildIsolatedResources(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-export-iso-'));
  for (const rel of ['native/scripts', 'native/js', 'src']) {
    fs.cpSync(path.join(repoRoot, rel), path.join(dir, rel), { recursive: true });
  }
  // A ÚNICA árvore de módulos visível — é o que o instalador copia pra
  // resources/node_modules. Link (não cópia) porque são centenas de MB.
  fs.symlinkSync(toolchainModules, path.join(dir, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(dir, 'game'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'game', 'main.ts'), GAME_MAIN);
  return dir;
}

describe.runIf(hasToolchain)('export isolado (layout do Studio instalado)', () => {
  beforeAll(() => {
    iso = buildIsolatedResources();
    bundleOut = path.join(iso, 'boot.bundle.js');
  });

  afterAll(() => {
    if (iso) fs.rmSync(iso, { recursive: true, force: true });
  });

  it('bundle.mjs roda só com o toolchain (esbuild + engine + plugins do Babel)', () => {
    // cwd fora do repo: é o que o Studio faz (cwd = resources). Qualquer dep
    // que hoje resolva "por sorte" no node_modules do repo falha aqui.
    execFileSync(process.execPath, [path.join(iso, 'native', 'scripts', 'bundle.mjs'), bundleOut, path.join(iso, 'game', 'main.ts')], {
      cwd: iso,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    expect(fs.existsSync(bundleOut)).toBe(true);
    expect(fs.statSync(bundleOut).size).toBeGreaterThan(0);
  }, 300_000);

  it('a sonda `for (let …)` sai transpilada — block-scoping rodou (ADR-0146)', () => {
    const code = fs.readFileSync(bundleOut, 'utf8');
    // Sem o plugin, o Babel nem chega aqui (falha ao resolver o nome). Mas se
    // um dia ele SAIR da lista do bundle.mjs, o bundle sai com `let` e o jogo
    // quebra silenciosamente no Hermes — este assert é o que pega isso.
    expect(code).not.toMatch(/let cortexProbeIndex/);
    expect(code).toMatch(/var cortexProbeIndex/);
  });

  it('os scripts do export importam sem ERR_MODULE_NOT_FOUND nesse layout', () => {
    const entry = path.join(iso, 'native', 'scripts', 'export-game.mjs').replace(/\\/g, '/');
    // Sem argumentos o export-game imprime o "uso:" e sai 1 — o que importa é
    // que TODO o grafo de imports (pak, cook-assets, embed-icon, …) resolveu
    // antes disso.
    const run = (): string => {
      try {
        return execFileSync(process.execPath, ['--input-type=module', '-e', `await import('file:///${entry}')`], {
          cwd: iso,
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        return `${e.stdout ?? ''}${e.stderr ?? ''}`;
      }
    };
    const output = run();
    expect(output).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find package/);
    expect(output).toMatch(/uso: node .*export-game\.mjs/);
  }, 120_000);
});
