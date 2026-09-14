import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Cliente da modelagem 3D sobre o **Codex CLI** (ADR-0189 / SPEC-0190).
 *
 * Roda `codex exec` em modo headless para obter uma resposta de texto do
 * modelo {@link CODEX_MODEL}, usando a subscription já autenticada pelo
 * `codex login`. Nenhuma credencial é lida por este módulo — quem gerencia
 * auth é o próprio CLI.
 *
 * @see ADR-0189 (decisão e trade-offs) / SPEC-0190 (comportamento)
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Modelo usado para escrever os scripts `bpy` da modelagem 3D. */
export const CODEX_MODEL = 'gpt-6-astra';

/**
 * Versão mínima do Codex CLI. Medido: a 0.151.0 recusa o {@link CODEX_MODEL}
 * com HTTP 400 ("requires a newer version of Codex").
 */
export const CODEX_MIN_VERSION = '0.154.0';

/** Separador entre prompt de sistema e prompt de usuário no stdin do CLI. */
const PROMPT_SEPARATOR = '\n\n---\n\n';

/** Variável de ambiente que aponta o executável do Codex explicitamente. */
const CODEX_PATH_ENV = 'CODEX_PATH';

/** Nome do executável quando resolvido pelo `PATH`. */
const CODEX_FALLBACK_BIN = 'codex';

// ─── Resolução do binário ─────────────────────────────────────────────────────

/**
 * Caminhos conhecidos de instalação do app do Codex, por plataforma.
 *
 * Existe porque `codex` no `PATH` pode ser um shim antigo (gerenciador de
 * versão de Node apontando para o pacote npm global) enquanto o app instalado
 * ao lado está atualizado — ver ADR-0189.
 */
function _appInstallCandidates(): string[] {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local');
    return [join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Codex.app/Contents/MacOS/codex',
      join(homedir(), '.local', 'bin', 'codex'),
    ];
  }
  return [join(homedir(), '.local', 'bin', 'codex')];
}

/**
 * Resolve o executável do Codex CLI a ser usado.
 *
 * Ordem: `CODEX_PATH` → executável do app instalado → `codex` do `PATH`.
 *
 * @returns Caminho (ou nome) do executável — nunca vazio; o último candidato
 *          é `codex`, cuja ausência aparece como `ENOENT` na execução.
 */
export function resolveCodexBin(): string {
  const fromEnv = process.env[CODEX_PATH_ENV];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  for (const candidate of _appInstallCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return CODEX_FALLBACK_BIN;
}

// ─── Versão ───────────────────────────────────────────────────────────────────

/**
 * Extrai o `x.y.z` da saída de `codex --version` (ex.: `"codex-cli 0.154.0"`).
 *
 * @returns A versão encontrada, ou `null` se a saída não tiver o formato.
 */
export function parseCodexVersion(output: string): string | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(output);
  return match ? match[0] : null;
}

/**
 * Compara duas versões `x.y.z` numericamente (não lexicograficamente — senão
 * "0.9.0" apareceria como maior que "0.154.0").
 *
 * @returns Negativo se `a < b`, zero se iguais, positivo se `a > b`.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const segments = Math.max(pa.length, pb.length);
  for (let i = 0; i < segments; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Faz uma chamada single-shot ao {@link CODEX_MODEL} via `codex exec` e
 * devolve o texto final do modelo.
 *
 * Sem sessão, sem tools de escrita (`--sandbox read-only`), sem herdar a
 * configuração pessoal do usuário (`--ignore-user-config --ignore-rules`) —
 * o Studio precisa se comportar igual em qualquer máquina.
 *
 * @param systemPrompt - Instruções de sistema (ex.: a referência da API `bpy`).
 * @param userPrompt   - Pedido do usuário (ex.: a descrição do modelo 3D).
 * @returns O texto da última mensagem do modelo.
 * @throws {Error} Se o Codex CLI não estiver instalado, estiver abaixo de
 *         {@link CODEX_MIN_VERSION}, falhar na execução ou não produzir saída.
 *
 * @example
 * const texto = await queryCodex(BPY_SYSTEM_PROMPT, 'uma espada medieval');
 */
export async function queryCodex(systemPrompt: string, userPrompt: string): Promise<string> {
  const bin = resolveCodexBin();
  await _assertVersion(bin);

  const outputFile = join(tmpdir(), `codex_out_${Date.now()}_${process.pid}.txt`);
  const prompt = `${systemPrompt}${PROMPT_SEPARATOR}${userPrompt}`;

  try {
    await _runCodexExec(bin, prompt, outputFile);

    const text = existsSync(outputFile) ? (await readFile(outputFile, 'utf-8')).trim() : '';
    if (!text) {
      throw new Error(
        `O Codex CLI ("${bin}") terminou sem produzir resposta. ` +
          'A causa mais comum é falta de autenticação — rode "codex login" e tente de novo.',
      );
    }
    return text;
  } finally {
    await unlink(outputFile).catch(() => undefined);
  }
}

// ─── Utilitários internos ─────────────────────────────────────────────────────

/**
 * Roda `codex --version` e falha se estiver abaixo de {@link CODEX_MIN_VERSION}.
 *
 * Checar aqui evita gastar uma chamada de modelo para receber um HTTP 400 que
 * não diz qual binário foi usado.
 */
async function _assertVersion(bin: string): Promise<void> {
  const { stdout, stderr, code, spawnError } = await _spawnCapture(bin, ['--version']);

  if (spawnError) throw _notFoundError(bin, spawnError);
  if (code !== 0) {
    throw new Error(
      `Falha ao consultar a versão do Codex CLI ("${bin}", código ${String(code)}).` +
        (stderr.trim() ? `\n\nSaída de erro:\n${stderr.trim()}` : ''),
    );
  }

  const version = parseCodexVersion(stdout || stderr);
  if (!version) {
    throw new Error(
      `Não foi possível identificar a versão do Codex CLI ("${bin}"). ` +
        `Saída recebida: ${JSON.stringify((stdout || stderr).trim().slice(0, 200))}`,
    );
  }
  if (compareVersions(version, CODEX_MIN_VERSION) < 0) {
    throw new Error(
      `Codex CLI ${version} é antigo demais para o modelo "${CODEX_MODEL}" ` +
        `(mínimo: ${CODEX_MIN_VERSION}).\n` +
        `  Binário usado: ${bin}\n` +
        '  Atualize com "npm install -g @openai/codex@latest" (ou pelo app do Codex).\n' +
        `  Se você tem uma versão nova em outro caminho, aponte-a com ${CODEX_PATH_ENV}.`,
    );
  }
}

/** Monta o erro de "Codex CLI não instalado" com instrução de conserto. */
function _notFoundError(bin: string, err: NodeJS.ErrnoException): Error {
  if (err.code === 'ENOENT') {
    return new Error(
      `Codex CLI não encontrado em "${bin}". A modelagem 3D do Studio precisa dele ` +
        `(mínimo ${CODEX_MIN_VERSION}, autenticado).\n` +
        '  Instale com "npm install -g @openai/codex@latest" e rode "codex login",\n' +
        `  ou defina ${CODEX_PATH_ENV} com o caminho completo do executável.`,
    );
  }
  return new Error(`Falha ao iniciar o Codex CLI ("${bin}"): ${err.message}`);
}

/**
 * Roda `codex exec` com o prompt em stdin, escrevendo a resposta final em
 * `outputFile`.
 *
 * `stdout` é descartado (log de progresso do agente, verboso); o conteúdo útil
 * vem do arquivo de `--output-last-message`.
 */
async function _runCodexExec(bin: string, prompt: string, outputFile: string): Promise<void> {
  const args = [
    'exec',
    '--model',
    CODEX_MODEL,
    // Só queremos texto — o agente não deve escrever nada no disco por conta própria.
    '--sandbox',
    'read-only',
    // Não polui o histórico de sessões pessoais do usuário.
    '--ephemeral',
    // Comportamento reprodutível, independente do setup pessoal (a auth não depende disto).
    '--ignore-user-config',
    '--ignore-rules',
    // A chamada roda em diretório temporário, não num repositório.
    '--skip-git-repo-check',
    '--output-last-message',
    outputFile,
    // "-" = ler o prompt do stdin (evita o limite de linha de comando do Windows).
    '-',
  ];

  const { stderr, code, spawnError } = await _spawnCapture(bin, args, {
    stdin: prompt,
    cwd: tmpdir(),
  });

  if (spawnError) throw _notFoundError(bin, spawnError);
  if (code !== 0) {
    throw new Error(
      `Codex CLI encerrou com código de saída ${String(code)}.` +
        (stderr.trim() ? `\n\nSaída de erro:\n${stderr.trim()}` : ''),
    );
  }
}

/** Resultado de {@link _spawnCapture}. */
interface SpawnCaptureResult {
  stdout: string;
  stderr: string;
  code: number | null;
  spawnError?: NodeJS.ErrnoException;
}

/**
 * Executa um processo capturando `stdout`/`stderr`, sem lançar em erro de
 * spawn — o chamador decide a mensagem, que difere entre `--version` e `exec`.
 */
function _spawnCapture(
  bin: string,
  args: string[],
  opts: { stdin?: string; cwd?: string } = {},
): Promise<SpawnCaptureResult> {
  return new Promise<SpawnCaptureResult>((resolve) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // O executável no Windows pode ser um .cmd (shim do npm), que exige shell.
      shell: process.platform === 'win32' && !bin.toLowerCase().endsWith('.exe'),
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err: Error) => {
      resolve({ stdout, stderr, code: null, spawnError: err as NodeJS.ErrnoException });
    });
    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, code });
    });

    if (opts.stdin !== undefined) {
      child.stdin?.end(opts.stdin, 'utf-8');
    } else {
      child.stdin?.end();
    }
  });
}
