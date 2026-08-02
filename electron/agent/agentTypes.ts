/**
 * Tipos públicos de um turno do Chat IA e normalização do modelo.
 *
 * Separado do `agentLoop.ts` para que o main, os testes e o tradutor de
 * mensagens do SDK compartilhem o contrato sem arrastar o SDK junto.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolRequest {
  id: string
  name: string
  input: Record<string, unknown>
  summary: string
  needsApproval: boolean
}

export interface ToolExecutionResult {
  content: string
  isError: boolean
}

export interface TurnStats {
  /** Duração total do turno em milissegundos. */
  durationMs: number
  /** Custo estimado em USD (já calculado pelo SDK). */
  costUsd: number
  /** Tokens de input enviados (não inclui cache hits). */
  inputTokens: number
  /** Tokens de output gerados. */
  outputTokens: number
  /** Tokens lidos do cache (mais baratos que input normal). */
  cacheReadTokens: number
  /** Tokens gravados no cache (cobrados com sobretaxa sobre o input). */
  cacheCreationTokens: number
  /**
   * Session ID retornado pelo SDK no `result`. Persistido por projeto e passado
   * como `resume: <id>` nas chamadas seguintes — preserva o contexto da conversa
   * mesmo entre reinicializações do IDE.
   */
  sessionId: string | null
}

export interface AgentEvents {
  onTextChunk(text: string): void
  onToolRequest(request: ToolRequest): void
  onToolExecuted(id: string, result: ToolExecutionResult): void
  onDone(stopReason: string | null, stats: TurnStats | null): void
  onError(err: unknown): void
}

export interface AgentApproval {
  /** Pergunta ao usuário se uma tool destrutiva pode rodar. */
  requestApproval(request: ToolRequest): Promise<boolean>
}

/**
 * 'ask' (default): toda tool fora do conjunto auto-aprovado pede confirmação.
 * 'auto': tudo é aprovado direto; cards de tool aparecem só como histórico.
 * 'plan': read-only — toda tool mutante é bloqueada e o agente devolve um plano
 * em texto; a implementação roda no turno seguinte (ADR-0036).
 */
export type AgentMode = 'ask' | 'auto' | 'plan'

/**
 * Modelo do backend usado no turno. São os aliases curtos que o Claude Code
 * resolve pro id concreto da família (não fixamos versão aqui). O Chat manda
 * 'sonnet' por default: no plano de assinatura o teto de uso de Opus é bem menor
 * que o de Sonnet, então usar Opus no Chat (prompt + histórico via resume)
 * estoura o limite semanal rápido (ADR-0130). Opus fica opcional pra tarefas mais
 * difíceis; Haiku pra respostas rápidas/baratas.
 */
export type AgentModel = 'opus' | 'sonnet' | 'haiku'

/**
 * Normaliza um valor cru (vindo do IPC) num {@link AgentModel} válido.
 * Default 'sonnet' — qualquer coisa que não seja 'opus'/'haiku' cai nele.
 */
export function resolveAgentModel(raw: unknown): AgentModel {
  return raw === 'opus' ? 'opus' : raw === 'haiku' ? 'haiku' : 'sonnet'
}

export interface RunAgentOptions {
  prompt: string
  projectRoot: string | null
  events: AgentEvents
  approval: AgentApproval
  abortController: AbortController
  /** true no primeiro turno do projeto; demais turnos usam continue:true */
  continueSession: boolean
  /**
   * Session ID a retomar (persistido por projeto entre execuções do IDE).
   * Quando presente, tem precedência sobre `continueSession`.
   */
  resumeSessionId?: string | null
  mode: AgentMode
  /**
   * Modelo do backend pra este turno. Omitido = default do SDK; o Chat sempre
   * envia um valor (default 'sonnet').
   */
  model?: AgentModel
  /**
   * Conteúdo de `docs/cortex-game-engine/engine-api.md`, empacotado no Studio.
   * Com `engineApiPath` presente vira um ÍNDICE no prompt (ADR-0114).
   */
  engineApiDoc?: string
  /** Caminho ABSOLUTO do `engine-api.md` empacotado (mesmo arquivo do doc). */
  engineApiPath?: string
  /**
   * Raiz do plugin `cortex-studio` (skills + subagente). Quando ausente, o turno
   * roda sem skills em vez de falhar (ADR-0180).
   */
  pluginDir?: string | null
  /**
   * Diretório dos kits de assets empacotados (`<resourceBase>/kits`, ADR-0053).
   * Exposto às tools MCP e, como `CORTEX_KITS_DIR`, ao Bash das skills.
   */
  kitsDir?: string
  /**
   * Ambiente repassado ao subprocesso do SDK (a tool Bash herda dele). No app
   * empacotado o PATH do processo Electron não inclui yarn/node — o main injeta
   * os diretórios certos via envForSpawn(). ATENÇÃO: o SDK NÃO faz merge com
   * process.env, então este objeto já deve ser process.env aumentado.
   */
  env?: NodeJS.ProcessEnv
}
