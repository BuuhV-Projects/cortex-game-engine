// Export CortexNative de um jogo (ADR-0101): gera uma pasta DISTRIBUÍVEL
// (dist-native/) com exe + dlls + fonte + boot.hbc + assets — o export PC
// oficial; no console os mesmos artefatos vão pro pacote GDK.
//
// Uso: node native/scripts/export-game.mjs <gameDir>
//   (cwd = raiz do repo do engine; requer native/build compilado e
//    rapier-native buildado — ver docs/cortex-native/architecture.md)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const engineRoot = process.cwd();
const gameDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!gameDir || !fs.existsSync(path.join(gameDir, 'main.ts'))) {
  console.error('uso: node native/scripts/export-game.mjs <gameDir com main.ts>');
  process.exit(1);
}

const gameName = path.basename(gameDir);
const dist = path.join(gameDir, 'dist-native');
const hostBuild = path.join(engineRoot, 'native', 'build');
const hermesc = path.join(
  engineRoot, 'native', 'third_party', 'hermes', 'tools', 'native', 'release', 'x86', 'hermes.exe',
);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// 1. bundle do jogo (esbuild + babel — mesmo pipeline do dev)
console.log(`[export] bundle de ${gameName}...`);
const bundlePath = path.join(dist, 'boot.bundle.js');
execFileSync(
  process.execPath,
  [path.join(engineRoot, 'native', 'scripts', 'bundle.mjs'), bundlePath, path.join(gameDir, 'main.ts')],
  { stdio: 'inherit', cwd: engineRoot },
);

// 2. bytecode Hermes
console.log('[export] hermesc → boot.hbc...');
execFileSync(hermesc, ['-emit-binary', '-O', '-w', '-out', path.join(dist, 'boot.hbc'), bundlePath], {
  stdio: 'inherit',
});
fs.rmSync(bundlePath);

// 3. runtime: exe (renomeado pro jogo) + dlls + fonte
console.log('[export] runtime...');
const runtimeFiles = [
  ['cortex_host.exe', `${gameName}.exe`],
  ['SDL3.dll', 'SDL3.dll'],
  ['wgpu_native.dll', 'wgpu_native.dll'],
  ['hermes.dll', 'hermes.dll'],
  ['rapier_native.dll', 'rapier_native.dll'],
  ['Roboto-Regular.ttf', 'Roboto-Regular.ttf'],
];
for (const [from, to] of runtimeFiles) {
  fs.copyFileSync(path.join(hostBuild, from), path.join(dist, to));
}

// 4. assets do jogo: assets/ inteiro + JSONs de cena/overlay + cortex.json
console.log('[export] assets...');
const assetsDir = path.join(gameDir, 'assets');
if (fs.existsSync(assetsDir)) {
  fs.cpSync(assetsDir, path.join(dist, 'assets'), { recursive: true });
}
const scenesDir = path.join(gameDir, 'scenes');
if (fs.existsSync(scenesDir)) {
  for (const entry of fs.readdirSync(scenesDir, { recursive: true })) {
    const rel = String(entry);
    if (!rel.endsWith('.json')) continue;
    const target = path.join(dist, 'scenes', rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(scenesDir, rel), target);
  }
}
for (const extra of ['cortex.json']) {
  const src = path.join(gameDir, extra);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, extra));
}

const files = fs.readdirSync(dist);
console.log(`[export] OK → ${dist} (${files.length} itens na raiz)`);
console.log(`[export] rode: ${path.join(dist, `${gameName}.exe`)}`);
