import type { AiToolRequest, TurnStats } from './types'
import { renderMarkdown } from './markdown'
import { t } from './i18n'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── Formatters para a linha de stats do turno ──────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s - m * 60)
  return `${m}m${rest}s`
}

function formatCost(usd: number): string {
  if (usd === 0) return t('chat.free')
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

/**
 * Separa as referências `[imagem: <path>]` do resto do texto numa mensagem
 * do usuário. Usado na renderização: anexos viram chips visuais, texto
 * remanescente fica como texto plano.
 */
function extractImageRefs(content: string): { textOnly: string; attachments: string[] } {
  const attachments: string[] = []
  const textOnly = content
    .replace(/\[imagem:\s*([^\]]+)\]\s*\n?/g, (_match, path: string) => {
      attachments.push(path.trim())
      return ''
    })
    .trim()
  return { textOnly, attachments }
}

// Tools read-only — não mudam o filesystem, então não disparam refresh
// na sidebar. Qualquer outra tool é tratada como possível mutação.
const READONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead'])

function toolMutatesFs(name: string): boolean {
  // MCP tools chegam prefixadas como mcp__<server>__<tool>; strip pra checar
  const bare = name.includes('__') ? (name.split('__').pop() ?? name) : name
  return !READONLY_TOOLS.has(bare)
}

type DisplayItem =
  | { kind: 'message'; role: 'user' | 'assistant'; content: string; el: HTMLElement | null }
  | { kind: 'tool'; request: AiToolRequest; result: { content: string; isError: boolean } | null; el: HTMLElement | null }

/**
 * Sidebar de chat IA (ADR-0014 + PRD-0002 V2).
 *
 * V2 — o chat agora é agente: além de respostas em texto streaming,
 * recebe tool calls do main process (ADR-0017) e renderiza cards de
 * confirmação inline (ADR-0018) para ações que tocam o projeto.
 */
export class Chat {
  private container: HTMLElement

  private messagesEl: HTMLElement | null = null
  private inputEl: HTMLTextAreaElement | null = null
  private sendBtn: HTMLButtonElement | null = null
  private stopBtn: HTMLButtonElement | null = null
  private toggleBtn: HTMLButtonElement | null = null

  // Histórico do envio: só user/assistant text (sem cards). É o seed que
  // mandamos pra main.process. Cards de tool são display-only.
  private messagesSent: ChatMessage[] = []

  // Histórico visual completo: mensagens + cards em ordem cronológica.
  private items: DisplayItem[] = []

  // Texto acumulado do assistente no turno atual — vira uma única
  // mensagem no `messagesSent` quando o turno termina.
  private currentTurnAssistantText = ''

  // Item de assistente em streaming agora (se houver). Recebe chunks até
  // chegar uma tool_request, então é finalizado e um próximo item assist
  // começa quando o próximo chunk chegar.
  private liveAssistantItem: DisplayItem | null = null

  private projectDir: string | null = null
  private streaming = false
  private collapsed = false

  /** Imagens coladas (Ctrl+V) que vão junto na próxima mensagem. */
  private pendingAttachments: Array<{
    path: string
    fileName: string
    previewUrl: string
  }> = []
  private attachmentsEl: HTMLElement | null = null

  /**
   * Paths das imagens enviadas no turno atual — apagados do disco quando o
   * agente termina (`handleDone`). Imagens só fazem sentido enquanto a IA
   * está usando; depois ficam órfãs em `.cortex/paste/`.
   */
  private pastesToCleanup: string[] = []
  /**
   * 'ask' pede aprovação por tool (default); 'auto' aprova tudo direto;
   * 'plan' é read-only e o agente devolve um plano pra aprovação (ADR-0036).
   */
  private mode: 'ask' | 'auto' | 'plan' =
    (localStorage.getItem('chat_mode') as 'ask' | 'auto' | 'plan') ?? 'ask'
  private modeToggleEl: HTMLButtonElement | null = null

  /** true quando o turno atual foi enviado em modo plan — dispara a barra de aprovação no fim. */
  private lastTurnWasPlan = false

  // Indicador "Pensando..." mostrado entre o envio da mensagem e o primeiro
  // chunk de texto ou tool_request. Some assim que qualquer feedback do
  // assistente aparece (resposta ou tool card).
  private thinkingEl: HTMLElement | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    this.buildShell()
    this.updateInputState()

    window.electronAPI.onAiChunk((text) => this.handleChunk(text))
    window.electronAPI.onAiDone((payload) => this.handleDone(payload.stats))
    window.electronAPI.onAiError((message) => this.handleError(message))
    window.electronAPI.onAiToolRequest((req) => this.handleToolRequest(req))
    window.electronAPI.onAiToolExecuted((p) => this.handleToolExecuted(p.id, p.result))

    document.addEventListener('locale-change', () => {
      this.buildShell()
      this.renderAll()
      this.updateInputState()
    })

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (path !== this.projectDir) {
        this.projectDir = path
        this.messagesSent = []
        this.items = []
        this.currentTurnAssistantText = ''
        this.liveAssistantItem = null
        this.clearAttachments()
        // Pendências de cleanup ficam órfãs no projeto anterior — aceito,
        // já que o handler usa currentProjectDir do main que também mudou.
        this.pastesToCleanup = []
        void window.electronAPI.setActiveProject(path)
        void this.loadHistory(path)
      }
      this.updateInputState()
    })

    // Fechar projeto: desconecta o agente e limpa a conversa.
    document.addEventListener('project-close', () => {
      this.projectDir = null
      this.messagesSent = []
      this.items = []
      this.currentTurnAssistantText = ''
      this.liveAssistantItem = null
      this.clearAttachments()
      this.pastesToCleanup = []
      void window.electronAPI.setActiveProject(null)
      if (this.messagesEl) this.messagesEl.innerHTML = `<p class="chat-empty">${t('chat.empty')}</p>`
      this.updateInputState()
    })
  }

  /** Carrega histórico persistido em <userData>/chats/<hash>.json (PRD-0001 V2). */
  private async loadHistory(projectDir: string): Promise<void> {
    try {
      const stored = await window.electronAPI.loadChatHistory(projectDir)
      if (Array.isArray(stored) && stored.length > 0) {
        this.messagesSent = stored
        this.items = stored.map((m) => ({
          kind: 'message' as const,
          role: m.role,
          content: m.content,
          el: null,
        }))
      }
    } catch (err) {
      console.error('Erro ao carregar histórico:', err)
    }
    this.renderAll()
  }

  /** Salva o histórico após cada turno do agente. Só user/assistant text. */
  private saveHistory(): void {
    if (!this.projectDir) return
    void window.electronAPI.saveChatHistory(this.projectDir, this.messagesSent)
  }

  /**
   * Salva uma imagem colada (Ctrl+V) em <projeto>/.cortex/paste/ e adiciona
   * um chip de anexo acima do textarea (estilo Claude). A IA tem instrução
   * no system prompt para usar Read no path antes de responder.
   */
  private async handlePastedImage(file: File): Promise<void> {
    if (!this.projectDir) {
      alert(t('chat.open_first_for_paste'))
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const relPath = await window.electronAPI.saveClipboardImage(dataUrl)
      const fileName = relPath.split('/').pop() ?? relPath
      // URL.createObjectURL gera URL temporária só pra preview no chip.
      // Revogada quando o chip é removido ou a mensagem é enviada.
      const previewUrl = URL.createObjectURL(file)
      this.pendingAttachments.push({ path: relPath, fileName, previewUrl })
      this.renderAttachments()
      this.inputEl?.focus()
    } catch (err) {
      alert(`${t('chat.error_paste')} ${String(err)}`)
    }
  }

  private renderAttachments(): void {
    if (!this.attachmentsEl) return
    this.attachmentsEl.innerHTML = ''
    if (this.pendingAttachments.length === 0) {
      this.attachmentsEl.style.display = 'none'
      return
    }
    this.attachmentsEl.style.display = ''
    for (let i = 0; i < this.pendingAttachments.length; i++) {
      const att = this.pendingAttachments[i]
      const chip = document.createElement('div')
      chip.className = 'chat-attachment'

      const img = document.createElement('img')
      img.className = 'chat-attachment-thumb'
      img.src = att.previewUrl
      img.alt = att.fileName

      const label = document.createElement('span')
      label.className = 'chat-attachment-name'
      label.textContent = att.fileName

      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'chat-attachment-close'
      close.title = t('chat.tooltip_remove_attachment')
      close.textContent = '×'
      const idx = i
      close.addEventListener('click', () => this.removeAttachment(idx))

      chip.appendChild(img)
      chip.appendChild(label)
      chip.appendChild(close)
      this.attachmentsEl.appendChild(chip)
    }
  }

  private removeAttachment(index: number): void {
    const att = this.pendingAttachments[index]
    if (att) URL.revokeObjectURL(att.previewUrl)
    this.pendingAttachments.splice(index, 1)
    this.renderAttachments()
  }

  /** Limpa todos os anexos pendentes (após enviar ou ao trocar projeto). */
  private clearAttachments(): void {
    for (const att of this.pendingAttachments) {
      URL.revokeObjectURL(att.previewUrl)
    }
    this.pendingAttachments = []
    this.renderAttachments()
  }

  // ── Modo do agente: ask (pede aprovação) → auto (aprova tudo) → plan (planeja) ──

  private toggleMode(): void {
    this.mode = this.mode === 'ask' ? 'auto' : this.mode === 'auto' ? 'plan' : 'ask'
    localStorage.setItem('chat_mode', this.mode)
    this.renderModeToggle()
  }

  private renderModeToggle(): void {
    if (!this.modeToggleEl) return
    this.modeToggleEl.classList.toggle('chat-mode-btn--auto', this.mode === 'auto')
    this.modeToggleEl.classList.toggle('chat-mode-btn--ask', this.mode === 'ask')
    this.modeToggleEl.classList.toggle('chat-mode-btn--plan', this.mode === 'plan')
    const label =
      this.mode === 'auto'
        ? t('chat.mode_auto')
        : this.mode === 'plan'
          ? t('chat.mode_plan')
          : t('chat.mode_ask')
    const tip =
      this.mode === 'auto'
        ? t('chat.tooltip_mode_auto')
        : this.mode === 'plan'
          ? t('chat.tooltip_mode_plan')
          : t('chat.tooltip_mode_ask')
    this.modeToggleEl.textContent = label
    this.modeToggleEl.title = tip
  }

  /** Apaga o histórico do projeto ativo e limpa a UI. */
  private async clearHistory(): Promise<void> {
    if (!this.projectDir) return
    const ok = window.confirm(t('chat.confirm_clear'))
    if (!ok) return
    try {
      await window.electronAPI.clearChatHistory(this.projectDir)
    } catch (err) {
      console.error('Erro ao limpar histórico:', err)
    }
    this.messagesSent = []
    this.items = []
    this.currentTurnAssistantText = ''
    this.liveAssistantItem = null
    // Garante que nenhum estado de streaming fantasma sobrevive ao clear —
    // o input ficava bloqueado quando isso acontecia. Forçamos os atributos
    // diretamente além de chamar updateInputState() para cobrir o caso de
    // o DOM ter ficado fora de sync com o estado interno.
    this.streaming = false
    this.hideThinking()
    this.renderAll()
    if (this.inputEl) {
      this.inputEl.disabled = false
      this.inputEl.readOnly = false
    }
    if (this.sendBtn) this.sendBtn.disabled = false
    this.updateInputState()
    // Foco no próximo tick — alguns navegadores ignoram focus() dentro do
    // mesmo task do confirm().
    setTimeout(() => this.inputEl?.focus(), 0)
  }

  private buildShell(): void {
    this.container.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'chat-header'
    const title = document.createElement('span')
    title.className = 'chat-header-title'
    title.textContent = t('chat.title')
    // Toggle ask/auto — vem antes do clear/minimize. Texto e classe
    // refletem o mode atual; clique alterna e persiste em localStorage.
    const modeToggle = document.createElement('button')
    modeToggle.className = 'chat-mode-btn'
    modeToggle.type = 'button'
    modeToggle.addEventListener('click', () => this.toggleMode())
    this.modeToggleEl = modeToggle
    this.renderModeToggle()

    const clearBtn = document.createElement('button')
    clearBtn.className = 'chat-clear-btn'
    clearBtn.type = 'button'
    clearBtn.title = t('chat.tooltip_clear')
    clearBtn.textContent = '🗑'
    clearBtn.addEventListener('click', () => void this.clearHistory())

    const toggleBtn = document.createElement('button')
    toggleBtn.className = 'chat-toggle-btn'
    toggleBtn.type = 'button'
    toggleBtn.title = t('chat.tooltip_minimize')
    toggleBtn.textContent = '▸'
    toggleBtn.addEventListener('click', () => this.toggleCollapsed())
    this.toggleBtn = toggleBtn
    header.appendChild(title)
    header.appendChild(modeToggle)
    header.appendChild(clearBtn)
    header.appendChild(toggleBtn)

    const messages = document.createElement('div')
    messages.className = 'chat-messages'
    messages.innerHTML = `<p class="chat-empty">${t('chat.empty')}</p>`
    this.messagesEl = messages

    // Linha de anexos (imagens coladas) — fica acima do textarea quando há
    // anexos pendentes. Escondida por default.
    const attachments = document.createElement('div')
    attachments.className = 'chat-attachments'
    attachments.style.display = 'none'
    this.attachmentsEl = attachments

    const inputRow = document.createElement('div')
    inputRow.className = 'chat-input-row'

    const input = document.createElement('textarea')
    input.className = 'chat-input'
    input.rows = 2
    input.placeholder = t('chat.placeholder_input')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void this.send()
      }
    })
    input.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) void this.handlePastedImage(file)
          return
        }
      }
    })
    this.inputEl = input

    const sendBtn = document.createElement('button')
    sendBtn.className = 'chat-send-btn'
    sendBtn.textContent = t('chat.send')
    sendBtn.addEventListener('click', () => void this.send())
    this.sendBtn = sendBtn

    const stopBtn = document.createElement('button')
    stopBtn.className = 'chat-stop-btn'
    stopBtn.textContent = t('chat.stop')
    stopBtn.style.display = 'none'
    stopBtn.addEventListener('click', () => {
      void window.electronAPI.cancelChat()
      // Destrava o input imediatamente. Sem isso, ficamos travados até o
      // `ai:done` chegar do main — que pode demorar (o agente pode estar
      // no meio de uma tool) ou não chegar (race entre cancel e done).
      this.streaming = false
      this.hideThinking()
      this.liveAssistantItem = null
      this.currentTurnAssistantText = ''
      this.lastTurnWasPlan = false
      this.updateInputState()
      this.inputEl?.focus()
    })
    this.stopBtn = stopBtn

    inputRow.appendChild(input)
    inputRow.appendChild(sendBtn)
    inputRow.appendChild(stopBtn)

    this.container.appendChild(header)
    this.container.appendChild(messages)
    this.container.appendChild(attachments)
    this.container.appendChild(inputRow)
  }

  private updateInputState(): void {
    if (!this.inputEl || !this.sendBtn || !this.stopBtn) return
    const enabled = !this.streaming
    this.inputEl.disabled = !enabled
    this.sendBtn.disabled = !enabled
    this.sendBtn.style.display = this.streaming ? 'none' : ''
    this.stopBtn.style.display = this.streaming ? '' : 'none'
  }

  private async send(): Promise<void> {
    if (!this.inputEl || this.streaming) return
    const text = this.inputEl.value.trim()
    // Permite enviar só com anexo (sem texto) — IA ainda dá Read na imagem
    if (!text && this.pendingAttachments.length === 0) return

    // Prefixa o conteúdo com [imagem: <path>] por anexo — a IA lê esses
    // paths via Read antes de responder (instrução no system prompt).
    const attachmentPrefix = this.pendingAttachments
      .map((a) => `[imagem: ${a.path}]`)
      .join('\n')
    const finalContent = attachmentPrefix
      ? text
        ? `${attachmentPrefix}\n${text}`
        : attachmentPrefix
      : text

    // Acumula paths das imagens deste turno pra apagar quando o agente
    // terminar (handleDone). clearAttachments revoga só as URLs de preview;
    // os arquivos no disco continuam existindo até o cleanup.
    for (const att of this.pendingAttachments) {
      this.pastesToCleanup.push(att.path)
    }

    this.inputEl.value = ''
    this.messagesSent.push({ role: 'user', content: finalContent })
    this.appendItem({ kind: 'message', role: 'user', content: finalContent, el: null })
    this.clearAttachments()
    this.currentTurnAssistantText = ''
    this.liveAssistantItem = null
    this.lastTurnWasPlan = this.mode === 'plan'
    this.streaming = true
    this.updateInputState()
    this.showThinking()

    try {
      await window.electronAPI.chat(this.messagesSent, this.mode)
    } catch (err) {
      this.handleError(String(err))
    }
  }

  /**
   * Envia um turno programático (sem ler o textarea) — usado ao aprovar um
   * plano pra disparar a implementação. Espelha o essencial de `send()`.
   */
  private async sendPrompt(content: string, mode: 'ask' | 'auto' | 'plan'): Promise<void> {
    if (this.streaming) return
    this.messagesSent.push({ role: 'user', content })
    this.appendItem({ kind: 'message', role: 'user', content, el: null })
    this.currentTurnAssistantText = ''
    this.liveAssistantItem = null
    this.lastTurnWasPlan = mode === 'plan'
    this.streaming = true
    this.updateInputState()
    this.showThinking()
    try {
      await window.electronAPI.chat(this.messagesSent, mode)
    } catch (err) {
      this.handleError(String(err))
    }
  }

  private handleChunk(text: string): void {
    this.hideThinking()
    this.currentTurnAssistantText += text
    if (!this.liveAssistantItem) {
      const item: DisplayItem = { kind: 'message', role: 'assistant', content: '', el: null }
      this.appendItem(item)
      this.liveAssistantItem = item
    }
    if (this.liveAssistantItem.kind === 'message') {
      this.liveAssistantItem.content += text
      const contentEl = this.liveAssistantItem.el?.querySelector('.chat-message-content')
      if (contentEl) contentEl.innerHTML = renderMarkdown(this.liveAssistantItem.content)
      this.scrollToBottom()
    }
  }

  private handleToolRequest(request: AiToolRequest): void {
    this.hideThinking()
    // Encerra o item de assistente em streaming (se houver) — próximas
    // chunks após esse tool call vão começar um novo item.
    this.liveAssistantItem = null
    const item: DisplayItem = { kind: 'tool', request, result: null, el: null }
    this.appendItem(item)
  }

  private handleToolExecuted(id: string, result: { content: string; isError: boolean }): void {
    const item = this.items.find(
      (i): i is Extract<DisplayItem, { kind: 'tool' }> => i.kind === 'tool' && i.request.id === id,
    )
    if (!item) return
    item.result = result
    this.renderToolCard(item)
    this.scrollToBottom()

    // Se a tool pode ter mexido no filesystem do projeto, sinaliza pra
    // FileTree recarregar a árvore. Leituras puras (Read/Glob/Grep) e
    // erros não precisam.
    const mutates = toolMutatesFs(item.request.name)
    console.debug('[chat] tool executed', {
      name: item.request.name,
      isError: result.isError,
      mutates,
    })
    if (!result.isError && mutates) {
      document.dispatchEvent(new CustomEvent('filetree-refresh'))
    }
  }

  private handleDone(stats: TurnStats | null): void {
    this.hideThinking()
    const hadText = this.currentTurnAssistantText.length > 0
    if (hadText) {
      this.messagesSent.push({ role: 'assistant', content: this.currentTurnAssistantText })
    }
    this.currentTurnAssistantText = ''
    this.liveAssistantItem = null
    this.streaming = false
    this.updateInputState()
    if (stats) this.appendStats(stats)
    this.saveHistory()
    this.cleanupPastes()
    // Modo plan: terminando com um plano, oferece Aprovar/Recusar.
    if (this.lastTurnWasPlan && hadText) {
      this.renderPlanActions()
    }
    this.lastTurnWasPlan = false
  }

  /**
   * Barra mostrada ao fim de um turno em modo plan: o usuário aprova (dispara a
   * implementação num turno auto) ou recusa (fica em plan pra refinar). ADR-0036.
   */
  private renderPlanActions(): void {
    if (!this.messagesEl) return
    const bar = document.createElement('div')
    bar.className = 'chat-plan-actions'

    const label = document.createElement('div')
    label.className = 'chat-plan-actions-label'
    label.textContent = t('chat.plan_ready')

    const buttons = document.createElement('div')
    buttons.className = 'chat-plan-actions-buttons'

    const approve = document.createElement('button')
    approve.className = 'chat-plan-approve'
    approve.textContent = t('chat.plan_approve')
    approve.addEventListener('click', () => {
      bar.remove()
      // Sai de plan pra executar. 'auto' implementa sem reaprovar cada edit — a
      // aprovação do plano já é o consentimento (ADR-0036). O usuário pode parar
      // a qualquer momento ou trocar o modo depois.
      this.mode = 'auto'
      localStorage.setItem('chat_mode', this.mode)
      this.renderModeToggle()
      void this.sendPrompt(t('chat.plan_approved_prompt'), 'auto')
    })

    const reject = document.createElement('button')
    reject.className = 'chat-plan-reject'
    reject.textContent = t('chat.plan_reject')
    reject.addEventListener('click', () => {
      // Continua em modo plan; o usuário digita o ajuste que quer no plano.
      bar.remove()
      this.inputEl?.focus()
    })

    buttons.appendChild(approve)
    buttons.appendChild(reject)
    bar.appendChild(label)
    bar.appendChild(buttons)
    this.messagesEl.appendChild(bar)
    this.scrollToBottom()
  }

  /**
   * Apaga do disco as imagens coladas usadas em turnos que já terminaram.
   * Trade-off: se o usuário pedir no turno seguinte 'olha aquela imagem',
   * a IA dará erro no Read — precisa colar de novo. Aceito em troca de não
   * acumular .cortex/paste/ indefinidamente.
   */
  private cleanupPastes(): void {
    if (this.pastesToCleanup.length === 0) return
    const paths = this.pastesToCleanup
    this.pastesToCleanup = []
    for (const path of paths) {
      void window.electronAPI.deleteClipboardImage(path)
    }
  }

  private appendStats(stats: TurnStats): void {
    if (!this.messagesEl) return
    const el = document.createElement('div')
    el.className = 'chat-turn-stats'
    el.title =
      `input: ${stats.inputTokens} tokens\n` +
      `output: ${stats.outputTokens} tokens\n` +
      `cache hit: ${stats.cacheReadTokens} tokens`
    el.textContent =
      `${formatDuration(stats.durationMs)} · ${formatCost(stats.costUsd)} · ` +
      `${formatTokens(stats.inputTokens)} in / ${formatTokens(stats.outputTokens)} out`
    this.messagesEl.appendChild(el)
    this.scrollToBottom()
  }

  private handleError(message: string): void {
    this.hideThinking()
    this.liveAssistantItem = null
    this.appendItem({
      kind: 'message',
      role: 'assistant',
      content: `❌ ${message}`,
      el: null,
    })
    this.currentTurnAssistantText = ''
    this.streaming = false
    this.lastTurnWasPlan = false
    this.updateInputState()
    // Mesmo em erro, a IA já recebeu as imagens (ou tentou) — limpa o disco.
    this.cleanupPastes()
  }

  // ── Indicador "Pensando..." ─────────────────────────────────────────────────

  private showThinking(): void {
    if (!this.messagesEl || this.thinkingEl) return
    const el = document.createElement('div')
    el.className = 'chat-thinking'
    const label = document.createElement('span')
    label.className = 'chat-thinking-label'
    label.textContent = t('chat.thinking')
    const dots = document.createElement('span')
    dots.className = 'chat-thinking-dots'
    dots.innerHTML = '<span></span><span></span><span></span>'
    el.appendChild(label)
    el.appendChild(dots)
    this.messagesEl.appendChild(el)
    this.thinkingEl = el
    this.scrollToBottom()
  }

  private hideThinking(): void {
    if (!this.thinkingEl) return
    this.thinkingEl.remove()
    this.thinkingEl = null
  }

  private appendItem(item: DisplayItem): void {
    if (!this.messagesEl) return
    if (this.items.length === 0) {
      this.messagesEl.innerHTML = ''
    }
    this.items.push(item)
    if (item.kind === 'message') {
      item.el = this.buildMessageEl(item.role, item.content)
    } else {
      item.el = this.buildToolCardEl(item)
    }
    this.messagesEl.appendChild(item.el)
    this.scrollToBottom()
  }

  private buildMessageEl(role: 'user' | 'assistant', content: string): HTMLElement {
    const el = document.createElement('div')
    el.className = `chat-message chat-message--${role}`
    const roleEl = document.createElement('div')
    roleEl.className = 'chat-message-role'
    roleEl.textContent = role === 'user' ? t('chat.role_user') : t('chat.role_assistant')
    const contentEl = document.createElement('div')
    contentEl.className = 'chat-message-content'
    if (role === 'assistant') {
      // Mensagens do assistente são markdown
      contentEl.innerHTML = renderMarkdown(content)
    } else {
      // Mensagens do usuário: extrai os [imagem: <path>] e renderiza como
      // chips inline; o resto do texto fica como texto plano.
      const { textOnly, attachments } = extractImageRefs(content)
      for (const path of attachments) {
        const chip = document.createElement('span')
        chip.className = 'chat-message-attachment'
        const icon = document.createElement('span')
        icon.className = 'chat-message-attachment-icon'
        icon.textContent = '📎'
        const name = document.createElement('span')
        name.textContent = path.split('/').pop() ?? path
        chip.appendChild(icon)
        chip.appendChild(name)
        contentEl.appendChild(chip)
      }
      if (textOnly) {
        const textNode = document.createElement('div')
        textNode.className = 'chat-message-text'
        textNode.textContent = textOnly
        contentEl.appendChild(textNode)
      }
    }
    el.appendChild(roleEl)
    el.appendChild(contentEl)
    return el
  }

  private buildToolCardEl(item: Extract<DisplayItem, { kind: 'tool' }>): HTMLElement {
    const el = document.createElement('div')
    el.className = 'chat-tool-card'

    const header = document.createElement('div')
    header.className = 'chat-tool-card-header'
    const name = document.createElement('span')
    name.className = 'chat-tool-card-name'
    name.textContent = item.request.name
    const summary = document.createElement('span')
    summary.className = 'chat-tool-card-summary'
    summary.textContent = item.request.summary
    header.appendChild(name)
    header.appendChild(summary)
    el.appendChild(header)

    const details = document.createElement('details')
    details.className = 'chat-tool-card-details'
    const detSummary = document.createElement('summary')
    detSummary.textContent = t('chat.params')
    const params = document.createElement('pre')
    params.className = 'chat-tool-card-params'
    params.textContent = JSON.stringify(item.request.input, null, 2)
    details.appendChild(detSummary)
    details.appendChild(params)
    el.appendChild(details)

    if (item.request.needsApproval && item.result === null) {
      const actions = document.createElement('div')
      actions.className = 'chat-tool-card-actions'
      const approve = document.createElement('button')
      approve.className = 'chat-tool-approve'
      approve.textContent = t('chat.approve')
      approve.addEventListener('click', () => {
        void window.electronAPI.decideToolCall(item.request.id, true)
        approve.disabled = true
        deny.disabled = true
        this.setToolStatus(el, t('chat.tool_running'))
      })
      const deny = document.createElement('button')
      deny.className = 'chat-tool-deny'
      deny.textContent = t('chat.deny')
      deny.addEventListener('click', () => {
        void window.electronAPI.decideToolCall(item.request.id, false)
        approve.disabled = true
        deny.disabled = true
        this.setToolStatus(el, t('chat.tool_denied'))
      })
      actions.appendChild(approve)
      actions.appendChild(deny)
      el.appendChild(actions)
    } else if (!item.request.needsApproval && item.result === null) {
      this.setToolStatus(el, t('chat.tool_running'))
    }

    return el
  }

  private renderToolCard(item: Extract<DisplayItem, { kind: 'tool' }>): void {
    if (!item.el) return
    // Remove ações e status anteriores; substitui pelo resultado.
    const actions = item.el.querySelector('.chat-tool-card-actions')
    if (actions) actions.remove()
    const prevStatus = item.el.querySelector('.chat-tool-card-status')
    if (prevStatus) prevStatus.remove()

    if (item.result) {
      const result = document.createElement('div')
      result.className = `chat-tool-card-result ${
        item.result.isError ? 'chat-tool-card-result--error' : 'chat-tool-card-result--ok'
      }`
      const label = document.createElement('div')
      label.className = 'chat-tool-card-result-label'
      label.textContent = item.result.isError ? t('chat.tool_error') : t('chat.tool_success')
      const body = document.createElement('pre')
      body.className = 'chat-tool-card-result-body'
      body.textContent = item.result.content.slice(0, 2000)
      if (item.result.content.length > 2000) {
        body.textContent += `\n${t('chat.tool_truncated', { n: item.result.content.length - 2000 })}`
      }
      result.appendChild(label)
      result.appendChild(body)
      item.el.appendChild(result)
    }
  }

  private setToolStatus(cardEl: HTMLElement, text: string): void {
    const prev = cardEl.querySelector('.chat-tool-card-status')
    if (prev) prev.remove()
    const status = document.createElement('div')
    status.className = 'chat-tool-card-status'
    status.textContent = text
    cardEl.appendChild(status)
  }

  private renderAll(): void {
    if (!this.messagesEl) return
    if (this.items.length === 0) {
      this.messagesEl.innerHTML = `<p class="chat-empty">${t('chat.empty')}</p>`
      return
    }
    this.messagesEl.innerHTML = ''
    for (const item of this.items) {
      if (item.kind === 'message') {
        item.el = this.buildMessageEl(item.role, item.content)
      } else {
        item.el = this.buildToolCardEl(item)
        if (item.result) this.renderToolCard(item)
      }
      this.messagesEl.appendChild(item.el)
    }
    this.scrollToBottom()
  }

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed
    this.container.classList.toggle('chat-collapsed', this.collapsed)
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.collapsed ? '◂' : '▸'
      this.toggleBtn.title = this.collapsed ? t('chat.tooltip_expand') : t('chat.tooltip_minimize')
    }
    document.dispatchEvent(
      new CustomEvent('chat-collapsed-change', { detail: { collapsed: this.collapsed } }),
    )
  }

  private scrollToBottom(): void {
    if (!this.messagesEl) return
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }
}
