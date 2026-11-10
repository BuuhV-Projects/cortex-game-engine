/**
 * Auto-rig do Studio (SPEC-0724, ADR-0723): roda as etapas `skin` e `preview` no Blender, o Aprovar e o Desfazer, e
 * devolve o código de saída do `prepare-character.sh` (0 aprovado, 1 reprovado, 2 infraestrutura, 3 aguardando
 * revisão visual, 64 config inválida). A saída vai para o painel por `send`.
 */
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AUTO_RIG_EXIT, resolveRigConfig, type ResolvedRigConfig } from './autoRigConfig.js'
import { approve, clipDurations, registerRig, revert, stagingFiles } from './autoRigPublish.js'
import { readState, STAGE_SCRIPTS, stageHashes, stagesToRun, writeState, type RigState, type StageName, type StageStatus } from './autoRigState.js'

export type AutoRigAction = 'generate' | 'approve' | 'revert'

export interface AutoRigRunOptions {
  projectDir: string
  /** `tools/characters/<nome>.json`. */
  configRel: string
  action: AutoRigAction
  /** Executável do Blender; `null` = não achado (código 2). */
  blender: string | null
  /** `native/scripts/autorig` do Studio. */
  scriptsDir: string
  send: (text: string) => void
  /** O Blender desta etapa começou (`active`) ou terminou (o Parar do painel mata o que está ativo). */
  onChild: (child: ChildProcess, active: boolean) => void
  /** Mata o Blender que estourou o tempo da etapa, com os filhos (o IPC passa o `killProcessTree`); padrão `kill()`. */
  kill?: (child: ChildProcess) => void
  /** Cancelada pelo Parar ou por uma execução nova: não abre a próxima etapa nem grava o estado. */
  signal?: AbortSignal
  /** Pergunta antes de rodar os ganchos do projeto (SPEC-0724, adendo 1); `false` = não autorizados. */
  confirmHooks?: (hooks: string[]) => Promise<boolean>
  now?: () => Date
}

/**
 * Processo que o Parar deve matar depois do aviso `onChild`. O fim de um processo só limpa a referência se ela ainda é
 * dele: o `close` atrasado do Blender que uma nova execução matou não pode esquecer o Blender novo.
 */
export function trackChild<T>(current: T | null, child: T, active: boolean): T | null {
  if (active) return child
  return current === child ? null : current
}

interface StageResult {
  ok: boolean
  failures: string[]
  infra: string | null
}

const STAGE_TIMEOUT_MS = 15 * 60 * 1000
const LOG_PREFIX = '[autorig]'
/** Linhas do fim do log mostradas quando uma etapa falha. */
const LOG_TAIL_LINES = 15
const WORK_DIRS = ['logs', 'results', 'staging', 'skinned', 'backup']
const MS_PER_S = 1000

/** Linhas `[autorig]` de um pedaço da saída do Blender (o resto fica no log da etapa). */
export function relevantLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/)
  const rest = parts.pop() ?? ''
  return { lines: parts.filter((l) => l.startsWith(LOG_PREFIX)), rest }
}

function spawnStage(o: AutoRigRunOptions, config: ResolvedRigConfig, stage: StageName, resultPath: string, logPath: string): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const args = ['-b', '--factory-startup', '--python', join(o.scriptsDir, STAGE_SCRIPTS[stage]), '--', join(config.work, 'config.resolved.json'), resultPath]
    let log = ''
    let pending = ''
    let settled = false
    const child = spawn(o.blender!, args, { cwd: config.project, windowsHide: true })
    o.onChild(child, true)
    const timer = setTimeout(() => (o.kill ? o.kill(child) : child.kill()), STAGE_TIMEOUT_MS)
    const onData = (d: Buffer): void => {
      const text = d.toString()
      log += text
      const { lines, rest } = relevantLines(pending + text)
      pending = rest
      for (const l of lines) o.send(`${l}\n`)
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    const finish = (error: string | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      o.onChild(child, false)
      writeFileSync(logPath, log)
      resolvePromise(error)
    }
    child.on('close', (code) => finish(code === 0 ? null : `Blender saiu com código ${String(code)}`))
    child.on('error', (err) => finish(`Blender não rodou (${o.blender}): ${err.message}`))
  })
}

function readResult(resultPath: string, spawnError: string | null): StageResult {
  try {
    const r = JSON.parse(readFileSync(resultPath, 'utf8')) as StageResult
    return { ok: r.ok === true, failures: Array.isArray(r.failures) ? r.failures : [], infra: r.infra ?? null }
  } catch {
    return { ok: false, failures: [], infra: spawnError ?? 'a etapa não gravou o resultado' }
  }
}

async function runStage(o: AutoRigRunOptions, config: ResolvedRigConfig, stage: StageName, state: RigState, hash: string): Promise<StageStatus> {
  const resultPath = join(config.work, 'results', `${stage}.json`)
  const logPath = join(config.work, 'logs', `${stage}.log`)
  writeFileSync(resultPath, '')
  const t0 = Date.now()
  o.send(`${LOG_PREFIX} etapa ${stage}…\n`)
  const spawnError = await spawnStage(o, config, stage, resultPath, logPath)
  if (o.signal?.aborted) return 'infra' // a execução que cancelou esta é dona da pasta de trabalho agora
  const result = readResult(resultPath, spawnError)
  const status: StageStatus = result.infra ? 'infra' : result.ok ? 'pass' : 'fail'
  const at = (o.now?.() ?? new Date()).toISOString()
  state.stages[stage] = { hash, status, seconds: Math.round((Date.now() - t0) / MS_PER_S), at, failures: result.failures, infra: result.infra }
  writeState(config.work, state)
  if (status !== 'pass') {
    for (const f of result.failures) o.send(`  - ${f}\n`)
    if (result.infra) o.send(`  - infraestrutura: ${result.infra.split('\n')[0]}\n`)
    const tail = existsSync(logPath) ? readFileSync(logPath, 'utf8').trimEnd().split(/\r?\n/).slice(-LOG_TAIL_LINES) : []
    o.send(`  log: ${logPath}\n${tail.map((l) => `    ${l}`).join('\n')}\n`)
  }
  return status
}

/** Sem ganchos, ou aceitos: a `skin` pode rodar. Recusa ou cancelamento durante a pergunta: não roda nada. */
async function hooksAllowed(o: AutoRigRunOptions, config: ResolvedRigConfig): Promise<boolean> {
  const hooks = config.skinned.hooks
  if (!hooks.length || !o.confirmHooks) return true
  const ok = await o.confirmHooks(hooks)
  if (o.signal?.aborted) {
    o.send('cancelado: nada foi publicado no projeto\n')
    return false
  }
  if (!ok) o.send('ganchos não autorizados: a etapa skin não rodou e nada foi publicado no projeto\n')
  return ok
}

async function generate(o: AutoRigRunOptions, config: ResolvedRigConfig, state: RigState, hashes: Record<StageName, string>): Promise<number> {
  if (!o.blender) {
    o.send('Blender não encontrado. Use o botão "Blender…" do painel para escolher o executável (ou defina BLENDER_PATH).\n')
    return AUTO_RIG_EXIT.infra
  }
  const todo = new Set(stagesToRun(state, hashes))
  for (const stage of ['skin', 'preview'] as const) {
    if (o.signal?.aborted) {
      o.send('cancelado: nada foi publicado no projeto\n')
      return AUTO_RIG_EXIT.infra
    }
    if (!todo.has(stage)) {
      o.send(`${LOG_PREFIX} etapa ${stage}: reaproveitada\n`)
      continue
    }
    if (stage === 'skin' && !(await hooksAllowed(o, config))) return AUTO_RIG_EXIT.infra
    const status = await runStage(o, config, stage, state, hashes[stage])
    if (o.signal?.aborted) {
      o.send('cancelado: nada foi publicado no projeto\n')
      return AUTO_RIG_EXIT.infra
    }
    if (stage === 'skin' && status === 'pass') {
      const warn = registerRig(config, o.configRel, 'staging', { at: state.stages.skin!.at }, clipDurations(stagingFiles(config).clips))
      if (warn) o.send(`${warn}\n`)
      todo.add('preview') // o .blend da prévia foi regravado
    }
    if (status !== 'pass') {
      o.send('parou aqui: nada foi publicado no projeto\n')
      return status === 'infra' ? AUTO_RIG_EXIT.infra : AUTO_RIG_EXIT.fail
    }
  }
  o.send(`\nREVISÃO VISUAL: ${join(config.work, 'skinned', 'previa', 'folha.png')}\n`)
  o.send('confira o esqueleto sobre o corpo (ombros, cotovelos, punhos, quadril, joelhos); aprovado: Aprovar publica no projeto\n')
  return AUTO_RIG_EXIT.review
}

/** Roda a ação no pipeline do Studio e devolve o código de saída. */
export async function runAutoRig(o: AutoRigRunOptions): Promise<number> {
  let text: string
  try {
    text = readFileSync(join(o.projectDir, o.configRel), 'utf8')
  } catch (err) {
    o.send(`config ilegível: ${(err as Error).message}\n`)
    return AUTO_RIG_EXIT.usage
  }
  const resolved = resolveRigConfig(text, o.projectDir, o.configRel)
  if (!resolved.ok) {
    o.send(`config inválida (${o.configRel}):\n${resolved.errors.map((e) => `  - ${e}`).join('\n')}\n`)
    return AUTO_RIG_EXIT.usage
  }
  const config = resolved.config
  for (const d of WORK_DIRS) mkdirSync(join(config.work, d), { recursive: true })
  writeFileSync(join(config.work, 'config.resolved.json'), JSON.stringify(config, null, 1) + '\n')
  const state = readState(config.work)
  const hashes = stageHashes(config, o.scriptsDir)
  o.send(`# auto-rig ${config.code} (Studio)\nwork: ${config.work}\n`)
  if (o.action === 'generate') return generate(o, config, state, hashes)
  const now = o.now?.() ?? new Date()
  const out = o.action === 'approve' ? approve(config, o.configRel, state, hashes, now) : revert(config, o.configRel, state)
  o.send(out.lines.join('\n') + '\n')
  return out.code
}
