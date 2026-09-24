import { join } from 'node:path'

import type { ValidateResult } from '../../../src/ai/validateGeneratedModel.js'
import { judgeModel, MAX_MODEL_ATTEMPTS } from '../../../src/ai/modelGate.js'
import { MODELING_REVIEW_CLOSING, PERFORMANCE_RULES } from '../performanceRules.js'
import type { AgentMode, TurnStats } from '../agentTypes.js'
import { restoreCode, snapshotCode } from './codeGuard.js'
import { changedModels, snapshotModels } from './modelWatch.js'

/**
 * Turno do modo Modelagem (ADR-0265 / SPEC-0266 / SPEC-0267): preâmbulo com a
 * fronteira e as regras de performance, guarda de código depois de cada rodada
 * e portão dos modelos `.glb` — reprovado volta à MESMA sessão do Astra.
 *
 * As dependências vêm injetadas para o fluxo ser testável sem o Codex CLI.
 */

/** Instrução acrescentada ao pedido quando o turno roda em modo plan (ADR-0036). */
const PLAN_SUFFIX = `

MODO PLANO: não crie nem edite arquivos. Pesquise o necessário e responda, em texto, \
com um plano de implementação: objetivo, arquivos a criar/editar, passos numerados e \
pontos de atenção.`

/** O que o modo faz e não faz — o Astra lê isto antes de todo pedido. */
const MODELING_SCOPE = `[Instruções do Studio — modo Modelagem]

Você trabalha em DADO do jogo: modelos 3D (.glb), cenários (scenes/*.json e overlays de cena), \
efeitos declarados no cenário e nos modelos (materiais, partículas, luz, água nos nós) e \
performance dos dados 3D.

Você NÃO escreve código (.ts, .tsx, .js, .jsx, .mjs, .cjs) — isso é do modo Codificar. Se o \
pedido precisar de código, faça a parte de dado e diga ao usuário qual parte precisa ser \
feita no modo Codificar. Mudanças em código feitas neste modo são desfeitas automaticamente.

Todo modelo .glb que você criar ou alterar passa pela validação do Studio; se reprovar, você \
recebe os motivos para corrigir.`

/** Monta o texto que o Astra recebe: fronteira + regras + fechamento + pedido. */
export function buildModelingPrompt(userPrompt: string, mode: AgentMode): string {
  const request = mode === 'plan' ? `${userPrompt}${PLAN_SUFFIX}` : userPrompt
  return (
    `${MODELING_SCOPE}\n\n${PERFORMANCE_RULES}\n\n${MODELING_REVIEW_CLOSING}\n\n` +
    `[Pedido do usuário]\n\n${request}`
  )
}

/** Um modelo reprovado e por quê. */
export interface ModelFailure {
  path: string
  reasons: string[]
}

/** Pedido de correção devolvido ao Astra. */
export function buildFixPrompt(failures: ModelFailure[]): string {
  const lines = ['A validação do Studio REPROVOU modelos deste turno:', '']
  for (const failure of failures) {
    lines.push(`- ${failure.path}:`)
    for (const reason of failure.reasons) lines.push(`  - ${reason}`)
  }
  lines.push('', 'Corrija esses modelos (sem mexer em código) e diga em uma linha o que mudou.')
  return lines.join('\n')
}

/** Resultado de uma rodada do Codex. Lança em falha (processo, login, erro do agente). */
export interface RoundResult {
  threadId: string | null
  stats: TurnStats | null
}

export interface ModelingDeps {
  /** Roda o Codex com `prompt`, retomando `resumeId` quando houver. */
  runRound(prompt: string, resumeId: string | null): Promise<RoundResult>
  /** Refino + inspeção (SPEC-0231) de um `.glb` absoluto. */
  validate(absolutePath: string): Promise<ValidateResult | null>
  /** Texto do Studio no chat, entre as falas do agente. */
  notify(text: string): void
  /** Abre um card "rodando" no chat; a função devolvida o fecha (SPEC-0271). */
  card(summary: string): (result: string, isError: boolean) => void
}

/**
 * Roda um turno completo do Modelagem.
 *
 * @returns as estatísticas da ÚLTIMA rodada (a que fecha o turno).
 */
export async function runModelingTurn(
  root: string,
  userPrompt: string,
  mode: AgentMode,
  resumeId: string | null,
  deps: ModelingDeps,
): Promise<TurnStats | null> {
  const code = await snapshotCode(root)
  const models = await snapshotModels(root)

  let round = await deps.runRound(buildModelingPrompt(userPrompt, mode), resumeId)
  await guardCode(root, code, deps)
  // Em modo plano o sandbox é somente leitura: não há modelo novo para julgar.
  if (mode === 'plan') return round.stats

  for (let attempt = 1; ; attempt++) {
    const changed = await changedModels(root, models)
    const failures: ModelFailure[] = []
    for (const [index, path] of changed.entries()) {
      const close = deps.card(`Validando modelo ${index + 1}/${changed.length}: ${path}`)
      const verdict = judgeModel(await deps.validate(join(root, path)))
      close(verdict.approved ? 'aprovado' : verdict.reasons.join('\n'), !verdict.approved)
      if (!verdict.approved) failures.push({ path, reasons: verdict.reasons })
    }
    if (failures.length === 0) {
      if (changed.length > 0) deps.notify(`✔ Validação: ${changed.length} modelo(s) aprovado(s).`)
      break
    }
    if (attempt >= MAX_MODEL_ATTEMPTS) {
      deps.notify(
        `⚠ Validação: ${failures.length} modelo(s) seguem reprovados depois de ${attempt} tentativas:\n\n` +
          buildFixPrompt(failures).split('\n').slice(2, -2).join('\n'),
      )
      break
    }
    deps.notify(`↻ Validação reprovou ${failures.length} modelo(s) — devolvendo para correção (tentativa ${attempt + 1}).`)
    round = await deps.runRound(buildFixPrompt(failures), round.threadId ?? resumeId)
    await guardCode(root, code, deps)
  }
  return round.stats
}

/** Desfaz código mexido na rodada e avisa no chat. */
async function guardCode(root: string, code: Awaited<ReturnType<typeof snapshotCode>>, deps: ModelingDeps): Promise<void> {
  const reverted = await restoreCode(root, code)
  if (reverted.length === 0) return
  deps.notify(
    `↩ O modo Modelagem não altera código — desfiz: ${reverted.join(', ')}. ` +
      'Para essa parte, use o modo Codificar.',
  )
}
