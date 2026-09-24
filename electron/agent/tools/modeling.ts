import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { runCodexAgent } from '../codex/CodexAgentRunner.js'
import type { RunAgentOptions, ToolExecutionResult } from '../agentTypes.js'

/**
 * Tool `delegate_modeling` do modo Orquestrador (ADR-0269 / SPEC-0270): o
 * Claude entrega a parte de DADO do pedido a um turno completo do Modelagem
 * (guarda de código + portão de `.glb` inclusos) e recebe a resposta do Astra.
 */

/**
 * Sessão do Astra por projeto, para delegações seguidas continuarem o mesmo
 * contexto. Memória do processo: some ao fechar o Studio.
 */
const modelingThreads = new Map<string, string>()

/**
 * Roda um turno do Modelagem por dentro do turno do Claude.
 *
 * Os cards de tool do Astra vão direto ao chat; o texto vira o resultado; o
 * `onDone` dele guarda a sessão e NÃO encerra o turno do Claude.
 */
export async function delegateModeling(
  opts: RunAgentOptions,
  request: string,
  run: (opts: RunAgentOptions) => Promise<void> = runCodexAgent,
): Promise<ToolExecutionResult> {
  const root = opts.projectRoot ?? ''
  const text: string[] = []
  let failure: unknown = null
  await run({
    ...opts,
    prompt: request,
    model: 'astra',
    resumeSessionId: modelingThreads.get(root) ?? null,
    events: {
      onTextChunk: (chunk) => text.push(chunk),
      onToolRequest: (req) => opts.events.onToolRequest(req),
      onToolExecuted: (id, result) => opts.events.onToolExecuted(id, result),
      onDone: (_reason, stats) => {
        if (stats?.sessionId) modelingThreads.set(root, stats.sessionId)
      },
      onError: (err) => {
        failure = err
      },
    },
  })
  if (failure) {
    const message = failure instanceof Error ? failure.message : String(failure)
    return { content: `O Modelagem falhou: ${message}`, isError: true }
  }
  return { content: text.join('').trim() || '(o Modelagem terminou sem resposta em texto)', isError: false }
}

/** MCP server in-process com a `delegate_modeling` — um por turno do Orquestrador. */
export function createModelingToolServer(opts: RunAgentOptions) {
  return createSdkMcpServer({
    name: 'cortex-modelagem',
    version: '0.1.0',
    tools: [
      tool(
        'delegate_modeling',
        'Entrega ao modo Modelagem do Studio a parte de DADO do pedido: criar ou alterar ' +
          'modelos 3D (.glb), montar ou editar cenário (scenes/*.json e overlays), efeitos ' +
          'declarados no cenário e nos modelos, performance dos dados 3D. O Modelagem trabalha ' +
          'no projeto, valida todo .glb (e corrige o reprovado) e NÃO escreve código. Ele não ' +
          'vê esta conversa: o pedido tem que ser autocontido.',
        {
          request: z
            .string()
            .min(1)
            .describe(
              'Pedido autocontido para o Modelagem: o que fazer, arquivos e nomes envolvidos, ' +
                'medidas em metros e onde salvar.',
            ),
        },
        async ({ request }) => {
          const result = await delegateModeling(opts, request)
          return { content: [{ type: 'text' as const, text: result.content }], isError: result.isError }
        },
      ),
    ],
  })
}
