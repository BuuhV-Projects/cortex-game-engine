// "Quem está segurando a pasta?" — diagnóstico de lock do export (ADR-0101).
// Quando a limpeza de dist-native falha com EPERM/EBUSY, o export chuta que é o
// jogo aberto — mas o culpado costuma ser OUTRO (Explorer na pasta, um terminal
// com cwd lá, antivírus, ou um Node/Electron pendurado de um dev/export
// anterior). Aqui perguntamos ao Windows Restart Manager QUEM realmente segura o
// caminho e devolvemos nome + PID de verdade.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'who-locks.ps1');

/**
 * Expande cada caminho nos ARQUIVOS a checar: uma pasta vira os arquivos do seu
 * primeiro nível (o exe/dlls do jogo, que é o que trava), um arquivo fica como
 * está. Registrar a pasta em si na Restart Manager retorna ACCESS_DENIED e zera
 * o resultado — por isso nunca passamos diretórios adiante. Caminhos
 * inexistentes são ignorados.
 * @param {string[]} paths
 * @returns {string[]}
 */
export function toFiles(paths) {
  const files = new Set();
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          if (e.isFile()) files.add(path.join(p, e.name));
        }
      } else if (st.isFile()) {
        files.add(p);
      }
    } catch {
      // caminho sumiu/sem acesso — ignora
    }
  }
  return [...files];
}

// RM_APP_TYPE → rótulo legível (ver who-locks.ps1 / docs da Restart Manager).
const KIND_LABEL = {
  '0': 'app',
  '1': 'janela',
  '2': 'janela',
  '3': 'serviço',
  '4': 'Explorer',
  '5': 'console/terminal',
  '1000': 'processo crítico',
};

/**
 * Parseia a saída do who-locks.ps1 ("PID\tNome\tTipo" por linha) num array de
 * `{ pid, name, kind }`. Puro (sem I/O) — o núcleo testável.
 * @param {string} stdout
 * @returns {{pid:number,name:string,kind:string}[]}
 */
export function parseRmOutput(stdout) {
  return (stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, name, type] = line.split('\t');
      return { pid: Number(pid), name: name || '(desconhecido)', kind: KIND_LABEL[type] ?? 'app' };
    })
    .filter((p) => Number.isFinite(p.pid));
}

/**
 * Pergunta ao Restart Manager quem segura `paths`. Best-effort: fora do Windows,
 * sem powershell, ou sem resultado, devolve `[]` — nunca lança (é diagnóstico,
 * não pode derrubar o export).
 * @param {string[]} paths  Arquivos/pastas a checar.
 * @param {{exec?: typeof execFileSync}} [opts]  `exec` injetável pra teste.
 * @returns {{pid:number,name:string,kind:string}[]}
 */
export function whoLocks(paths, opts = {}) {
  if (process.platform !== 'win32' || !paths?.length) return [];
  const files = toFiles(paths);
  if (!files.length) return [];
  const exec = opts.exec || execFileSync;
  try {
    const out = exec(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...files],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
    );
    return parseRmOutput(out);
  } catch {
    return [];
  }
}
