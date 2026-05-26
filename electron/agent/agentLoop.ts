import type Anthropic from '@anthropic-ai/sdk'
import { TOOL_SCHEMAS, executeTool } from './tools.js'
import type { ToolContext, ToolRequest, ToolExecutionResult } from './tools.js'

/**
 * Loop do agente (ADR-0017). Recebe o histórico de mensagens, conversa com a
 * SDK Anthropic em streaming, executa tool calls, devolve `tool_result` e
 * repete até o modelo encerrar o turno (stop_reason !== 'tool_use') ou bater
 * o cap de rodadas.
 */

const MAX_TOOL_ROUNDS = 10

const AGENT_SYSTEM_PROMPT = `\
Você é um assistente embutido em um IDE para o cortex-game-engine — um motor \
de jogos 3D em TypeScript com arquitetura Entity-Component-System (ECS) e \
renderização via Three.js.

Você pode usar as seguintes ferramentas para agir no projeto do usuário:

- list_files: explorar a estrutura do projeto
- read_file: ler arquivos existentes antes de propor mudanças
- write_file: criar ou sobrescrever arquivos (exige aprovação do usuário)
- delete_file: remover arquivos (exige aprovação)
- run_command: executar comandos shell no projeto (exige aprovação)
- generate_script: gerar um Script ECS completo a partir de descrição em \
linguagem natural (exige aprovação; usa um modelo especializado em ECS)
- generate_blender_model: gerar um modelo 3D .glb via Blender headless \
(exige aprovação; demora mais)

Diretrizes:

- Todos os paths são relativos à raiz do projeto aberto. Você não pode \
acessar arquivos fora dele.
- Sempre que possível, leia arquivos relevantes antes de propor mudanças, \
para entender o contexto existente.
- Para criar Systems/Components ECS novos, prefira generate_script ao invés \
de write_file — ele usa um modelo especializado com a API ECS no contexto.
- Para criar modelos 3D, prefira generate_blender_model ao invés de tentar \
escrever o .glb com write_file (não vai funcionar — formato binário).
- Responda em português. Quando escrever código, use TypeScript moderno e \
siga o padrão ECS.
- Seja conciso nas respostas em texto. Não repita o que a ferramenta já \
mostra no resultado.`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentEvents {
  onTextChunk(text: string): void
  onToolRequest(request: ToolRequest): void
  onToolExecuted(id: string, result: ToolExecutionResult): void
  onDone(stopReason: string | null): void
  onError(err: unknown): void
}

export interface AgentApproval {
  requestApproval(request: ToolRequest): Promise<boolean>
}

export interface RunAgentOptions {
  client: Anthropic
  model: string
  initialMessages: ChatMessage[]
  projectRoot: string | null
  isOAuth: boolean
  events: AgentEvents
  approval: AgentApproval
  shouldAbort: () => boolean
}

/**
 * Executa um turno do agente. Faz streaming de texto, executa tools enfileiradas,
 * repete até `stop_reason !== 'tool_use'` ou cap de rodadas.
 */
export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const claudeCodePrefix = opts.isOAuth
    ? `You are Claude Code, Anthropic's official CLI for Claude.\n\n`
    : ''
  const systemPrompt = `${claudeCodePrefix}${AGENT_SYSTEM_PROMPT}`

  const conversation: Anthropic.MessageParam[] = opts.initialMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))

  const ctx: ToolContext = {
    projectRoot: opts.projectRoot,
    anthropicClient: opts.client,
    announce: opts.events.onToolRequest,
    requestApproval: opts.approval.requestApproval,
    notifyExecuted: opts.events.onToolExecuted,
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (opts.shouldAbort()) {
        opts.events.onDone('aborted')
        return
      }

      const stream = opts.client.messages.stream({
        model: opts.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOL_SCHEMAS,
        messages: conversation,
      })

      for await (const event of stream) {
        if (opts.shouldAbort()) {
          stream.controller.abort()
          opts.events.onDone('aborted')
          return
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          opts.events.onTextChunk(event.delta.text)
        }
      }

      const finalMessage = await stream.finalMessage()

      // Adiciona a resposta do assistente ao histórico (texto + tool_use)
      conversation.push({ role: 'assistant', content: finalMessage.content })

      const toolUses = finalMessage.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      )

      if (toolUses.length === 0 || finalMessage.stop_reason !== 'tool_use') {
        opts.events.onDone(finalMessage.stop_reason ?? null)
        return
      }

      // Executa cada tool, coleta tool_result blocks
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUses) {
        if (opts.shouldAbort()) {
          opts.events.onDone('aborted')
          return
        }
        const execution = await executeTool(toolUse.id, toolUse.name, toolUse.input, ctx)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: execution.content,
          is_error: execution.isError,
        })
      }

      conversation.push({ role: 'user', content: toolResults })
    }

    opts.events.onError(new Error(`Limite de ${MAX_TOOL_ROUNDS} rodadas de ferramentas atingido.`))
  } catch (err) {
    opts.events.onError(err)
  }
}
