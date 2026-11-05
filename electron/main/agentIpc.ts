/**
 * Chat IA — usa @anthropic-ai/claude-agent-sdk como backend. Auth (OAuth do
 * Claude Code OU ANTHROPIC_API_KEY) é gerenciada pelo próprio SDK. SPEC-0014
 * + ADR-0017 V2. Também o projeto ativo (`project:setActive`). SPEC-0693.
 */
import { ipcMain, Menu } from 'electron'
import { join } from 'path'
import { runAgent, resolveAgentModel } from '../agent/agentLoop.js'
import { resolvePluginDir } from '../agent/plugin.js'
import { syncOnOpen } from '../packages/ipc.js'
import { envForSpawn, resourceBase, sendToRenderer, setCurrentProjectDir, getCurrentProjectDir, validatePath } from './shared.js'
import { engineApiDocPath, loadEngineApiDoc } from './engineVendor.js'
import { packageCacheDir } from './projectConfigIpc.js'
import { loadSessionId, saveSessionId } from './chatStore.js'
import { buildAppMenu } from './appMenu.js'

// Estado do turno do agente em curso (PRD-0002 / ADR-0018): controla
// aprovação de tools e cancelamento.
interface PendingApproval {
  resolve: (approved: boolean) => void
}
const pendingApprovals = new Map<string, PendingApproval>()
let agentAborted = false
let agentRunning = false

// Rastreia se já houve uma chamada de query() pra cada projeto. A 2ª em
// diante usa continue:true para manter contexto do turno anterior. Reseta
// quando o usuário troca de projeto.
const sessionStartedFor = new Set<string>()
let currentAgentAbort: AbortController | null = null

export function registerAgentIpc(): void {
  ipcMain.handle('project:setActive', async (event, projectDir: unknown) => {
    if (projectDir === null || projectDir === undefined) {
      setCurrentProjectDir(null)
    } else {
      const dir = validatePath(projectDir)
      setCurrentProjectDir(dir)
      // Pacote declarado no cortex.json e ainda não instalado → instala em segundo plano.
      void syncOnOpen(event.sender, dir, packageCacheDir()).catch(() => {})
    }
    // O menu "Projeto" só faz sentido com projeto aberto — reconstrói pra mostrar/ocultar.
    Menu.setApplicationMenu(buildAppMenu())
  })

  // Decisão do usuário sobre uma tool call pendente (ADR-0018). O renderer
  // chama isso depois de mostrar o card e o usuário clicar Aprovar ou Negar.
  ipcMain.handle('ai:tool_decision', async (_event, id: unknown, approved: unknown) => {
    if (typeof id !== 'string' || typeof approved !== 'boolean') return
    const pending = pendingApprovals.get(id)
    if (!pending) return
    pendingApprovals.delete(id)
    pending.resolve(approved)
  })

  // Cancela o turno do agente em andamento. Aborta o controller passado ao
  // SDK e resolve as aprovações pendentes como negadas.
  ipcMain.handle('ai:cancel', async () => {
    agentAborted = true
    currentAgentAbort?.abort()
    for (const [id, pending] of pendingApprovals) {
      pendingApprovals.delete(id)
      pending.resolve(false)
    }
  })

  // Turno do agente: extrai a última mensagem do usuário, delega ao SDK
  // (que gerencia stream, tools e sessão), traduz eventos pro renderer.
  ipcMain.handle('ai:chat', async (_event, messages: unknown, mode: unknown, model: unknown, orchestrate: unknown) => {
    if (!Array.isArray(messages)) {
      sendToRenderer('ai:error', { message: 'messages deve ser array' })
      return
    }
    const agentMode = mode === 'auto' ? 'auto' : mode === 'plan' ? 'plan' : 'ask'
    // Modelo do backend: Sonnet por default (teto de uso muito maior que Opus no
    // plano de assinatura — evita estourar o limite do Chat; ADR-0130).
    const agentModel = resolveAgentModel(model)
    if (agentRunning) {
      sendToRenderer('ai:error', {
        message: 'Outro turno do agente já está em andamento.',
      })
      return
    }
    // Salvaguarda: sem projectRoot, o SDK roda com cwd do processo Electron
    // (o repo do IDE) e o agente pode tocar arquivos fora do sandbox. Recusa.
    const currentProjectDir = getCurrentProjectDir()
    if (!currentProjectDir) {
      sendToRenderer('ai:error', {
        message: 'Abra um projeto antes de conversar com a IA. O agente só age dentro do projeto ativo.',
      })
      return
    }
    const history = messages as Array<{ role: 'user' | 'assistant'; content: string }>
    const lastUserMessage = [...history].reverse().find((m) => m.role === 'user')?.content
    if (!lastUserMessage) {
      sendToRenderer('ai:error', { message: 'Sem mensagem do usuário pra enviar.' })
      return
    }

    agentRunning = true
    agentAborted = false
    const abortController = new AbortController()
    currentAgentAbort = abortController

    const sessionKey = currentProjectDir
    const continueSession = sessionStartedFor.has(sessionKey)
    // Tenta retomar a sessão do passado (outra execução do IDE). Só vale no
    // primeiro turno desta execução; depois continueSession já mantém vivo.
    const resumeSessionId = continueSession ? null : await loadSessionId(sessionKey)

    const engineApiDoc = await loadEngineApiDoc()

    try {
      await runAgent({
        prompt: lastUserMessage,
        projectRoot: currentProjectDir,
        continueSession,
        resumeSessionId,
        mode: agentMode,
        model: agentModel,
        // Modo Orquestrador (ADR-0269): o Claude delega a parte de dado ao Modelagem.
        orchestrate: orchestrate === true,
        engineApiDoc,
        // Com o path, o agentLoop injeta só o ÍNDICE do doc e o agente lê as
        // seções sob demanda via Read (ADR-0114). Sem doc lido, sem path.
        engineApiPath: engineApiDoc ? engineApiDocPath() : undefined,
        // Skills + subagente do plugin `cortex-studio` (ADR-0180). Null quando o
        // plugin não está no lugar: o turno roda sem skills, sem falhar.
        pluginDir: resolvePluginDir(resourceBase()),
        kitsDir: join(resourceBase(), 'kits'),
        // PATH aumentado: a tool Bash do SDK herda este env, então `yarn`/`node`
        // resolvem mesmo no app empacotado (onde o PATH do Explorer não os tem).
        env: envForSpawn(),
        abortController,
        events: {
          onTextChunk(text) {
            sendToRenderer('ai:chunk', { text })
          },
          onToolRequest(request) {
            sendToRenderer('ai:tool_request', request)
          },
          onToolExecuted(id, result) {
            sendToRenderer('ai:tool_executed', { id, result })
          },
          onDone(stopReason, stats) {
            // Persiste o session_id atual pra retomar em execuções futuras
            if (stats?.sessionId) {
              void saveSessionId(sessionKey, stats.sessionId)
            }
            sendToRenderer('ai:done', { stopReason, stats })
          },
          onError(err) {
            const message = err instanceof Error ? err.message : String(err)
            sendToRenderer('ai:error', { message })
          },
        },
        approval: {
          async requestApproval(request) {
            if (agentAborted) return false
            return new Promise<boolean>((resolveApproval) => {
              pendingApprovals.set(request.id, { resolve: resolveApproval })
            })
          },
        },
      })
      sessionStartedFor.add(sessionKey)
    } finally {
      agentRunning = false
      currentAgentAbort = null
      pendingApprovals.clear()
    }
  })
}
