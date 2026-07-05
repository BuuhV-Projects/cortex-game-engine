// Bundle do boot do host: js/src/main.js (+ three/webgpu) → um único IIFE
// que o hermesc compila pra bytecode. Pipeline em 2 passos:
//   1. esbuild: bundle + rebaixa class fields e ARROWS (o Hermes aceita
//      `async function` mas não async arrow) — target es2018.
//   2. babel plugin-transform-classes: remove a sintaxe `class` inteira
//      (o runtime Hermes da Microsoft não tem classes — mesmo motivo pelo
//      qual o React Native transpila classes com Babel).
// Uso: node native/scripts/bundle.mjs <outfile>   (cwd = raiz do repo)
import { build } from 'esbuild';
import { transformAsync } from '@babel/core';
import { readFile, writeFile } from 'node:fs/promises';

const outfile = process.argv[2];
if (!outfile) {
  console.error('uso: node bundle.mjs <outfile>');
  process.exit(1);
}

await build({
  entryPoints: ['native/js/src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2018',
  outfile,
  define: { 'process.env.NODE_ENV': '"production"' },
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
