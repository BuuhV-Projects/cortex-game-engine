import { AiToolRequest } from "./types";

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
  if (usd === 0) return 'grátis'
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
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

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (path !== this.projectDir) {
        this.projectDir = path
        this.messagesSent = []
        this.items = []
        this.currentTurnAssistantText = ''
        this.liveAssistantItem = null
        void window.electronAPI.setActiveProject(path)
        void this.loadHistory(path)
      }
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

  /** Apaga o histórico do projeto ativo e limpa a UI. */
  private async clearHistory(): Promise<void> {
    if (!this.projectDir) return
    const ok = window.confirm('Apagar todo o histórico do chat deste projeto?')
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
    title.textContent = 'Chat IA'
    const clearBtn = document.createElement('button')
    clearBtn.className = 'chat-clear-btn'
    clearBtn.type = 'button'
    clearBtn.title = 'Apagar histórico'
    clearBtn.textContent = '🗑'
    clearBtn.addEventListener('click', () => void this.clearHistory())

    const toggleBtn = document.createElement('button')
    toggleBtn.className = 'chat-toggle-btn'
    toggleBtn.type = 'button'
    toggleBtn.title = 'Minimizar chat'
    toggleBtn.textContent = '▸'
    toggleBtn.addEventListener('click', () => this.toggleCollapsed())
    this.toggleBtn = toggleBtn
    header.appendChild(title)
    header.appendChild(clearBtn)
    header.appendChild(toggleBtn)

    const messages = document.createElement('div')
    messages.className = 'chat-messages'
    messages.innerHTML = '<p class="chat-empty">Pergunte algo sobre o projeto.</p>'
    this.messagesEl = messages

    const inputRow = document.createElement('div')
    inputRow.className = 'chat-input-row'

    const input = document.createElement('textarea')
    input.className = 'chat-input'
    input.rows = 2
    input.placeholder = 'Pergunte algo... (Enter envia, Shift+Enter quebra linha)'
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void this.send()
      }
    })
    this.inputEl = input

    const sendBtn = document.createElement('button')
    sendBtn.className = 'chat-send-btn'
    sendBtn.textContent = 'Enviar'
    sendBtn.addEventListener('click', () => void this.send())
    this.sendBtn = sendBtn

    const stopBtn = document.createElement('button')
    stopBtn.className = 'chat-stop-btn'
    stopBtn.textContent = 'Parar'
    stopBtn.style.display = 'none'
    stopBtn.addEventListener('click', () => void window.electronAPI.cancelChat())
    this.stopBtn = stopBtn

    inputRow.appendChild(input)
    inputRow.appendChild(sendBtn)
    inputRow.appendChild(stopBtn)

    this.container.appendChild(header)
    this.container.appendChild(messages)
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
    if (!text) return

    this.inputEl.value = ''
    this.messagesSent.push({ role: 'user', content: text })
    this.appendItem({ kind: 'message', role: 'user', content: text, el: null })
    this.currentTurnAssistantText = ''
    this.liveAssistantItem = null
    this.streaming = true
    this.updateInputState()
    this.showThinking()

    try {
      await window.electronAPI.chat(this.messagesSent)
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
      if (contentEl) contentEl.textContent = this.liveAssistantItem.content
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
    if (this.currentTurnAssistantText.length > 0) {
      this.messagesSent.push({ role: 'assistant', content: this.currentTurnAssistantText })
    }
    this.currentTurnAssistantText = ''
    this.liveAssistantItem = null
    this.streaming = false
    this.updateInputState()
    if (stats) this.appendStats(stats)
    this.saveHistory()
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
    this.updateInputState()
  }

  // ── Indicador "Pensando..." ─────────────────────────────────────────────────

  private showThinking(): void {
    if (!this.messagesEl || this.thinkingEl) return
    const el = document.createElement('div')
    el.className = 'chat-thinking'
    const label = document.createElement('span')
    label.className = 'chat-thinking-label'
    label.textContent = 'Pensando'
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
    roleEl.textContent = role === 'user' ? 'Você' : 'Assistente'
    const contentEl = document.createElement('div')
    contentEl.className = 'chat-message-content'
    contentEl.textContent = content
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
    detSummary.textContent = 'parâmetros'
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
      approve.textContent = 'Aprovar'
      approve.addEventListener('click', () => {
        void window.electronAPI.decideToolCall(item.request.id, true)
        approve.disabled = true
        deny.disabled = true
        this.setToolStatus(el, 'executando...')
      })
      const deny = document.createElement('button')
      deny.className = 'chat-tool-deny'
      deny.textContent = 'Negar'
      deny.addEventListener('click', () => {
        void window.electronAPI.decideToolCall(item.request.id, false)
        approve.disabled = true
        deny.disabled = true
        this.setToolStatus(el, 'negado')
      })
      actions.appendChild(approve)
      actions.appendChild(deny)
      el.appendChild(actions)
    } else if (!item.request.needsApproval && item.result === null) {
      this.setToolStatus(el, 'executando...')
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
      label.textContent = item.result.isError ? 'erro' : 'sucesso'
      const body = document.createElement('pre')
      body.className = 'chat-tool-card-result-body'
      body.textContent = item.result.content.slice(0, 2000)
      if (item.result.content.length > 2000) {
        body.textContent += `\n... (${item.result.content.length - 2000} caracteres truncados)`
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
      this.messagesEl.innerHTML = '<p class="chat-empty">Pergunte algo sobre o projeto.</p>'
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
      this.toggleBtn.title = this.collapsed ? 'Expandir chat' : 'Minimizar chat'
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
