import { t } from './i18n'

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
  private editBtn: HTMLButtonElement | null = null
  private fullscreenBtn: HTMLButtonElement | null = null
  private viewportEl: HTMLElement | null = null
  private iframeEl: HTMLIFrameElement | null = null

  private projectDir: string | null = null
  private running = false
  private serverUrl: string | null = null
  private fullscreen = false
  /** Estado do SceneEditor do jogo — sincronizado via postMessage. */
  private editMode = false

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

    document.addEventListener('locale-change', () => {
      this.buildShell()
      this.updateButtonState()
    })
  }

  private buildShell(): void {
    this.container.innerHTML = ''

    const toolbar = document.createElement('div')
    toolbar.className = 'preview-toolbar'

    const playBtn = document.createElement('button')
    playBtn.className = 'preview-play-btn'
    playBtn.textContent = t('preview.play')
    playBtn.addEventListener('click', () => void this.toggle())
    this.playBtn = playBtn

    // Botão Editar — dispara SceneEditor no jogo via postMessage.
    // Habilitado só quando o jogo está rodando (precisa de iframe ativo).
    const editBtn = document.createElement('button')
    editBtn.className = 'preview-edit-btn'
    editBtn.type = 'button'
    editBtn.textContent = '✎ Edit'
    editBtn.title = 'Toggle Scene Editor (F8 no jogo)'
    editBtn.addEventListener('click', () => this.toggleEditMode())
    this.editBtn = editBtn

    const status = document.createElement('span')
    status.className = 'preview-status'
    status.textContent = t('preview.status_stopped')
    this.statusEl = status

    // Fullscreen toggle — esconde todo o resto da UI do IDE e expande o
    // preview pra ocupar toda a janela. ESC sai.
    const fullscreenBtn = document.createElement('button')
    fullscreenBtn.className = 'preview-fullscreen-btn'
    fullscreenBtn.type = 'button'
    fullscreenBtn.title = t('preview.tooltip_fullscreen')
    fullscreenBtn.textContent = '⛶'
    fullscreenBtn.addEventListener('click', () => this.toggleFullscreen())
    this.fullscreenBtn = fullscreenBtn

    toolbar.appendChild(playBtn)
    toolbar.appendChild(editBtn)
    toolbar.appendChild(status)
    toolbar.appendChild(fullscreenBtn)

    const viewport = document.createElement('div')
    viewport.className = 'preview-viewport'
    viewport.innerHTML = `<p class="preview-placeholder">${t('preview.placeholder_start')}</p>`
    this.viewportEl = viewport

    this.container.appendChild(toolbar)
    this.container.appendChild(viewport)
  }

  private toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen
    document.body.classList.toggle('app-preview-fullscreen', this.fullscreen)
    if (this.fullscreenBtn) {
      this.fullscreenBtn.textContent = this.fullscreen ? t('preview.fullscreen_exit') : '⛶'
      this.fullscreenBtn.title = this.fullscreen
        ? t('preview.tooltip_exit_fullscreen')
        : t('preview.tooltip_fullscreen')
    }
  }

  private updateButtonState(): void {
    if (!this.playBtn || !this.statusEl) return
    this.playBtn.disabled = !this.projectDir
    if (this.editBtn) {
      // Editar só faz sentido com jogo rodando (precisa de iframe ativo).
      this.editBtn.disabled = !this.running || !this.serverUrl
      this.editBtn.textContent = this.editMode ? '▶ Play' : '✎ Edit'
      this.editBtn.classList.toggle('preview-edit-btn--active', this.editMode)
    }
    if (!this.projectDir) {
      this.playBtn.textContent = t('preview.play')
      this.statusEl.textContent = t('preview.status_no_project')
      return
    }
    if (this.running) {
      this.playBtn.textContent = t('preview.stop')
      this.statusEl.textContent = this.serverUrl
        ? t('preview.status_running')
        : t('preview.status_starting')
    } else {
      this.playBtn.textContent = t('preview.play')
      this.statusEl.textContent = t('preview.status_stopped')
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
        ? `<p class="preview-placeholder">${t('preview.placeholder_stopped')}</p>`
        : `<p class="preview-placeholder">${t('preview.placeholder_failed_html')}</p>`
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
    this.iframeEl = iframe
    // Sai do modo Edit ao trocar/recarregar — o SceneEditor do jogo
    // anterior morreu junto com o iframe.
    this.editMode = false
    this.updateButtonState()
  }

  /**
   * Liga/desliga o SceneEditor do jogo via postMessage (ADR-0026 Fase 1).
   * O bundle do jogo escuta `cortex:editor:enable` / `disable` no `window`
   * (módulo `SceneEditor` do engine) e troca a câmera + monta inspector
   * sem que a IDE precise saber detalhes do runtime do jogo.
   */
  private toggleEditMode(): void {
    if (!this.iframeEl?.contentWindow || !this.running || !this.serverUrl) return
    this.editMode = !this.editMode
    const type = this.editMode ? 'cortex:editor:enable' : 'cortex:editor:disable'
    this.iframeEl.contentWindow.postMessage({ type }, '*')
    this.updateButtonState()
  }
}
