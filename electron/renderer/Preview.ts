// Regex que captura a URL local do vite a partir do stdout — algo como
// "Local:   http://localhost:5174/". O vite imprime com códigos ANSI de
// cor (ex.: \x1b[36m antes do URL), então strippamos antes de procurar.
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g
const VITE_LOCAL_URL_RE = /Local:\s+(https?:\/\/[^\s]+)/

const STORAGE_KEY = 'preview_projectDir'

/**
 * Painel direito superior: botão Play/Stop e iframe do projeto rodando.
 * Logs do `vite` que ele dispara via electronAPI.runProject vão para o
 * BottomPanel (abas Console/Terminal) — este componente apenas escuta o
 * canal `log` para detectar a URL local do dev server.
 */
export class Preview {
  private container: HTMLElement

  private statusEl: HTMLElement | null = null
  private playBtn: HTMLButtonElement | null = null
  private fullscreenBtn: HTMLButtonElement | null = null
  private viewportEl: HTMLElement | null = null

  private projectDir: string | null = null
  private running = false
  private serverUrl: string | null = null
  private fullscreen = false

  constructor(container: HTMLElement) {
    this.container = container
    this.projectDir = localStorage.getItem(STORAGE_KEY)
  }

  init(): void {
    this.buildShell()
    this.updateButtonState()

    window.electronAPI.onLog((line) => this.handleLogLine(line))
    window.electronAPI.onProjectStopped(() => this.handleStopped())

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.projectDir = path
      localStorage.setItem(STORAGE_KEY, path)
      this.updateButtonState()
    })

    // ESC sai do fullscreen (sem afetar outros atalhos quando não está em fs)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.fullscreen) {
        this.toggleFullscreen()
      }
    })
  }

  private buildShell(): void {
    this.container.innerHTML = ''

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

    // Fullscreen toggle — esconde todo o resto da UI do IDE e expande o
    // preview pra ocupar toda a janela. ESC sai.
    const fullscreenBtn = document.createElement('button')
    fullscreenBtn.className = 'preview-fullscreen-btn'
    fullscreenBtn.type = 'button'
    fullscreenBtn.title = 'Tela cheia (ESC para sair)'
    fullscreenBtn.textContent = '⛶'
    fullscreenBtn.addEventListener('click', () => this.toggleFullscreen())
    this.fullscreenBtn = fullscreenBtn

    toolbar.appendChild(playBtn)
    toolbar.appendChild(status)
    toolbar.appendChild(fullscreenBtn)

    const viewport = document.createElement('div')
    viewport.className = 'preview-viewport'
    viewport.innerHTML = '<p class="preview-placeholder">Clique em Play para executar o projeto.</p>'
    this.viewportEl = viewport

    this.container.appendChild(toolbar)
    this.container.appendChild(viewport)
  }

  private toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen
    document.body.classList.toggle('app-preview-fullscreen', this.fullscreen)
    if (this.fullscreenBtn) {
      this.fullscreenBtn.textContent = this.fullscreen ? '⛶ Sair' : '⛶'
      this.fullscreenBtn.title = this.fullscreen
        ? 'Sair da tela cheia (ESC)'
        : 'Tela cheia (ESC para sair)'
    }
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

  private async toggle(): Promise<void> {
    if (this.running) {
      await window.electronAPI.stopProject()
    } else {
      if (!this.projectDir) return
      this.running = true
      this.serverUrl = null
      this.updateButtonState()
      document.dispatchEvent(new CustomEvent('play-started'))
      try {
        await window.electronAPI.runProject(this.projectDir)
      } catch (err) {
        console.error('Erro ao iniciar projeto:', err)
        this.running = false
        this.updateButtonState()
        document.dispatchEvent(new CustomEvent('play-stopped'))
      }
    }
  }

  private handleLogLine(line: string): void {
    if (this.serverUrl) return
    const clean = line.replace(ANSI_ESCAPE_RE, '')
    const match = clean.match(VITE_LOCAL_URL_RE)
    if (match) {
      this.serverUrl = match[1]
      this.showIframe(this.serverUrl)
      this.updateButtonState()
    }
  }

  private handleStopped(): void {
    this.running = false
    const startedSuccessfully = this.serverUrl !== null
    this.serverUrl = null
    if (this.viewportEl) {
      // Se nunca detectamos a URL do vite, é provável que tenha falhado a
      // inicializar — orienta o usuário a instalar deps.
      this.viewportEl.innerHTML = startedSuccessfully
        ? '<p class="preview-placeholder">Projeto parado.</p>'
        : '<p class="preview-placeholder">Projeto falhou ao iniciar.<br>Veja o Console. Se faltar o <code>vite</code>, rode <code>yarn install</code> no Terminal.</p>'
    }
    this.updateButtonState()
    document.dispatchEvent(new CustomEvent('play-stopped'))
  }

  private showIframe(url: string): void {
    if (!this.viewportEl) return
    this.viewportEl.innerHTML = ''
    const iframe = document.createElement('iframe')
    iframe.className = 'preview-iframe'
    iframe.src = url
    this.viewportEl.appendChild(iframe)
  }
}
