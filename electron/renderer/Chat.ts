interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Sidebar de chat IA (ADR-0014, V1 do PRD-0001).
 * - Histórico em memória (V1) — zerado ao trocar de projeto.
 * - Streaming de respostas via canais ai:chunk / ai:done / ai:error.
 */
export class Chat {
  private container: HTMLElement

  private messagesEl: HTMLElement | null = null
  private inputEl: HTMLTextAreaElement | null = null
  private sendBtn: HTMLButtonElement | null = null
  private toggleBtn: HTMLButtonElement | null = null

  private messages: ChatMessage[] = []
  private projectDir: string | null = null
  private streamingMessageEl: HTMLElement | null = null
  private streaming = false
  private collapsed = false

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    this.buildShell()
    this.updateInputState()

    window.electronAPI.onAiChunk((text) => this.handleChunk(text))
    window.electronAPI.onAiDone(() => this.handleDone())
    window.electronAPI.onAiError((message) => this.handleError(message))

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (path !== this.projectDir) {
        this.projectDir = path
        // Conversas não vazam entre projetos (PRD-0001 / ADR-0014)
        this.messages = []
        this.renderMessages()
      }
      this.updateInputState()
    })
  }

  private buildShell(): void {
    this.container.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'chat-header'

    const title = document.createElement('span')
    title.className = 'chat-header-title'
    title.textContent = 'Chat IA'

    const toggleBtn = document.createElement('button')
    toggleBtn.className = 'chat-toggle-btn'
    toggleBtn.type = 'button'
    toggleBtn.title = 'Minimizar chat'
    toggleBtn.setAttribute('aria-label', 'Minimizar chat')
    toggleBtn.textContent = '▸'
    toggleBtn.addEventListener('click', () => this.toggleCollapsed())
    this.toggleBtn = toggleBtn

    header.appendChild(title)
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

    inputRow.appendChild(input)
    inputRow.appendChild(sendBtn)

    this.container.appendChild(header)
    this.container.appendChild(messages)
    this.container.appendChild(inputRow)
  }

  private updateInputState(): void {
    if (!this.inputEl || !this.sendBtn) return
    const enabled = !this.streaming
    this.inputEl.disabled = !enabled
    this.sendBtn.disabled = !enabled
    this.sendBtn.textContent = this.streaming ? 'Aguardando...' : 'Enviar'
  }

  private async send(): Promise<void> {
    if (!this.inputEl || this.streaming) return
    const text = this.inputEl.value.trim()
    if (!text) return

    this.inputEl.value = ''
    this.messages.push({ role: 'user', content: text })
    this.streaming = true
    this.streamingMessageEl = null
    this.renderMessages()
    this.updateInputState()

    try {
      await window.electronAPI.chat(this.messages)
    } catch (err) {
      this.handleError(String(err))
    }
  }

  private handleChunk(text: string): void {
    // Lazy-cria a mensagem do assistant na primeira chunk
    if (!this.streamingMessageEl) {
      this.messages.push({ role: 'assistant', content: '' })
      this.renderMessages()
      // O último .chat-message renderizado é o do assistant em streaming
      this.streamingMessageEl = this.messagesEl?.querySelector(
        '.chat-message:last-child .chat-message-content',
      ) as HTMLElement | null
    }
    const last = this.messages[this.messages.length - 1]
    last.content += text
    if (this.streamingMessageEl) {
      this.streamingMessageEl.textContent = last.content
      this.scrollToBottom()
    }
  }

  private handleDone(): void {
    this.streaming = false
    this.streamingMessageEl = null
    this.updateInputState()
  }

  private handleError(message: string): void {
    this.streaming = false
    this.streamingMessageEl = null
    this.messages.push({ role: 'assistant', content: `❌ ${message}` })
    this.renderMessages()
    this.updateInputState()
  }

  private renderMessages(): void {
    if (!this.messagesEl) return
    if (this.messages.length === 0) {
      this.messagesEl.innerHTML = '<p class="chat-empty">Pergunte algo sobre o projeto.</p>'
      return
    }
    this.messagesEl.innerHTML = ''
    for (const msg of this.messages) {
      const el = document.createElement('div')
      el.className = `chat-message chat-message--${msg.role}`

      const role = document.createElement('div')
      role.className = 'chat-message-role'
      role.textContent = msg.role === 'user' ? 'Você' : 'Assistente'

      const content = document.createElement('div')
      content.className = 'chat-message-content'
      content.textContent = msg.content

      el.appendChild(role)
      el.appendChild(content)
      this.messagesEl.appendChild(el)
    }
    this.scrollToBottom()
  }

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed
    this.container.classList.toggle('chat-collapsed', this.collapsed)
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.collapsed ? '◂' : '▸'
      this.toggleBtn.title = this.collapsed ? 'Expandir chat' : 'Minimizar chat'
      this.toggleBtn.setAttribute(
        'aria-label',
        this.collapsed ? 'Expandir chat' : 'Minimizar chat',
      )
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
