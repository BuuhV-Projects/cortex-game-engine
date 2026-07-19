// Export CortexNative de um jogo (ADR-0101): gera uma pasta DISTRIBUÍVEL
// (dist-native/) com exe + dlls + fonte + boot.hbc + assets — o export PC
// oficial; no console os mesmos artefatos vão pro pacote GDK.
//
// Uso: node native/scripts/export-game.mjs <gameDir>
//   (cwd = raiz do repo do engine; requer native/build compilado e
//    rapier-native buildado — ver docs/cortex-native/architecture.md)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDir } from './pak.mjs';
import { cookAssets } from './cook-assets.mjs';
import { prepareDist } from './fs-clean.mjs';
import { whoLocks } from './who-locks.mjs';
import { readGameConfig } from './game-config.mjs';

// Raiz do engine derivada do PRÓPRIO script (roda de qualquer cwd — ex.:
// spawnado pelo Studio com cwd do projeto).
const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
// --steam: usa o host buildado com CORTEX_STEAM (native/build-steam) + inclui a
// steam_api64.dll. O app id fica BAKED no host (-DCORTEX_STEAM_APPID no build);
// o steam_appid.txt (dev/480) NÃO vai pro release.
const steam = args.includes('--steam');
// --debug: export em MODO DEBUG — o jogo mostra o HUD de métricas na tela
// (FPS/frame ms, CPU, memória, GPU — src/ui/DebugHud.ts). Vira o define
// __CORTEX_DEBUG_HUD no bundle; o runtime é o mesmo do release.
const debugHud = args.includes('--debug');
// --xbox: host GDK (native/build-gdk, CORTEX_GDK) + gera MicrosoftGame.config +
// logos (app model GDK / Gaming.Desktop.x64). O alvo de console (Scarlett) exige
// GXDK+ID@Xbox — ver architecture.md; hoje produz o pacote do app model no PC.
const gdk = args.includes('--xbox');
const gameDir = args.find((a) => !a.startsWith('--')) ? path.resolve(args.find((a) => !a.startsWith('--'))) : null;
if (!gameDir || !fs.existsSync(path.join(gameDir, 'main.ts'))) {
  console.error('uso: node native/scripts/export-game.mjs <gameDir com main.ts> [--steam|--xbox] [--debug]');
  process.exit(1);
}

// Marcador de etapa legível por máquina — o Studio (main.ts) faz parse destas
// linhas pra alimentar o modal de progresso do export. As chaves batem com os
// passos exibidos: prepare → bundle → bytecode → runtime → assets → done.
const step = (key) => console.log(`[export:step] ${key}`);

const gameName = path.basename(gameDir);
// Identidade do jogo (ADR-0126): `id` estável (saves) + `name` de exibição, do
// cortex.json com fallback pro slug. O EXE é FIXO `launcher.exe` — o "nome do
// jogo" não vira mais o nome do arquivo; ele aparece no título da janela, no
// Meus Programas (via recurso do exe, fase do ícone) e no DisplayName do console.
const game = readGameConfig(gameDir);
const EXE_NAME = 'launcher.exe';
const dist = path.join(gameDir, 'dist-native');
// Host por alvo: build-steam (CORTEX_STEAM) / build-gdk (CORTEX_GDK) / build (desktop).
const hostBuild = path.join(engineRoot, 'native', steam ? 'build-steam' : gdk ? 'build-gdk' : 'build');
if (!fs.existsSync(path.join(hostBuild, 'cortex_host.exe'))) {
  console.error(
    `[export] host não buildado em ${hostBuild}` +
      (steam ? ' — build o host com -DCORTEX_STEAM=ON primeiro (ver architecture.md).'
        : gdk ? ' — build o host com -DCORTEX_GDK=ON primeiro (ver architecture.md).' : '.'),
  );
  process.exit(1);
}
// hermesc do MESMO build do runtime embutido (ADR-0122 — o bytecode é acoplado
// à versão do VM; upstream buildado como subprojeto do host).
const hermesc = path.join(hostBuild, 'bin', 'hermesc.exe');

// Erros de arquivo TRAVADO no Windows (o jogo exportado aberto, ou o Explorer
// na pasta, segurando o exe/dll/asset). A causa nº 1 de export falho: dá uma
// mensagem CLARA e acionável em vez de um stack cru — e, quando dá, pergunta ao
// Windows QUEM segura a pasta (nome + PID) em vez de só chutar o jogo.
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);
function guardLocks(label, fn) {
  try {
    fn();
  } catch (err) {
    if (LOCK_CODES.has(err.code)) {
      console.error(
        `\n[export] FALHOU no passo "${label}": um arquivo em dist-native está TRAVADO (${err.code}).`,
      );
      // Quem, de fato, segura a pasta/arquivo (Restart Manager — best-effort).
      const targets = [...new Set([dist, err.path].filter(Boolean))];
      const holders = whoLocks(targets);
      if (holders.length) {
        console.error('[export] Processos segurando dist-native:');
        for (const h of holders) console.error(`  • ${h.name} (PID ${h.pid}) — ${h.kind}`);
        console.error(
          '[export] Feche esses processos (ou encerre o PID no Gerenciador de Tarefas) e exporte de novo.',
        );
      } else {
        console.error(
          `[export] Não identifiquei o processo (pode ser antivírus ou o indexador do Windows). ` +
            `Confira se o jogo exportado (${EXE_NAME}) está aberto, feche o Explorer/terminal na ` +
            `pasta dist-native, aguarde alguns segundos e exporte de novo.`,
        );
      }
      process.exit(1);
    }
    throw err;
  }
}

// Esvazia dist-native sem apagar a própria pasta (evita o delete-pending do
// Windows) — ver fs-clean.mjs. Um arquivo TRAVADO (o jogo exportado aberto)
// propaga o lock, e o guardLocks o traduz na mensagem acionável.
step('prepare');
guardLocks('limpar dist-native', () => prepareDist(dist));

// 1. bundle do jogo (esbuild + babel — mesmo pipeline do dev)
step('bundle');
console.log(`[export] bundle de ${gameName}...`);
const bundlePath = path.join(dist, 'boot.bundle.js');
execFileSync(
  process.execPath,
  [path.join(engineRoot, 'native', 'scripts', 'bundle.mjs'), bundlePath, path.join(gameDir, 'main.ts')],
  {
    stdio: 'inherit',
    cwd: engineRoot,
    env: { ...process.env, ...(debugHud ? { CORTEX_DEBUG_HUD: '1' } : {}) },
  },
);
if (debugHud) console.log('[export] modo DEBUG: HUD de métricas ligado no bundle');

// 2. bytecode Hermes
step('bytecode');
console.log('[export] hermesc → boot.hbc...');
execFileSync(hermesc, ['-emit-binary', '-O', '-w', '-out', path.join(dist, 'boot.hbc'), bundlePath], {
  stdio: 'inherit',
});
fs.rmSync(bundlePath);

// 3. runtime: exe (renomeado pro jogo) + dlls + fonte
step('runtime');
console.log(
  `[export] runtime...${steam ? ' (modo Steam)' : ''} — ${EXE_NAME} · ` +
    `"${game.name}" (id: ${game.id})`,
);
const runtimeFiles = [
  ['cortex_host.exe', EXE_NAME],
  ['SDL3.dll', 'SDL3.dll'],
  ['wgpu_native.dll', 'wgpu_native.dll'],
  // (sem hermes.dll — o runtime upstream é estático no exe, ADR-0122)
  ['rapier_native.dll', 'rapier_native.dll'],
  ['Roboto-Medium.ttf', 'Roboto-Medium.ttf'],
];
// Modo Steam: a steam_api64.dll fica ao lado do exe. O app id está BAKED no host
// (build) — o steam_appid.txt (dev/480) NÃO vai pro release (a Steam informa o id).
if (steam) runtimeFiles.push(['steam_api64.dll', 'steam_api64.dll']);
guardLocks('runtime', () => {
  for (const [from, to] of runtimeFiles) {
    fs.copyFileSync(path.join(hostBuild, from), path.join(dist, to));
  }
});

// Modo Xbox/GDK: gera o MicrosoftGame.config + logos (app model GDK). Registrar
// p/ rodar: `wdapp register <dist>\MicrosoftGame.config` (Modo Dev). Alvo de
// console (Scarlett) exige GXDK+ID@Xbox (recompilar) — ver architecture.md.
if (gdk) {
  const { writeGdkPackageFiles } = await import('./gdk-package.mjs');
  writeGdkPackageFiles(dist, game.name, EXE_NAME);
  console.log('[export] MicrosoftGame.config + logos (GDK) gerados');
}

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
  // Cozinha FORA do dist-native, num temp do SO único por processo. Se o
  // dist-native estiver travado (Explorer aberto, exe de um export anterior,
  // antivírus indexando), o `prepare` só consegue sobrescrever — deixando um
  // `.cooked-assets` velho e travado lá dentro que fazia o mkdir das subpastas
  // do cook estourar EPERM. Em %TEMP% não há essa disputa; só o pak final entra
  // no dist (via guardLocks). Único por PID: cada export é um processo novo.
  const cookedDir = path.join(os.tmpdir(), `cortex-cook-${process.pid}`);
  fs.rmSync(cookedDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const cacheDir = path.join(gameDir, '.cortex-cache', 'ktx2');
  // Progresso por arquivo pro modal do Studio (marcador parseado no main.ts).
  // Throttle: 1 a cada 3 (+ o último) pra não floodar o stdout com centenas.
  const cs = await cookAssets(assetsDir, cookedDir, cacheDir, (done, total) => {
    if (done === total || done % 3 === 0) console.log(`[export:cook] ${done}/${total}`);
  });
  console.log(
    `[export] cook: ${cs.glbConverted} GLB convertidos (+${cs.glbCached} do cache, ${cs.glbNoTex} sem textura) · ` +
      `assets ${(cs.before / 1e6).toFixed(1)} → ${(cs.after / 1e6).toFixed(1)} MB`,
  );
  guardLocks('assets', () => {
    const r = packDir(cookedDir, path.join(dist, 'assets.pak'), 'assets/');
    console.log(`[export] assets.pak: ${r.files} arquivos, ${(r.bytes / 1e6).toFixed(1)} MB`);
  });
  // Limpeza do temp é BEST-EFFORT: no Windows um antivírus/handle pode segurar um
  // arquivo (EPERM/EBUSY) logo após gravar. Não é fatal — o pak já foi gerado. Um
  // eventual resíduo em %TEMP%\cortex-cook-* é do SO limpar. Só avisa.
  try {
    fs.rmSync(cookedDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    console.warn(`[export] não deu pra limpar ${path.basename(cookedDir)} (${err.code}) — inofensivo.`);
  }
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
  // cortex.json RESOLVIDO (id/name garantidos) — o host lê `id` pros saves e
  // `name` pro título. Copiar o cru deixaria projetos antigos (só `{engine}`)
  // sem `id`, e o host cairia no basename do exe (`launcher`) → saves colidindo
  // entre jogos. O `icon` fica fora do runtime (é usado só no export).
  {
    const { icon, ...rest } = game;
    void icon;
    fs.writeFileSync(path.join(dist, 'cortex.json'), JSON.stringify(rest, null, 2) + '\n');
  }
  const iniSrc = path.join(gameDir, 'config.ini');
  if (fs.existsSync(iniSrc)) fs.copyFileSync(iniSrc, path.join(dist, 'config.ini'));
  // Idiomas (ADR-0124): .txt soltos em dist-native/languages/ — de propósito
  // fora do assets.pak, pra qualquer um traduzir/editar sem rebuild.
  const languagesDir = path.join(gameDir, 'languages');
  if (fs.existsSync(languagesDir)) {
    const target = path.join(dist, 'languages');
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(languagesDir)) {
      if (!entry.endsWith('.txt')) continue;
      fs.copyFileSync(path.join(languagesDir, entry), path.join(target, entry));
    }
  }
});

step('done');
const files = fs.readdirSync(dist);
console.log(`[export] OK → ${dist} (${files.length} itens na raiz)`);
console.log(`[export] rode: ${path.join(dist, EXE_NAME)}`);
