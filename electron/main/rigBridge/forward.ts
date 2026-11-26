import type { RigReply } from './bridgeServer.js'

/**
 * Repasse de um comando da ponte ao painel e a espera da resposta (SPEC-0746): cada comando ganha um id, a resposta
 * casa pelo id, e sem resposta no prazo a ponte devolve o erro. Sem Electron (testável).
 */

/** Prazo da resposta; gravar no GLB assa e grava, e demora mais. */
export const REPLY_TIMEOUT_MS = 15_000
export const SAVE_TIMEOUT_MS = 180_000
const MS_PER_S = 1000

/** O comando como vai ao renderer. */
export interface RigCommand {
  id: number
  cmd: string
  args: Record<string, unknown>
  /** Até quando (`Date.now()`, ms) a ponte espera: passado disso, o painel não executa o comando (a ponte já desistiu). */
  deadline: number
}

/** Quanto esperar pelo comando (`save` do GLB: mais). */
export function timeoutFor(cmd: string, args: Record<string, unknown>): number {
  return cmd === 'save' && args['target'] === 'glb' ? SAVE_TIMEOUT_MS : REPLY_TIMEOUT_MS
}

/**
 * `send` entrega o comando ao painel (`false` = sem janela). `forward` espera a resposta; `reply` é chamado com o que
 * o painel devolveu.
 */
export function createForward(send: (msg: RigCommand) => boolean, timeout: (cmd: string, args: Record<string, unknown>) => number = timeoutFor) {
  let nextId = 1
  const pending = new Map<number, (reply: RigReply) => void>()
  const forward = (cmd: string, args: Record<string, unknown>): Promise<RigReply> => {
    const id = nextId++
    return new Promise((resolve) => {
      const ms = timeout(cmd, args)
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve({ ok: false, error: `o painel não respondeu ${cmd} em ${ms / MS_PER_S} s (aba Animações do Auto-rig aberta?)` })
      }, ms)
      pending.set(id, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
      if (!send({ id, cmd, args, deadline: Date.now() + ms })) {
        pending.get(id)?.({ ok: false, error: 'Studio sem janela aberta' })
        pending.delete(id)
      }
    })
  }
  const reply = (id: unknown, value: RigReply | null | undefined): void => {
    const done = typeof id === 'number' ? pending.get(id) : undefined
    if (!done) return
    pending.delete(id as number)
    done(value && typeof value === 'object' ? value : { ok: false, error: 'resposta inválida do painel' })
  }
  return { forward, reply }
}
