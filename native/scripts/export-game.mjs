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
import { fileURLToPath } from 'node:url';
import { packDir } from './pak.mjs';
import { cookAssets } from './cook-assets.mjs';

// Raiz do engine derivada do PRÓPRIO script (roda de qualquer cwd — ex.:
// spawnado pelo Studio com cwd do projeto).
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const gameDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!gameDir || !fs.existsSync(path.join(gameDir, 'main.ts'))) {
  console.error('uso: node native/scripts/export-game.mjs <gameDir com main.ts>');
  process.exit(1);
}

// Marcador de etapa legível por máquina — o Studio (main.ts) faz parse destas
// linhas pra alimentar o modal de progresso do export. As chaves batem com os
// passos exibidos: prepare → bundle → bytecode → runtime → assets → done.
const step = (key) => console.log(`[export:step] ${key}`);

const gameName = path.basename(gameDir);
const dist = path.join(gameDir, 'dist-native');
const hostBuild = path.join(engineRoot, 'native', 'build');
const hermesc = path.join(
  engineRoot, 'native', 'third_party', 'hermes', 'tools', 'native', 'release', 'x86', 'hermes.exe',
);

// Erros de arquivo TRAVADO no Windows (o jogo exportado aberto, ou o Explorer
// na pasta, segurando o exe/dll/asset). A causa nº 1 de export falho: dá uma
// mensagem CLARA e acionável em vez de um stack cru.
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);
function guardLocks(label, fn) {
  try {
    fn();
  } catch (err) {
    if (LOCK_CODES.has(err.code)) {
      console.error(
        `\n[export] FALHOU no passo "${label}": um arquivo em dist-native está ` +
          `TRAVADO (${err.code}).\n[export] O jogo exportado (${gameName}.exe) ` +
          `provavelmente está ABERTO — FECHE-O (e feche o Explorer na pasta ` +
          `dist-native) e exporte de novo.`,
      );
      process.exit(1);
    }
    throw err;
  }
}

// rmSync recursivo no Windows falha com ENOTEMPTY/EBUSY enquanto o SO ainda
// solta handles (ou o Explorer/um exe anterior segura a pasta) — maxRetries
// espera e tenta de novo. Se ainda assim falhar, não apaga a pasta inteira:
// limpa só os arquivos que vamos regravar (o exe travado por um jogo aberto
// não impede o resto).
step('prepare');
try {
  fs.rmSync(dist, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
} catch (err) {
  console.warn(`[export] não deu pra limpar dist-native (${err.code}) — sobrescrevendo`);
}
fs.mkdirSync(dist, { recursive: true });

// 1. bundle do jogo (esbuild + babel — mesmo pipeline do dev)
step('bundle');
console.log(`[export] bundle de ${gameName}...`);
const bundlePath = path.join(dist, 'boot.bundle.js');
execFileSync(
  process.execPath,
  [path.join(engineRoot, 'native', 'scripts', 'bundle.mjs'), bundlePath, path.join(gameDir, 'main.ts')],
  { stdio: 'inherit', cwd: engineRoot },
);

// 2. bytecode Hermes
step('bytecode');
console.log('[export] hermesc → boot.hbc...');
execFileSync(hermesc, ['-emit-binary', '-O', '-w', '-out', path.join(dist, 'boot.hbc'), bundlePath], {
  stdio: 'inherit',
});
fs.rmSync(bundlePath);

// 3. runtime: exe (renomeado pro jogo) + dlls + fonte
step('runtime');
console.log('[export] runtime...');
const runtimeFiles = [
  ['cortex_host.exe', `${gameName}.exe`],
  ['SDL3.dll', 'SDL3.dll'],
  ['wgpu_native.dll', 'wgpu_native.dll'],
  ['hermes.dll', 'hermes.dll'],
  ['rapier_native.dll', 'rapier_native.dll'],
  ['Roboto-Medium.ttf', 'Roboto-Medium.ttf'],
];
guardLocks('runtime', () => {
  for (const [from, to] of runtimeFiles) {
    fs.copyFileSync(path.join(hostBuild, from), path.join(dist, to));
  }
});

// 4. assets do jogo: assets/ vira um CONTAINER assets.pak (ADR-0104) — 1 arquivo
// em vez de centenas soltos, com XOR leve (barreira contra extração casual). O
// host lê dele via __cortexReadFile (files.cpp); no dev fica solto. Cenas
// (JSON) + cortex.json seguem soltos (config pequena).
step('assets');
console.log('[export] assets → assets.pak...');
const assetsDir = path.join(gameDir, 'assets');
if (fs.existsSync(assetsDir)) {
  // "Cook" (ADR-0108): converte texturas de GLB pra KTX2 numa CÓPIA (assets/
  // fonte fica PNG). Cache por hash em .cortex-cache/ — re-export só reconverte
  // o que mudou. O host lê KTX2 via transcoder C++ (não precisa de WASM).
  console.log('[export] cozinhando texturas (GLB → KTX2)...');
  const cookedDir = path.join(dist, '.cooked-assets');
  const cacheDir = path.join(gameDir, '.cortex-cache', 'ktx2');
  const cs = await cookAssets(assetsDir, cookedDir, cacheDir);
  console.log(
    `[export] cook: ${cs.glbConverted} GLB convertidos (+${cs.glbCached} do cache, ${cs.glbNoTex} sem textura) · ` +
      `assets ${(cs.before / 1e6).toFixed(1)} → ${(cs.after / 1e6).toFixed(1)} MB`,
  );
  guardLocks('assets', () => {
    const r = packDir(cookedDir, path.join(dist, 'assets.pak'), 'assets/');
    console.log(`[export] assets.pak: ${r.files} arquivos, ${(r.bytes / 1e6).toFixed(1)} MB`);
  });
  fs.rmSync(cookedDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
guardLocks('assets', () => {
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
});

step('done');
const files = fs.readdirSync(dist);
console.log(`[export] OK → ${dist} (${files.length} itens na raiz)`);
console.log(`[export] rode: ${path.join(dist, `${gameName}.exe`)}`);
