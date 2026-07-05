// Bundle do boot do host: js/src/main.js (+ three/webgpu) → um único IIFE
// que o hermesc compila pra bytecode. Pipeline em 2 passos:
//   1. esbuild: bundle + rebaixa class fields e ARROWS (o Hermes aceita
//      `async function` mas não async arrow) — target es2018.
//   2. babel plugin-transform-classes: remove a sintaxe `class` inteira
//      (o runtime Hermes da Microsoft não tem classes — mesmo motivo pelo
//      qual o React Native transpila classes com Babel).
// Uso: node native/scripts/bundle.mjs <outfile> [gameMainTs]
//   sem gameMainTs → bundla o smoke (js/src/main.js)
//   com gameMainTs → bundla um JOGO REAL (ex.: D:/jogos/teste4/main.ts):
//     resolve 'cortex-game-engine' pro SRC do engine (esbuild compila TS),
//     expande import.meta.glob (recurso do vite) e embrulha o top-level
//     await do main.ts (iife não aceita TLA).
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Só o import BARE 'three' (dos addons/loaders) vai pro build WebGPU —
// alias do esbuild não serve porque reescreve subpaths ('three/webgpu'
// viraria 'three/webgpu/webgpu').
const threeWebGpuAlias = {
  name: 'three-webgpu-alias',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^three$/ }, () => ({
      path: resolve('node_modules/three/build/three.webgpu.js'),
    }));
    // Rapier: no host o WASM-compat é substituído pelo adaptador nativo.
    pluginBuild.onResolve({ filter: /^@dimforge\/rapier3d-compat$/ }, () => ({
      path: resolve('native/js/src/shims/rapier-compat.js'),
    }));
  },
};

const outfile = process.argv[2];
const gameMain = process.argv[3] ? resolve(process.argv[3]) : null;
if (!outfile) {
  console.error('uso: node bundle.mjs <outfile> [gameMainTs]');
  process.exit(1);
}

// Plugin de JOGO: aliases + transforms específicos do main.ts do jogo.
const gamePlugin = {
  name: 'cortex-game',
  setup(pluginBuild) {
    if (!gameMain) return;
    pluginBuild.onResolve({ filter: /^cortex-game-main$/ }, () => ({
      path: gameMain,
    }));
    // O jogo importa 'cortex-game-engine' (vendor); no host, resolve pro
    // SRC do engine — esbuild compila o TypeScript direto.
    pluginBuild.onResolve({ filter: /^cortex-game-engine$/ }, () => ({
      path: resolve('src/index-runtime.ts'),
    }));
    // zod v4 quebra no Hermes e no host a validação é passthrough (o JSON
    // já foi validado no Studio) — ver zod-lite.js.
    pluginBuild.onResolve({ filter: /^zod(\/.*)?$/ }, () => ({
      path: resolve('native/js/src/shims/zod-lite.js'),
    }));

    // Transforma o main.ts do jogo: expande import.meta.glob e embrulha o
    // corpo (após os imports) num async IIFE — iife não aceita TLA.
    pluginBuild.onLoad(
      { filter: /main\.ts$/ },
      async (args) => {
        if (resolve(args.path) !== gameMain) return undefined;
        let source = await readFile(args.path, 'utf8');
        const extraImports = [];

        // import.meta.glob('./scripts/*.ts', { eager: true }) → objeto de
        // imports estáticos (só o padrão usado pelo template do engine).
        const globRegex =
          /import\.meta\.glob\(\s*['"]\.\/scripts\/\*\.ts['"][^)]*\)/g;
        if (globRegex.test(source)) {
          const scriptsDir = resolve(dirname(args.path), 'scripts');
          const files = (await readdir(scriptsDir)).filter((f) =>
            f.endsWith('.ts'),
          );
          const entries = files.map((file, i) => {
            const name = `__cortexGlob${i}`;
            extraImports.push(
              `import * as ${name} from './scripts/${file.replace(/\.ts$/, '.js')}';`,
            );
            return `'./scripts/${file}': ${name}`;
          });
          source = source.replace(globRegex, `{ ${entries.join(', ')} }`);
        }

        // Divide imports (ficam no topo) do corpo (vira async IIFE).
        const lines = source.split('\n');
        let lastImport = -1;
        for (let i = 0; i < lines.length; i++) {
          if (/^import[\s{]/.test(lines[i])) lastImport = i;
        }
        const header = lines.slice(0, lastImport + 1).join('\n');
        const body = lines.slice(lastImport + 1).join('\n');
        const wrapped = `${header}\n${extraImports.join('\n')}\n` +
          `(async () => {\n${body}\n})().catch((e) => ` +
          `print('[game] ERRO no boot: ' + e + '\\n' + (e && e.stack ? e.stack : '')));\n`;
        return { contents: wrapped, loader: 'ts' };
      },
    );
  },
};

await build({
  entryPoints: [gameMain ? 'native/js/src/game-entry.js' : 'native/js/src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2018',
  plugins: [threeWebGpuAlias, gamePlugin],
  outfile,
  define: {
    'process.env.NODE_ENV': '"production"',
    // O engine usa import.meta.env (vite); no host não há env do vite.
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env': '{}',
    // Atalho de fase pro teste no host (CORTEX_LEVEL=fase-1 no ambiente).
    '__CORTEX_LEVEL': JSON.stringify(process.env.CORTEX_LEVEL || ''),
  },
});

const bundled = await readFile(outfile, 'utf8');
const result = await transformAsync(bundled, {
  // Classes E arrows no MESMO passe do Babel: se o esbuild rebaixar arrows
  // antes, ele iça `var _this = this` pro topo de constructors de subclasse
  // e o transform de classes acusa `this` antes do super(). loose: herança
  // por protótipo direto, sem Reflect.construct (modo spec quebra no Hermes).
  // Arrows precisam ser rebaixadas porque o Hermes não tem async arrow.
  plugins: [
    ['@babel/plugin-transform-classes', { loose: true }],
    '@babel/plugin-transform-arrow-functions',
  ],
  compact: true,
  babelrc: false,
  configFile: false,
});
await writeFile(outfile, result.code);
console.log(`bundle ok (classes transpiladas): ${outfile}`);
