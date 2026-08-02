import { query, type Options, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { createBlenderToolServer } from './tools/blender.js'
import { createPlaytestToolServer } from './tools/playtest.js'
import { createAssetToolServer } from './tools/assets.js'
import { createKitsToolServer } from './tools/kits.js'
import { createBlueprintToolServer } from './tools/blueprint.js'
import { createCriticToolServer } from './tools/critic.js'
import { createValidateToolServer } from './tools/validate.js'
import { buildSystemPrompt } from './prompt.js'
import { handleSdkMessage, buildSummary } from './sdkMessages.js'
import type { RunAgentOptions, ToolExecutionResult, ToolRequest } from './agentTypes.js'

/**
 * Loop do agente sobre o `@anthropic-ai/claude-agent-sdk` (ADR-0017 V2).
 *
 * O SDK faz o trabalho pesado: roda o backend Claude Code, gerencia sessão,
 * autenticação, stream de mensagens e as tools nativas (Read/Write/Edit/Bash/
 * Glob/Grep). Este módulo só orquestra:
 * - monta as `Options` (cwd, modelo, prompt, plugin de skills, MCP servers);
 * - roteia aprovação de tool ao renderer (ADR-0018);
 * - delega a tradução das mensagens ao `sdkMessages`.
 *
 * O conhecimento de COMO montar fase/kit/blueprint não está aqui nem no prompt —
 * está nas skills do plugin `cortex-studio` (ADR-0180).
 */

// `measure_glb` entra aqui por ser leitura pura (parseia o .glb em memória):
// roda sem card de aprovação e continua disponível no modo plan.
const APPROVED_AUTO_TOOLS = new Set([
  'Read',
  'Glob',
  'Grep',
  'NotebookRead',
  'mcp__cortex-assets__measure_glb',
])

export type {
  ChatMessage,
  ToolRequest,
  ToolExecutionResult,
  TurnStats,
  AgentEvents,
  AgentApproval,
  AgentMode,
  AgentModel,
  RunAgentOptions,
} from './agentTypes.js'
export { resolveAgentModel } from './agentTypes.js'
export { handleSdkMessage } from './sdkMessages.js'

/**
 * Roda um turno do agente. `prompt` é só a mensagem atual do usuário; o SDK
 * persiste o histórico por sessão (chave = cwd) via `continue`/`resume`.
 */
export async function runAgent(opts: RunAgentOptions): Promise<void> {
  const queryOptions: Options = {
    cwd: opts.projectRoot ?? undefined,
    // Alias curto ('sonnet'/'opus'/'haiku') que o Claude Code resolve. Omitido =
    // default do SDK. O Studio escolhe por projeto (ADR-0130).
    model: opts.model,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: buildSystemPrompt({
        engineApiDoc: opts.engineApiDoc,
        engineApiPath: opts.engineApiPath,
        mode: opts.mode,
      }),
    },
    // resume tem precedência sobre continue. Com um sessionId persistido (mesmo
    // projeto, outra execução do IDE), restauramos a conversa completa; senão,
    // continue mantém o contexto dentro da mesma sessão do IDE.
    resume: opts.resumeSessionId ?? undefined,
    continue: opts.resumeSessionId ? undefined : opts.continueSession || undefined,
    abortController: opts.abortController,
    env: buildTurnEnv(opts) as Record<string, string | undefined> | undefined,
    // Só o projeto: carrega CLAUDE.md e .claude/ do jogo aberto (instruções do
    // usuário sobre o jogo dele) sem herdar as configurações globais da máquina,
    // que trariam skills de outros repositórios como ruído.
    settingSources: ['project'],
    // O preset `claude_code` traz o tool interativo `AskUserQuestion`, mas o Chat
    // é conversa em TEXTO e não renderiza o seletor: o tool "executa" sem UI,
    // volta vazio e o agente segue sozinho (perguntou sem dar opção). Removido —
    // o agente faz perguntas de esclarecimento em texto.
    disallowedTools: ['AskUserQuestion'],
    ...pluginOptions(opts.pluginDir),
    ...mcpOptions(opts.projectRoot, opts.kitsDir),
    canUseTool: (toolName, input) => resolvePermission(opts, toolName, input),
  }

  try {
    const q = query({ prompt: opts.prompt, options: queryOptions })
    for await (const message of q) {
      handleSdkMessage(message, opts.events)
    }
  } catch (err) {
    opts.events.onError(err)
  }
}

/**
 * Skills e subagente do plugin `cortex-studio` (ADR-0180). Sem plugin resolvido
 * (instalação incompleta), o turno roda sem skills em vez de falhar.
 *
 * `skipMcpDiscovery`: as conexões MCP são nossas (servers in-process abaixo); o
 * plugin não declara nenhuma.
 * `skills: 'all'`: as do plugin mais as que o próprio projeto do jogo definir.
 */
function pluginOptions(pluginDir: string | null | undefined): Partial<Options> {
  if (!pluginDir) return {}
  return {
    plugins: [{ type: 'local', path: pluginDir, skipMcpDiscovery: true }],
    skills: 'all',
  }
}

/**
 * Tools customizadas ficam em MCP servers in-process — só carregadas com projeto
 * aberto (precisam de projectRoot pra resolver paths relativos).
 */
function mcpOptions(projectRoot: string | null, kitsDir: string | undefined): Partial<Options> {
  if (!projectRoot) return {}
  return {
    mcpServers: {
      'cortex-blender': createBlenderToolServer(projectRoot),
      'cortex-playtest': createPlaytestToolServer(projectRoot),
      'cortex-assets': createAssetToolServer(projectRoot),
      'cortex-kits': createKitsToolServer(projectRoot, kitsDir),
      'cortex-blueprint': createBlueprintToolServer(projectRoot, kitsDir),
      'cortex-critic': createCriticToolServer(projectRoot),
      'cortex-validate': createValidateToolServer(projectRoot),
    },
  }
}

/**
 * Ambiente do turno: o que o main preparou (PATH com yarn/node) mais os caminhos
 * que as skills usam pra achar seus scripts e os kits empacotados — o `cwd` do
 * Bash é o projeto do jogo, não o repositório da engine (ADR-0180).
 */
function buildTurnEnv(opts: RunAgentOptions): NodeJS.ProcessEnv | undefined {
  if (!opts.env && !opts.pluginDir && !opts.kitsDir) return undefined
  return {
    ...(opts.env ?? process.env),
    ...(opts.pluginDir ? { CORTEX_PLUGIN_DIR: opts.pluginDir } : {}),
    ...(opts.kitsDir ? { CORTEX_KITS_DIR: opts.kitsDir } : {}),
  }
}

/**
 * Decide se uma tool pode rodar: leitura pura passa direto, modo plan bloqueia
 * tudo que modifica, e o resto vira card de aprovação no renderer.
 */
async function resolvePermission(
  opts: RunAgentOptions,
  toolName: string,
  input: Record<string, unknown>,
): Promise<PermissionResult> {
  // Tools de leitura pura sempre rodam sem perguntar, em qualquer mode.
  if (APPROVED_AUTO_TOOLS.has(toolName)) {
    return { behavior: 'allow', updatedInput: input } as PermissionResult
  }

  // Modo plan: só leitura. Bloqueia qualquer tool que possa modificar o projeto
  // (Write/Edit/Bash/MCP). Não emitimos card — a recusa é silenciosa pro usuário.
  if (opts.mode === 'plan') {
    return {
      behavior: 'deny',
      message:
        'MODO PLANO: ações que modificam o projeto estão bloqueadas. ' +
        'Apresente o plano final em texto; a implementação acontece após o usuário aprovar.',
    } as PermissionResult
  }

  const needsApproval = opts.mode === 'ask'
  const request: ToolRequest = {
    id: makeId(),
    name: toolName,
    input,
    summary: buildSummary(toolName, input),
    needsApproval,
  }
  opts.events.onToolRequest(request)

  // Em auto-mode o card aparece no chat só pra histórico; aprovação é implícita.
  if (!needsApproval) {
    return { behavior: 'allow', updatedInput: input } as PermissionResult
  }

  const approved = await opts.approval.requestApproval(request)
  if (!approved) {
    const denied: ToolExecutionResult = {
      content: 'Usuário negou esta operação.',
      isError: true,
    }
    opts.events.onToolExecuted(request.id, denied)
    return { behavior: 'deny', message: 'Usuário negou esta operação.' } as PermissionResult
  }
  return { behavior: 'allow', updatedInput: input } as PermissionResult
}

function makeId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
