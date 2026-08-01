// Upload de um build pra Steam via SteamPipe (SPEC-0175). Gera o `app_build.vdf`
// a partir do export e chama o `steamcmd` — substitui a edição manual do
// template, que era a fonte nº 1 de "subiu pro app errado".
//
// Uso:
//   node native/scripts/steam-upload.mjs <distDir> --depot <id> [opções]
//
//   --depot <id>       (obrigatório) id do depot, criado no Steamworks
//   --user <login>     conta de parceiro (senão o steamcmd pergunta)
//   --branch <nome>    publica o build NESTE branch (default: nenhum — sobe sem publicar)
//   --desc <texto>     descrição do build no painel
//   --steamcmd <path>  caminho do steamcmd.exe (senão procura no SDK e no PATH)
//   --dry-run          gera e imprime o .vdf, NÃO chama o steamcmd
//
// O app id NÃO é parâmetro: sai do `cortex.json` do próprio <distDir>, o mesmo
// que o host lê em runtime (ADR-0174). Assim não existe subir um build pra um
// app diferente daquele que ele se diz ser.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGameConfig, steamAppIdOf } from './game-config.mjs';

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);

/** Valor de uma flag `--nome <valor>`, ou null. */
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const usage =
  'uso: node native/scripts/steam-upload.mjs <distDir> --depot <id> ' +
  '[--user <login>] [--branch <nome>] [--desc <texto>] [--steamcmd <path>] [--dry-run]';

// Posicional = 1º arg sem `--` que não seja valor de flag.
const flagValues = new Set(
  args.map((a, i) => (a.startsWith('--') ? args[i + 1] : null)).filter(Boolean),
);
const positional = args.filter((a) => !a.startsWith('--') && !flagValues.has(a));
const distDir = positional[0] ? path.resolve(positional[0]) : null;

if (!distDir || !fs.existsSync(distDir)) {
  console.error(`[steam] pasta do build não encontrada.\n${usage}`);
  process.exit(1);
}
// Guarda contra apontar pro projeto em vez do export: sem o exe não é um build.
if (!fs.existsSync(path.join(distDir, 'launcher.exe'))) {
  console.error(
    `[steam] ${distDir} não parece um export (sem launcher.exe).\n` +
      '        Gere primeiro: node native/scripts/export-game.mjs <gameDir> --steam',
  );
  process.exit(1);
}

const appId = steamAppIdOf(readGameConfig(distDir));
if (appId === null) {
  console.error(
    `[steam] o cortex.json de ${distDir} não declara steamAppId.\n` +
      '        Este build não foi gerado com --steam (ou é anterior ao ADR-0174).',
  );
  process.exit(1);
}

const depot = flag('depot');
if (!depot || !/^\d+$/.test(depot)) {
  console.error(`[steam] --depot <id> é obrigatório (só dígitos).\n${usage}`);
  process.exit(1);
}

const branch = flag('branch') ?? '';
// O branch `default` é o que fica VISÍVEL pros jogadores. Publicar nele por
// linha de comando é irreversível na prática — a Valve exige confirmação no
// painel justamente por isso, e aqui a gente não contorna.
if (branch === 'default') {
  console.error(
    '[steam] publicar direto no branch `default` não é suportado por aqui.\n' +
      '        Suba o build (sem --branch) e publique pelo painel do Steamworks.',
  );
  process.exit(1);
}

const desc = flag('desc') ?? `${path.basename(distDir)} — cortex export`;
const dryRun = has('dry-run');

// steamcmd: --steamcmd > SDK vendorizado > PATH.
function findSteamCmd() {
  const explicit = flag('steamcmd');
  if (explicit) return path.resolve(explicit);
  const vendored = path.join(
    engineRoot,
    'native',
    'third_party',
    'steamworks',
    'tools',
    'ContentBuilder',
    'builder',
    'steamcmd.exe',
  );
  if (fs.existsSync(vendored)) return vendored;
  return 'steamcmd'; // deixa o SO resolver pelo PATH
}
const steamCmd = findSteamCmd();

// O .vdf sai numa pasta temporária com caminhos ABSOLUTOS: o template antigo
// usava caminho relativo e quebrava dependendo do cwd de quem chamava.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-steampipe-'));
const buildOutput = path.join(workDir, 'output');
fs.mkdirSync(buildOutput, { recursive: true });

// Escapa `"` e `\` no valor — caminho do Windows entra cru no VDF.
const vdfValue = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const vdf = `"AppBuild"
{
\t"AppID"       "${appId}"
\t"Desc"        "${vdfValue(desc)}"
\t"ContentRoot" "${vdfValue(distDir)}"
\t"BuildOutput" "${vdfValue(buildOutput)}"
\t"SetLive"     "${vdfValue(branch)}"

\t"Depots"
\t{
\t\t"${depot}"
\t\t{
\t\t\t"FileMapping"
\t\t\t{
\t\t\t\t"LocalPath"  "*"
\t\t\t\t"DepotPath"  "."
\t\t\t\t"recursive"  "1"
\t\t\t}
\t\t}
\t}
}
`;

const vdfPath = path.join(workDir, 'app_build.vdf');
fs.writeFileSync(vdfPath, vdf, 'utf8');

console.log(`[steam] app ${appId} · depot ${depot} · ${branch ? `branch ${branch}` : 'sem publicar'}`);
console.log(`[steam] conteúdo: ${distDir}`);
console.log(`[steam] script:   ${vdfPath}`);

if (dryRun) {
  console.log('\n--- app_build.vdf ---');
  console.log(vdf);
  console.log('[steam] --dry-run: steamcmd NÃO foi chamado.');
  process.exit(0);
}

const user = flag('user');
// Sem `+login` o steamcmd usa a sessão em cache; com usuário ele pede senha/2FA
// na primeira vez e guarda depois. Senha NUNCA vai por argumento — ficaria no
// histórico do shell e na lista de processos.
const cmdArgs = [
  ...(user ? ['+login', user] : []),
  '+run_app_build',
  vdfPath,
  '+quit',
];

console.log(`[steam] ${steamCmd} ${cmdArgs.join(' ')}`);
try {
  execFileSync(steamCmd, cmdArgs, { stdio: 'inherit' });
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(
      `[steam] steamcmd não encontrado (${steamCmd}).\n` +
        '        Passe --steamcmd <caminho> ou extraia o SDK em native/third_party/steamworks\n' +
        '        (o binário vem em tools/ContentBuilder/builder/steamcmd.exe).',
    );
  } else {
    console.error(`[steam] upload falhou (exit ${err.status ?? '?'}). Log em ${buildOutput}`);
  }
  process.exit(1);
}

console.log(`[steam] OK — build enviado. Publique/confira em https://partner.steamgames.com/apps/builds/${appId}`);
