// Regex que captura a URL local do vite a partir do stdout — algo como
// "Local:   http://localhost:5174/"
const VITE_LOCAL_URL_RE = /Local:\s+(https?:\/\/[^\s]+)/

const STORAGE_KEY = 'preview_projectDir'

export class Preview {
  private previewContainer: HTMLElement
  private consoleContainer: HTMLElement

  private statusEl: HTMLElement | null = null
  private playBtn: HTMLButtonElement | null = null
  private viewportEl: HTMLElement | null = null
  private consoleOutputEl: HTMLElement | null = null

  private projectDir: string | null = null
  private running = false
  private serverUrl: string | null = null

  constructor(previewContainer: HTMLElement, consoleContainer: HTMLElement) {
    this.previewContainer = previewContainer
    this.consoleContainer = consoleContainer
    this.projectDir = localStorage.getItem(STORAGE_KEY)
  }

  init(): void {
    this.buildPreview()
    this.buildConsole()
    this.updateButtonState()

    window.electronAPI.onLog((line) => this.handleLogLine(line))
    window.electronAPI.onProjectStopped(() => this.handleStopped())

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.projectDir = path
      localStorage.setItem(STORAGE_KEY, path)
      this.updateButtonState()
    })
  }

  // ── UI ──────────────────────────────────────────────────────────────────────

  private buildPreview(): void {
    this.previewContainer.innerHTML = ''

    const toolbar = document.createElement('div')
    toolbar.className = 'preview-toolbar'

    const playBtn = document.createElement('button')
    playBtn.className = 'preview-play-btn'
    playBtn.textContent = '▶ Play'
    playBtn.addEventListener('click', () => void this.toggle())
    this.playBtn = playBtn

    const status = document.createElement('span')
    status.className = 'preview-status'
    status.textContent = 'Parado'
    this.statusEl = status

    toolbar.appendChild(playBtn)
    toolbar.appendChild(status)

    const viewport = document.createElement('div')
    viewport.className = 'preview-viewport'
    viewport.innerHTML = '<p class="preview-placeholder">Clique em Play para executar o projeto.</p>'
    this.viewportEl = viewport

    this.previewContainer.appendChild(toolbar)
    this.previewContainer.appendChild(viewport)
  }

  private buildConsole(): void {
    this.consoleContainer.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'console-header'

    const title = document.createElement('span')
    title.className = 'console-title'
    title.textContent = 'Console'

    const clearBtn = document.createElement('button')
    clearBtn.className = 'console-clear-btn'
    clearBtn.textContent = 'Limpar'
    clearBtn.addEventListener('click', () => {
      if (this.consoleOutputEl) this.consoleOutputEl.innerHTML = ''
    })

    header.appendChild(title)
    header.appendChild(clearBtn)

    const output = document.createElement('div')
    output.className = 'console-output'
    this.consoleOutputEl = output

    this.consoleContainer.appendChild(header)
    this.consoleContainer.appendChild(output)
  }

  private updateButtonState(): void {
    if (!this.playBtn || !this.statusEl) return
    this.playBtn.disabled = !this.projectDir
    if (!this.projectDir) {
      this.playBtn.textContent = '▶ Play'
      this.statusEl.textContent = 'Sem projeto'
      return
    }
    if (this.running) {
      this.playBtn.textContent = '■ Stop'
      this.statusEl.textContent = this.serverUrl ? 'Rodando' : 'Iniciando...'
    } else {
      this.playBtn.textContent = '▶ Play'
      this.statusEl.textContent = 'Parado'
    }
  }

  // ── Ações ───────────────────────────────────────────────────────────────────

  private async toggle(): Promise<void> {
    if (this.running) {
      await this.stop()
    } else {
      await this.start()
    }
  }

  private async start(): Promise<void> {
    if (!this.projectDir || this.running) return
    this.running = true
    this.serverUrl = null
    this.updateButtonState()
    this.appendLog('▶ Iniciando projeto...\n', 'system')

    try {
      await window.electronAPI.runProject(this.projectDir)
    } catch (err) {
      this.appendLog(`Erro ao iniciar: ${String(err)}\n`, 'error')
      this.running = false
      this.updateButtonState()
    }
  }

  private async stop(): Promise<void> {
    try {
      await window.electronAPI.stopProject()
    } catch (err) {
      this.appendLog(`Erro ao parar: ${String(err)}\n`, 'error')
    }
  }

  // ── Eventos do main process ─────────────────────────────────────────────────

  private handleLogLine(line: string): void {
    this.appendLog(line, 'log')

    // Detecta a URL local do dev server e injeta o iframe
    if (!this.serverUrl) {
      const match = line.match(VITE_LOCAL_URL_RE)
      if (match) {
        this.serverUrl = match[1]
        this.showIframe(this.serverUrl)
        this.updateButtonState()
      }
    }
  }

  private handleStopped(): void {
    this.running = false
    this.serverUrl = null
    if (this.viewportEl) {
      this.viewportEl.innerHTML = '<p class="preview-placeholder">Projeto parado.</p>'
    }
    this.appendLog('■ Projeto parado.\n', 'system')
    this.updateButtonState()
  }

  private showIframe(url: string): void {
    if (!this.viewportEl) return
    this.viewportEl.innerHTML = ''
    const iframe = document.createElement('iframe')
    iframe.className = 'preview-iframe'
    iframe.src = url
    this.viewportEl.appendChild(iframe)
  }

  // ── Console ─────────────────────────────────────────────────────────────────

  private appendLog(text: string, kind: 'log' | 'error' | 'system'): void {
    if (!this.consoleOutputEl) return
    const line = document.createElement('div')
    line.className = `console-line console-line--${kind}`
    line.textContent = text
    this.consoleOutputEl.appendChild(line)
    this.consoleOutputEl.scrollTop = this.consoleOutputEl.scrollHeight
  }
}
