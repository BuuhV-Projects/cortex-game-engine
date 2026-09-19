// Teste de aceite do canal com a IDE (SPEC-0200 / M1 do PRD-0007).
//
// Sobe o host de um export, fala com ele SÓ por stdin/stdout — sem Electron —
// e verifica o contrato: `hello` recebe `ack`, e `requestState` devolve o
// `state` da cena carregada.
//
// Uso: node native/scripts/test-ide-channel.mjs <dirDoExport> [--level space-1]
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const exportDir = process.argv[2];
if (!exportDir) {
  console.error('uso: node native/scripts/test-ide-channel.mjs <dirDoExport> [--level <id>]');
  process.exit(2);
}
const levelIndex = process.argv.indexOf('--level');
const level = levelIndex > 0 ? process.argv[levelIndex + 1] : 'space-1';

/** Prefixo que o host usa nas linhas do canal (ide_channel.h). */
const PREFIX = '@cortex-ide@';
/** Tempo máximo esperando cada resposta, em ms. */
const TIMEOUT_MS = 90_000;

const host = spawn(path.join(exportDir, 'launcher.exe'), [], {
  cwd: exportDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    CORTEX_IDE_CHANNEL: '1',
    CORTEX_WINDOWED: '1',
    CORTEX_NO_SPLASH: '1',
    CORTEX_LAUNCH_QUERY: `level=${level}`,
  },
});

const waiters = [];
let buffer = '';
host.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith(PREFIX)) continue; // log comum do host
    let msg;
    try { msg = JSON.parse(line.slice(PREFIX.length)); } catch { continue; }
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].type === msg.type) waiters.splice(i, 1)[0].resolve(msg);
    }
  }
});

/** Espera uma mensagem do host com o `type` pedido. */
function expect(type) {
  return new Promise((resolve, reject) => {
    const waiter = { type, resolve };
    waiters.push(waiter);
    setTimeout(() => {
      const i = waiters.indexOf(waiter);
      if (i >= 0) { waiters.splice(i, 1); reject(new Error(`timeout esperando "${type}"`)); }
    }, TIMEOUT_MS);
  });
}

/** Manda uma linha JSON pro stdin do host. */
function send(message) {
  host.stdin.write(`${JSON.stringify(message)}\n`);
}

const fail = (why) => { console.error(`FALHOU: ${why}`); host.kill(); process.exit(1); };
host.on('exit', (code) => { if (waiters.length) fail(`host saiu (code ${code}) com ${waiters.length} resposta(s) pendente(s)`); });

try {
  // O handshake só pode ser respondido depois que o bundle do jogo rodou e o
  // Game existe — por isso o hello vai em repetição até o ack chegar.
  const ackPromise = expect('ack');
  const ping = setInterval(() => send({ type: 'hello' }), 1000);
  const ack = await ackPromise;
  clearInterval(ping);
  if (typeof ack.protocol !== 'number') fail('ack sem versão de protocolo');
  console.log(`ack recebido (protocolo ${ack.protocol})`);

  // O `ack` chega assim que o Game existe — a CENA ainda está carregando. Pede
  // o estado até vir com nós (é o que a IDE faria: perguntar, não adivinhar).
  let state = null;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    send({ type: 'requestState' });
    const next = await expect('state');
    if (!Array.isArray(next.nodes)) fail('state sem lista de nós');
    if (next.nodes.length > 0) { state = next; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!state) fail('state seguiu vazio até o timeout (a fase não carregou?)');
  console.log(`state recebido: ${state.nodes.length} nós, cena "${state.scene}"`);

  console.log('OK: canal bidirecional funcionando por stdin/stdout, sem Electron');
  host.kill();
  process.exit(0);
} catch (err) {
  fail(String(err instanceof Error ? err.message : err));
}
