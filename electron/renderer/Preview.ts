import { t } from './i18n'
import { EditorPanels } from './EditorPanels'

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
  /** Onde o iframe/placeholder do jogo é trocado (à esquerda dos painéis). */
  private stageEl: HTMLElement | null = null
  /** Host persistente dos painéis do editor (ADR-0056) — não recriado no rebuild. */
  private panelsHostEl: HTMLElement | null = null
  private panels: EditorPanels | null = null

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

    // Painéis do editor (hierarquia + inspector) como chrome da IDE (ADR-0056).
    // Criado uma vez; o host é re-parentado no rebuild (mantém estado/listeners).
    if (!this.panels && this.panelsHostEl) {
      this.panels = new EditorPanels(this.panelsHostEl)
      this.panels.init()
    }

    window.electronAPI.onLog((line) => this.handleLogLine(line))
    window.electronAPI.onProjectStopped(() => this.handleStopped())

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.projectDir = path
      localStorage.setItem(STORAGE_KEY, path)
      this.updateButtonState()
      // Unity-style: o canvas SEMPRE roda (começa em modo editor). Auto-inicia o
      // dev server ao abrir o projeto — não há "ligar/desligar" o canvas.
      if (!this.running) void this.toggle()
    })

    // Fechar projeto: para o jogo se estiver rodando e zera o estado.
    document.addEventListener('project-close', () => {
      if (this.running) void window.electronAPI.stopProject()
      this.projectDir = null
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

    // Reiniciar o jogo (botão restart da toolbar): recarrega o iframe do canvas
    // — volta pro modo editor com o estado fresco. Se o canvas não estiver de pé
    // ainda, sobe ele.
    document.addEventListener('request-canvas-reload', () => {
      const iframe = this.stageEl?.querySelector('iframe') as HTMLIFrameElement | null
      if (iframe && this.serverUrl) iframe.src = this.serverUrl
      else if (this.projectDir && !this.running) void this.toggle()
    })
    // Fullscreen agora dispara pelo ícone "expandir" da toolbar da casca.
    document.addEventListener('request-fullscreen-toggle', () => this.toggleFullscreen())
  }

  private buildShell(): void {
    this.container.innerHTML = ''

    // O transport (Play/Stop) e o fullscreen vivem na toolbar da casca nova
    // (Shell). O Preview fica só com o viewport (palco do jogo + painéis).
    const viewport = document.createElement('div')
    viewport.className = 'preview-viewport'
    this.viewportEl = viewport

    // Palco do jogo (iframe/placeholder são trocados aqui) à esquerda dos painéis.
    const stage = document.createElement('div')
    stage.className = 'preview-stage'
    stage.innerHTML = `<p class="preview-placeholder">${t('preview.placeholder_start')}</p>`
    this.stageEl = stage

    // Host dos painéis do editor — criado uma vez e re-parentado no rebuild, pra
    // não recriar o EditorPanels (e seu listener de message) a cada troca de idioma.
    if (!this.panelsHostEl) {
      this.panelsHostEl = document.createElement('div')
    }

    viewport.appendChild(stage)
    viewport.appendChild(this.panelsHostEl)

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
    if (this.stageEl) {
      // Se nunca detectamos a URL do vite, é provável que tenha falhado a
      // inicializar — orienta o usuário a instalar deps.
      this.stageEl.innerHTML = startedSuccessfully
        ? `<p class="preview-placeholder">${t('preview.placeholder_stopped')}</p>`
        : `<p class="preview-placeholder">${t('preview.placeholder_failed_html')}</p>`
    }
    this.updateButtonState()
    document.dispatchEvent(new CustomEvent('play-stopped'))
  }

  private showIframe(url: string): void {
    if (!this.stageEl) return
    this.stageEl.innerHTML = ''
    const iframe = document.createElement('iframe')
    iframe.className = 'preview-iframe'
    iframe.src = url
    this.stageEl.appendChild(iframe)
  }
}
