import { query, type Options, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { createBlenderToolServer } from './tools/blender.js'
import { createPlaytestToolServer } from './tools/playtest.js'

/**
 * Loop do agente usando @anthropic-ai/claude-agent-sdk (ADR-0017 V2).
 *
 * O SDK faz quase tudo: roda o backend Claude Code, gerencia sessão,
 * autenticação (OAuth do `claude login` ou ANTHROPIC_API_KEY no env),
 * stream de mensagens, tools nativas (Read/Write/Edit/Bash/Glob/Grep).
 *
 * Nosso código só precisa:
 * - configurar cwd, allowedTools, systemPrompt;
 * - implementar canUseTool pra rotear aprovação ao renderer (ADR-0018);
 * - traduzir as mensagens do SDK em eventos pra UI (chunks, tool cards).
 */

const AGENT_SYSTEM_PROMPT = `\
Você é um assistente embutido em um IDE para o cortex-game-engine — um motor \
de jogos 3D em TypeScript com arquitetura Entity-Component-System (ECS) e \
renderização via Three.js.

Diretrizes gerais:
- Todos os arquivos que você edita ou cria devem ficar dentro do projeto \
aberto (cwd). Não acesse arquivos fora dele.
- Sempre que possível, leia arquivos existentes antes de propor mudanças.
- Responda em português. Quando escrever código, prefira TypeScript moderno \
(ES2022+) e siga o padrão ECS do engine.
- Seja conciso. Não repita o que as ferramentas já mostram no output.

Organização de arquivos do projeto (ADR-0022):

Todo projeto criado pelo IDE tem a estrutura:
  components/   só dados (classes extends Component, campos públicos)
  systems/      só lógica (classes extends System, sem estado interno)
  entities/     factories (funções que criam entity + components + mesh)
  scenes/       setup de cena/level (cria entities, registra systems)
  assets/       .glb, texturas, sons (não TS)
  utils/        helpers puros (funções, constantes)
  main.ts       bootstrap fino

Cada pasta tem um README.md curto que explica o que vai/não vai ali — \
**leia o README antes de criar arquivo novo numa pasta que você ainda \
não tocou**.

Antes de criar arquivo, decida a categoria. Reuse arquivos existentes \
se a responsabilidade casa. Um arquivo por classe; nome do arquivo é o \
nome da classe (\`PositionComponent.ts\` exporta \`PositionComponent\`). \
Para features muito pequenas (uma classe só), criar inline na cena ou \
em main.ts é OK — não force fragmentação prematura.

Regras anti-padrão que você deve seguir:
1. **Component só dados.** Sem métodos que mutam outras entities ou \
cena. Lógica vai em System.
2. **System sem estado interno.** Estado vai em Components. Não use \
\`this.timer\`, \`this.lastInput\` etc. — crie \`TimerComponent\` etc.
3. **Composição > herança em Components.** "Inimigo voador" = \
\`EnemyComponent\` + \`FlyingComponent\`, não \`class FlyingEnemy extends Enemy\`.
4. **Limite ~200 linhas por arquivo.** Sinal de "fat system" — quebre.

Uso do cortex-game-engine (importante):
- O motor vive em \`vendor/cortex-game-engine/\` dentro do projeto. \
Antes de codar features que envolvem cena, render, input, áudio, física, \
ECS ou modelos 3D, **leia \`vendor/cortex-game-engine/index.d.ts\`** para \
saber o que está exportado. Os módulos \`core/*.d.ts\` e \`ecs/*.d.ts\` ao \
lado têm o detalhe de cada classe.
- Imports devem vir de \`'cortex-game-engine'\` (alias do Vite resolve). \
NÃO importe direto de \`'three'\`: o pacote three não está em \`node_modules\` \
do projeto e os tipos vêm pelo engine.
- Se o engine **não expõe** algo que você precisa (uma classe, geometria, \
material, helper que existe em three mas não está re-exportado): \
  (a) **avise o usuário no texto da resposta**, deixando claro qual recurso \
      faltou e que vai usar um fallback ou pedir mudança no engine;  \
  (b) **sugira adicionar ao engine** (\`src/index-runtime.ts\` re-exporta \
      classes de three; \`src/core/\` e \`src/ecs/\` ficam as classes \
      originais) e pergunte ao usuário se quer estender o engine antes; \
  (c) só caia em fallback (importar three via algum truque, ou re-implementar \
      inline) se o usuário aprovar explicitamente.
- Nunca esconda do usuário que está saindo do padrão do engine — \
transparência > conveniência.

Comandos proibidos no Bash (não execute sob nenhuma hipótese dentro do projeto):
- \`yarn build\`, \`yarn dev\`, \`npm run build\`, \`npm run dev\`, \`npm start\`, \
\`pnpm build\`, \`pnpm dev\`, \`vite\`, \`vite build\`, \`vite preview\`, \`tsc -b\`, \`tsc -w\`.
- Motivo: esses comandos geram a pasta \`dist/\` do Vite (ou equivalente) \
dentro do projeto, sujando a árvore e o git. A geração de build final é \
responsabilidade da IDE — fora do seu escopo neste momento.
- Se você **precisar** validar que o código compila, use \`tsc --noEmit\` \
(sem flag de watch, sem \`-b\`) — não escreve arquivo nenhum.
- Se o usuário pedir explicitamente um build/dev server e você concluir \
que é inevitável, **avise antes** e proponha rodar a IDE em vez disso. \
Só execute se o usuário insistir e, mesmo assim, jamais dentro do \`cwd\` \
do projeto.
- \`yarn install\`, \`yarn add\`, \`npm install\` e similares continuam \
permitidos — eles só mexem em \`node_modules\`, não geram build.

Imagens coladas pelo usuário:
- Quando a mensagem contiver \`[imagem: <path>]\`, **leia esse arquivo \
imediatamente via tool \`Read\`** antes de responder. O Read em arquivos \
de imagem devolve um image block multimodal — você verá o conteúdo da \
imagem, não só o caminho. Use o que viu pra orientar sua resposta.
- Esses paths são **absolutos** e vivem fora do projeto (em um diretório \
gerenciado pelo IDE, tipicamente \`<userData>/cortex-pastes/...\`). É \
seguro fazer Read mesmo que esteja fora do cwd — são imagens que o \
usuário explicitamente colou. Não é violação do sandbox.

Rodar e testar o jogo (tool \`playtest_game\`):
- Você tem a tool \`playtest_game\`: ela sobe o jogo do projeto numa janela \
oculta, renderiza alguns frames e devolve um SCREENSHOT (você VÊ a imagem) + \
as mensagens de console (logs/warns/erros de runtime). Use-a pra VALIDAR o que \
implementou — depois de mexer em algo visual/jogável, rode o playtest, observe \
a tela e os logs, e corrija se necessário, em vez de assumir que funcionou.
- Você também pode JOGAR: passe \`actions\` (timeline de input de teclado — \
\`press\`/\`release\`/\`tap\`/\`wait\`/\`screenshot\`) pra mover/pular/colidir e \
validar comportamento, não só a tela inicial. Ex.: segurar \`ArrowRight\`, \
esperar, dar \`tap\` em \`Space\` (pulo) e \`screenshot\` nos pontos-chave. Cada \
\`screenshot\` vira uma imagem no retorno.
- NÃO tente rodar o jogo via Bash (\`vite\`/\`dev\` são proibidos acima) — use \
\`playtest_game\`, que é isolado e não suja o projeto.

Seja conciso. Não repita o que as ferramentas já mostram no output.`

// Anexado ao system prompt só nos turnos em modo PLAN. O agente pesquisa
// read-only e devolve um plano em texto; a implementação só vem depois que o
// usuário aprovar (fluxo por turno — ver ADR-0036).
const PLAN_MODE_PROMPT = `

MODO PLANO (ativo SOMENTE neste turno):
- Você está PLANEJANDO, não implementando. NÃO crie nem edite arquivos e NÃO \
rode comandos que modifiquem o projeto — neste modo qualquer tool que não seja \
de leitura (Read/Glob/Grep) é bloqueada automaticamente.
- Pesquise o necessário (Read/Grep/Glob) e produza, como sua RESPOSTA FINAL em \
texto, um PLANO de implementação claro: objetivo, arquivos a criar/editar, \
passos numerados e pontos de atenção/decisões. Use markdown.
- Seja específico e conciso. Termine com o plano — a implementação acontece \
depois que o usuário aprovar o plano.`

const APPROVED_AUTO_TOOLS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead'])

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
  /** Tokens lidos do cache (mais baratos). */
  cacheReadTokens: number
  /**
   * Session ID retornado pelo SDK no `result`. Persistido por projeto e
   * passado como `resume: <id>` nas chamadas seguintes — preserva o
   * contexto da conversa mesmo entre reinicializações do IDE.
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

export type AgentMode = 'ask' | 'auto' | 'plan'

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
   * Quando presente, tem precedência sobre `continueSession` e restaura o
   * contexto completo da conversa anterior no backend Claude Code.
   */
  resumeSessionId?: string | null
  /**
   * 'ask' (default): toda tool fora do conjunto auto-aprovado pede confirmação.
   * 'auto': tudo é aprovado direto; cards de tool aparecem só como histórico.
   * 'plan': read-only — toda tool mutante é bloqueada e o agente devolve um
   * plano em texto. A implementação roda num turno seguinte, após aprovação
   * (ADR-0036).
   */
  mode: AgentMode
}

/**
 * Roda um turno do agente. `prompt` é só a mensagem atual do usuário;
 * o SDK persiste o histórico por sessão (chave = cwd) quando passamos
 * `continue: true`.
 */
export async function runAgent(opts: RunAgentOptions): Promise<void> {
  // Tools customizadas ficam num MCP server in-process — só carregadas quando
  // há projeto aberto (precisam de projectRoot pra resolver paths relativos).
  const mcpServers = opts.projectRoot
    ? {
        'cortex-blender': createBlenderToolServer(opts.projectRoot),
        'cortex-playtest': createPlaytestToolServer(opts.projectRoot),
      }
    : undefined

  // Em modo plan, anexamos as instruções de planejamento ao system prompt.
  const systemAppend =
    opts.mode === 'plan' ? `${AGENT_SYSTEM_PROMPT}${PLAN_MODE_PROMPT}` : AGENT_SYSTEM_PROMPT

  const queryOptions: Options = {
    cwd: opts.projectRoot ?? undefined,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: systemAppend },
    // resume tem precedência sobre continue. Se temos um sessionId persistido
    // do passado (mesmo projeto, outra sessão do IDE), restauramos a conversa
    // completa no backend. Senão, continue mantém o contexto dentro da mesma
    // sessão do IDE.
    resume: opts.resumeSessionId ?? undefined,
    continue: opts.resumeSessionId ? undefined : opts.continueSession || undefined,
    abortController: opts.abortController,
    mcpServers,
    canUseTool: async (toolName, input) => {
      // Tools de leitura pura sempre rodam sem perguntar, em qualquer mode.
      if (APPROVED_AUTO_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input } as PermissionResult
      }

      // Modo plan: só leitura. Bloqueia qualquer tool que possa modificar o
      // projeto (Write/Edit/Bash/MCP). O agente deve apresentar o plano em
      // texto; a implementação roda no turno seguinte, após aprovação. Não
      // emitimos card (onToolRequest) — a recusa é silenciosa pro usuário.
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

      if (!needsApproval) {
        // Em auto-mode o card aparece no chat só pra histórico; aprovação
        // é implícita e a tool roda imediatamente.
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
    },
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

function handleSdkMessage(message: unknown, events: AgentEvents): void {
  const msg = message as { type?: string }
  if (!msg || typeof msg.type !== 'string') return

  switch (msg.type) {
    case 'assistant': {
      const blocks = (msg as { message?: { content?: Array<{ type?: string; text?: string }> } })
        .message?.content
      if (!blocks) return
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          events.onTextChunk(block.text)
        }
      }
      return
    }
    case 'user': {
      // Mensagens 'user' que voltam carregam tool_result blocks da execução
      const blocks = (msg as { message?: { content?: unknown[] } }).message?.content
      if (!Array.isArray(blocks)) return
      for (const block of blocks) {
        const b = block as { type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }
        if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          const content = stringifyToolResult(b.content)
          events.onToolExecuted(b.tool_use_id, { content, isError: b.is_error === true })
        }
      }
      return
    }
    case 'result': {
      const m = msg as {
        subtype?: string
        duration_ms?: number
        total_cost_usd?: number
        session_id?: string
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
        }
      }
      const stats: TurnStats | null =
        typeof m.duration_ms === 'number'
          ? {
              durationMs: m.duration_ms,
              costUsd: typeof m.total_cost_usd === 'number' ? m.total_cost_usd : 0,
              inputTokens: m.usage?.input_tokens ?? 0,
              outputTokens: m.usage?.output_tokens ?? 0,
              cacheReadTokens: m.usage?.cache_read_input_tokens ?? 0,
              sessionId: typeof m.session_id === 'string' ? m.session_id : null,
            }
          : null
      events.onDone(m.subtype ?? null, stats)
      return
    }
    default:
      return
  }
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as { type?: string; text?: string }
        if (block.type === 'text' && typeof block.text === 'string') return block.text
        return JSON.stringify(b)
      })
      .join('\n')
  }
  return JSON.stringify(content)
}

function buildSummary(toolName: string, input: Record<string, unknown>): string {
  const path = typeof input['file_path'] === 'string' ? input['file_path'] : ''
  const command = typeof input['command'] === 'string' ? input['command'] : ''
  switch (toolName) {
    case 'Write':
      return `Criar/sobrescrever ${path}`
    case 'Edit':
      return `Editar ${path}`
    case 'NotebookEdit':
      return `Editar notebook ${path}`
    case 'Bash':
      return `Executar: ${command}`
  }
  // Tools de MCP servers chegam prefixadas como mcp__<server>__<tool>
  if (toolName.endsWith('generate_blender_model')) {
    const target = typeof input['target_path'] === 'string' ? input['target_path'] : ''
    const desc = typeof input['description'] === 'string' ? input['description'] : ''
    const short = desc.length > 60 ? `${desc.slice(0, 60)}…` : desc
    return `Gerar modelo 3D em ${target}: "${short}"`
  }
  return toolName
}

function makeId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
