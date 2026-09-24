import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { resolveCodexBin, CODEX_MODEL } from '../../../src/ai/CodexClient.js'
import { validateGeneratedModel } from '../../../src/ai/validateGeneratedModel.js'
import type { RunAgentOptions } from '../agentTypes.js'
import { nativeScriptsDir } from '../tools/blender.js'
import { consumeCodexLine, createTurnState } from './codexEvents.js'
import { runModelingTurn, type RoundResult } from './modelagemTurn.js'

/**
 * Cabeça do modo **Modelagem** do Chat IA (ADR-0265; roda o GPT-6-Astra pelo
 * Codex CLI — ADR-0191 / SPEC-0192).
 *
 * Roda o Codex CLI como agente dentro do projeto aberto e traduz a saída JSONL
 * para o mesmo `AgentEvents` da cabeça Claude — a UI não sabe qual respondeu.
 *
 * O agente escreve DADO no projeto (cena, assets, efeitos declarados). Código
 * é desfeito pelo guarda e modelo reprovado volta para correção — ver
 * {@link runModelingTurn}.
 */

/** Sandbox por modo: em plan o agente não pode escrever. */
const SANDBOX_BY_MODE = {
  plan: 'read-only',
  ask: 'workspace-write',
  auto: 'workspace-write',
} as const

/**
 * Roda um turno do Chat IA na cabeça Codex.
 *
 * @param opts - As mesmas opções do turno do Claude; usa `projectRoot`,
 *               `prompt`, `mode`, `resumeSessionId`, `events` e `abortController`.
 */
export async function runCodexAgent(opts: RunAgentOptions): Promise<void> {
  const projectRoot = opts.projectRoot
  if (!projectRoot) {
    opts.events.onError(
      new Error(
        'O modo Modelagem precisa de um projeto aberto — ele trabalha dentro da pasta do jogo. ' +
          'Abra ou crie um projeto e tente de novo.',
      ),
    )
    return
  }

  const startedAt = Date.now()
  const bin = resolveCodexBin()
  const blenderBin = process.env['BLENDER_PATH'] ?? 'blender'

  /** Uma rodada do Codex; lança em falha do processo ou do agente. */
  const runRound = async (prompt: string, resumeId: string | null): Promise<RoundResult> => {
    const state = createTurnState()
    const exitCode = await runProcess(bin, buildArgs(projectRoot, opts, resumeId), prompt, projectRoot, state, opts)
    if (state.errorMessage) throw new Error(state.errorMessage)
    if (exitCode !== 0) {
      throw new Error(
        `O modo Modelagem encerrou com código ${String(exitCode)}. ` +
          'Verifique se o Codex CLI está autenticado (`codex login`) e atualizado.',
      )
    }
    return { threadId: state.threadId, stats: state.stats }
  }

  try {
    const stats = await runModelingTurn(projectRoot, opts.prompt, opts.mode, opts.resumeSessionId ?? null, {
      runRound,
      validate: (path) => validateGeneratedModel(path, { scriptsDir: nativeScriptsDir(), blenderBin }),
      notify: (text) => opts.events.onTextChunk(`\n\n${text}\n\n`),
    })
    if (stats) stats.durationMs = Date.now() - startedAt
    opts.events.onDone(null, stats)
  } catch (err) {
    opts.events.onError(err)
  }
}

/**
 * Monta os argumentos do `codex exec`.
 *
 * `resume <threadId>` entra logo depois de `exec` a partir do segundo turno,
 * para o agente manter o contexto da conversa.
 *
 * **Não** passamos `--ignore-user-config`: medido que, com ela, o agente se
 * comporta como read-only e não escreve nada, mesmo com `workspace-write`
 * (ADR-0191). Também não passamos `--ephemeral` — a sessão precisa persistir
 * para o `resume` funcionar.
 */
function buildArgs(projectRoot: string, opts: RunAgentOptions, resumeId: string | null): string[] {
  return [
    'exec',
    ...(resumeId ? ['resume', resumeId] : []),
    '--model',
    CODEX_MODEL,
    '--sandbox',
    SANDBOX_BY_MODE[opts.mode],
    '--skip-git-repo-check',
    '-C',
    projectRoot,
    '--json',
    // "-" = prompt pelo stdin (sem limite de linha de comando, sem escaping).
    '-',
  ]
}

/**
 * Executa o processo, transmitindo o JSONL linha a linha enquanto chega.
 *
 * @returns O exit code do processo.
 */
function runProcess(
  bin: string,
  args: string[],
  prompt: string,
  cwd: string,
  state: ReturnType<typeof createTurnState>,
  opts: RunAgentOptions,
): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // O executável no Windows pode ser um .cmd (shim do npm), que exige shell.
      shell: process.platform === 'win32' && !bin.toLowerCase().endsWith('.exe'),
    })

    // Aborta o turno junto com o botão de parar do chat.
    const onAbort = (): void => {
      child.kill()
    }
    opts.abortController.signal.addEventListener('abort', onAbort, { once: true })

    // readline entrega linha completa — o JSONL pode ser partido entre chunks.
    const lines = createInterface({ input: child.stdout })
    lines.on('line', (line: string) => {
      consumeCodexLine(line, state, opts.events)
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      opts.abortController.signal.removeEventListener('abort', onAbort)
      reject(
        err.code === 'ENOENT'
          ? new Error(
              `Codex CLI não encontrado em "${bin}". O modo Modelagem precisa dele — ` +
                'instale com "npm install -g @openai/codex@latest" e rode "codex login".',
            )
          : err,
      )
    })

    child.on('close', (code: number | null) => {
      opts.abortController.signal.removeEventListener('abort', onAbort)
      lines.close()
      // stderr só vira erro se o processo falhou; em turno OK é log de progresso.
      if (code !== 0 && !state.errorMessage && stderr.trim()) {
        state.errorMessage = stderr.trim().slice(-1000)
      }
      resolve(code)
    })

    child.stdin?.end(prompt, 'utf-8')
  })
}
