// Teste de aceite da ponte do editor pelo canal (SPEC-0203 / M3b do PRD-0007).
//
// Faz o papel da IDE — sem Electron — e verifica o protocolo completo:
//   editor manda `hello` → respondemos `ack` → editor publica `state` com
//   outliner/inspector, e um `select` nosso muda a seleção publicada.
//
// Uso: node native/scripts/test-editor-bridge.mjs <dirDoExport com --editor>
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const exportDir = process.argv[2];
if (!exportDir) {
  console.error('uso: node native/scripts/test-editor-bridge.mjs <dirDoExport>');
  process.exit(2);
}

const PREFIX = '@cortex-ide@';
const TIMEOUT_MS = 120_000;
/** Marcas de origem: iguais às da ponte no browser (ADR-0056). */
const ENGINE = 'cortex-editor';
const IDE = 'cortex-ide';

const host = spawn(path.join(exportDir, 'launcher.exe'), [], {
  cwd: exportDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    CORTEX_IDE_CHANNEL: '1',
    CORTEX_WINDOWED: '1',
    CORTEX_NO_SPLASH: '1',
    CORTEX_LAUNCH_QUERY: 'level=space-1&editor=1',
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
    if (!line.startsWith(PREFIX)) continue;
    let msg;
    try { msg = JSON.parse(line.slice(PREFIX.length)); } catch { continue; }
    if (msg.source !== ENGINE) continue; // só o que vem do editor
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].match(msg)) waiters.splice(i, 1)[0].resolve(msg);
    }
  }
});

function expect(match, label) {
  return new Promise((resolve, reject) => {
    const waiter = { match, resolve };
    waiters.push(waiter);
    setTimeout(() => {
      const i = waiters.indexOf(waiter);
      if (i >= 0) { waiters.splice(i, 1); reject(new Error(`timeout esperando ${label}`)); }
    }, TIMEOUT_MS);
  });
}

const send = (message) => host.stdin.write(`${JSON.stringify({ source: IDE, ...message })}\n`);
const fail = (why) => { console.error(`FALHOU: ${why}`); host.kill(); process.exit(1); };

try {
  // 1. A ponte do editor emite `hello` em repetição até receber `ack`.
  await expect((m) => m.type === 'hello', 'hello do editor');
  console.log('hello do editor recebido');

  // 2. A IDE responde `ack` — e o que liga a publicacao de estado.
  //    ATENCAO: o primeiro `state` sai ANTES da fase montar (so a camera na
  //    cena). Esperamos o outliner com os nos da FASE, que e o que a IDE
  //    mostraria de verdade.
  const isSceneState = (m) =>
    m.type === 'state' && Array.isArray(m.outliner?.items) &&
    m.outliner.items.some((i) => i.label && !/^\(?Camera/.test(i.label));
  const statePromise = expect(isSceneState, 'state com os nos da fase');
  send({ type: 'ack' });
  const state = await statePromise;
  console.log(`state da fase: ${state.outliner.items.length} itens no outliner`);

  // 3. Selecionar pelo canal muda o inspector publicado — e o que faz o painel
  //    da IDE refletir o que esta selecionado no preview nativo.
  const target = state.outliner.items.find((i) => i.label && !/^\(?Camera/.test(i.label));
  const selectedPromise = expect(
    (m) => m.type === 'state' && m.inspector && m.inspector.empty === false,
    'state com inspector preenchido',
  );
  send({ type: 'select', id: target.id });
  const selected = await selectedPromise;
  console.log(`inspector do selecionado: "${selected.inspector.title}" (${selected.inspector.sections?.length ?? 0} secoes)`);

  console.log('OK: selecao pelo canal reflete no estado publicado — sem Electron');
  host.kill();
  process.exit(0);
} catch (err) {
  fail(String(err instanceof Error ? err.message : err));
}
