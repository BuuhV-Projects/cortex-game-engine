import { t } from './i18n'

type TabId = 'console' | 'terminal'

const STORAGE_KEY = 'bottomPanel_projectDir'

// Remove códigos de cor ANSI (CSI SGR) — vite, yarn etc. emitem cores
// que viram lixo visual sem um parser ANSI. Em V1 só strippamos.
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g

/**
 * Painel inferior com abas Console e Terminal (ADR-0010 + ADR-0012).
 * - Console: recebe logs do `run:start` via electronAPI.onLog.
 * - Terminal: input + botão Executar; envia comandos arbitrários ao
 *   projeto via electronAPI.runTerminalCommand e exibe o output streaming.
 */
export class BottomPanel {
  private container: HTMLElement

  private tabBar: HTMLElement | null = null
  private consoleOutput: HTMLElement | null = null
  private terminalOutput: HTMLElement | null = null
  private terminalPane: HTMLElement | null = null
  private consolePane: HTMLElement | null = null
  private terminalInput: HTMLInputElement | null = null
  private terminalRunBtn: HTMLButtonElement | null = null

  private activeTab: TabId = 'console'
  private projectDir: string | null = null
  private terminalRunning = false
  /** Terminal fica bloqueado enquanto o jogo está rodando (Play ativo). */
  private playRunning = false

  constructor(container: HTMLElement) {
    this.container = container
    this.projectDir = localStorage.getItem(STORAGE_KEY)
  }

  init(): void {
    this.buildShell()
    this.updateTerminalButtons()

    window.electronAPI.onLog((line) => this.appendConsole(line, 'log'))
    window.electronAPI.onProjectStopped(() =>
      this.appendConsole(`■ ${t('bottomPanel.project_stopped')}\n`, 'system'),
    )

    window.electronAPI.onTerminalOutput((text) => this.appendTerminal(text, 'log'))
    window.electronAPI.onTerminalDone((code) => {
      this.terminalRunning = false
      this.appendTerminal(`\n${t('bottomPanel.process_exited', { code })}\n`, 'system')
      this.updateTerminalButtons()
    })

    document.addEventListener('locale-change', () => {
      this.buildShell()
      this.updateTerminalButtons()
    })

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.projectDir = path
      localStorage.setItem(STORAGE_KEY, path)
      this.updateTerminalButtons()
    })

    // Fechar projeto: zera o destino do terminal.
    document.addEventListener('project-close', () => {
      this.projectDir = null
      this.updateTerminalButtons()
    })

    // Projeto recém-criado: roda yarn install automaticamente (ADR-0013).
    // Garante que projectDir está setado antes de chamar runCommand.
    document.addEventListener('project-created', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.projectDir = path
      localStorage.setItem(STORAGE_KEY, path)
      this.activateTab('terminal')
      void this.runCommandForce('yarn install')
    })

    // Bloqueia o terminal enquanto o Play está ativo — evita que o usuário
    // rode comandos que podem interferir com o dev server em execução.
    document.addEventListener('play-started', () => {
      this.playRunning = true
      this.updateTerminalButtons()
    })
    document.addEventListener('play-stopped', () => {
      this.playRunning = false
      this.updateTerminalButtons()
    })

    // Menu nativo "Projeto > Gerar instalador..." (ADR-0024). Detecta
    // projetos legados (sem src-tauri/) e oferece setup automático antes
    // de tentar buildar. Reusa a infra do terminal embutido para logs.
    document.addEventListener('build-installer-requested', (e) => {
      const detail = (e as CustomEvent<{ debug?: boolean }>).detail
      void this.handleBuildInstaller({ debug: detail?.debug === true })
    })
  }

  /**
   * Fluxo do menu "Gerar instalador" (ADR-0024):
   *
   * 1. Valida estado (projeto aberto, Play parado, terminal livre).
   * 2. Pergunta ao main se o projeto tem Tauri configurado.
   *    - Não → confirma setup com o usuário, copia `src-tauri/` do template,
   *      mescla scripts/devDeps no package.json, encadeia `yarn install`
   *      e instrui sobre ícones. Para por aqui — o usuário gera ícones e
   *      dispara de novo.
   *    - Sim → roda `yarn tauri:build`.
   */
  private async handleBuildInstaller(opts: { debug?: boolean } = {}): Promise<void> {
    if (!this.projectDir) {
      alert(t('bottomPanel.installer_no_project'))
      return
    }
    if (this.playRunning) {
      alert(t('bottomPanel.installer_play_running'))
      return
    }
    if (this.terminalRunning) {
      alert(t('bottomPanel.installer_terminal_busy'))
      return
    }

    this.activateTab('terminal')

    const status = await window.electronAPI.installerCheck(this.projectDir)
    if (!status.configured) {
      const ok = confirm(t('bottomPanel.installer_confirm_setup'))
      if (!ok) return
      try {
        this.appendTerminal(t('bottomPanel.installer_configuring'), 'system')
        const result = await window.electronAPI.installerSetup(this.projectDir)
        this.appendTerminal(t('bottomPanel.installer_setup_done'), 'system')
        if (result.iconsGenerated) {
          this.appendTerminal(t('bottomPanel.installer_icons_generated'), 'system')
        }
        this.appendTerminal(t('bottomPanel.installer_next_steps'), 'system')
      } catch (err) {
        this.appendTerminal(`${t('bottomPanel.installer_setup_error')} ${String(err)}\n`, 'error')
        return
      }
      await this.runCommandForce('yarn install')
      return
    }

    // Release default ou debug (com DevTools embutido via feature Cargo).
    // O script `tauri:build:debug` precisa existir no package.json do
    // projeto — projetos novos saem com ele; projetos legados precisam
    // adicionar manualmente.
    const script = opts.debug === true ? 'yarn tauri:build:debug' : 'yarn tauri:build'
    await this.runCommandForce(script)
  }

  // ── Construção da UI ────────────────────────────────────────────────────────

  private buildShell(): void {
    this.container.innerHTML = ''

    this.tabBar = document.createElement('div')
    this.tabBar.className = 'bottom-tabs'
    this.tabBar.appendChild(this.makeTabButton('console', t('bottomPanel.tab_console')))
    this.tabBar.appendChild(this.makeTabButton('terminal', t('bottomPanel.tab_terminal')))

    const clearBtn = document.createElement('button')
    clearBtn.className = 'bottom-clear-btn'
    clearBtn.textContent = t('bottomPanel.clear')
    clearBtn.addEventListener('click', () => this.clearActive())
    this.tabBar.appendChild(clearBtn)

    this.container.appendChild(this.tabBar)
    this.container.appendChild(this.buildConsolePane())
    this.container.appendChild(this.buildTerminalPane())

    this.activateTab('console')
  }

  private makeTabButton(id: TabId, label: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'bottom-tab'
    btn.dataset['tab'] = id
    btn.textContent = label
    btn.addEventListener('click', () => this.activateTab(id))
    return btn
  }

  private buildConsolePane(): HTMLElement {
    const pane = document.createElement('div')
    pane.className = 'bottom-pane'
    const output = document.createElement('div')
    output.className = 'bottom-output'
    pane.appendChild(output)
    this.consolePane = pane
    this.consoleOutput = output
    return pane
  }

  private buildTerminalPane(): HTMLElement {
    const pane = document.createElement('div')
    pane.className = 'bottom-pane bottom-pane--terminal'

    const inputRow = document.createElement('div')
    inputRow.className = 'terminal-input-row'

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'terminal-input'
    input.placeholder = t('bottomPanel.placeholder_default')
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.runCommand()
    })
    this.terminalInput = input

    const runBtn = document.createElement('button')
    runBtn.className = 'terminal-run-btn'
    runBtn.textContent = t('bottomPanel.run')
    runBtn.addEventListener('click', () => void this.runCommand())
    this.terminalRunBtn = runBtn

    inputRow.appendChild(input)
    inputRow.appendChild(runBtn)

    const output = document.createElement('div')
    output.className = 'bottom-output'
    this.terminalOutput = output

    pane.appendChild(inputRow)
    pane.appendChild(output)
    this.terminalPane = pane
    return pane
  }

  // ── Tabs ────────────────────────────────────────────────────────────────────

  private activateTab(id: TabId): void {
    this.activeTab = id
    if (!this.tabBar) return
    for (const btn of this.tabBar.querySelectorAll<HTMLButtonElement>('.bottom-tab')) {
      btn.classList.toggle('active', btn.dataset['tab'] === id)
    }
    if (this.consolePane) this.consolePane.style.display = id === 'console' ? 'flex' : 'none'
    if (this.terminalPane) this.terminalPane.style.display = id === 'terminal' ? 'flex' : 'none'
  }

  private clearActive(): void {
    if (this.activeTab === 'console' && this.consoleOutput) {
      this.consoleOutput.innerHTML = ''
    } else if (this.activeTab === 'terminal' && this.terminalOutput) {
      this.terminalOutput.innerHTML = ''
    }
  }

  // ── Terminal ────────────────────────────────────────────────────────────────

  private async runCommand(): Promise<void> {
    if (!this.terminalInput) return
    if (this.terminalRunning) {
      await window.electronAPI.stopTerminalCommand()
      return
    }
    const cmd = this.terminalInput.value.trim()
    if (!cmd) return
    await this.runCommandForce(cmd)
  }

  /** Executa um comando específico (independente do input). Usado pelo
   *  setup automático de novo projeto (yarn install). */
  private async runCommandForce(cmd: string): Promise<void> {
    if (!this.projectDir) {
      this.appendTerminal(`${t('bottomPanel.open_first')}\n`, 'error')
      return
    }
    if (this.terminalRunning) return
    this.terminalRunning = true
    this.appendTerminal(`> ${cmd}\n`, 'system')
    this.updateTerminalButtons()
    try {
      await window.electronAPI.runTerminalCommand(this.projectDir, cmd)
    } catch (err) {
      this.appendTerminal(`${String(err)}\n`, 'error')
      this.terminalRunning = false
      this.updateTerminalButtons()
    }
  }

  private updateTerminalButtons(): void {
    if (!this.terminalRunBtn || !this.terminalInput) return
    this.terminalRunBtn.textContent = this.terminalRunning
      ? t('bottomPanel.stop')
      : t('bottomPanel.run')
    const blocked = this.playRunning || !this.projectDir
    this.terminalInput.disabled = blocked || this.terminalRunning
    this.terminalRunBtn.disabled = blocked && !this.terminalRunning
    if (!this.projectDir) {
      this.terminalInput.placeholder = t('bottomPanel.placeholder_no_project')
    } else if (this.playRunning) {
      this.terminalInput.placeholder = t('bottomPanel.placeholder_play_running')
    } else if (this.terminalRunning) {
      this.terminalInput.placeholder = t('bottomPanel.placeholder_running')
    } else {
      this.terminalInput.placeholder = t('bottomPanel.placeholder_default')
    }
  }

  // ── Output ──────────────────────────────────────────────────────────────────

  private appendConsole(text: string, kind: 'log' | 'error' | 'system'): void {
    this.appendTo(this.consoleOutput, text, kind)
  }

  private appendTerminal(text: string, kind: 'log' | 'error' | 'system'): void {
    this.appendTo(this.terminalOutput, text, kind)
  }

  private appendTo(
    output: HTMLElement | null,
    text: string,
    kind: 'log' | 'error' | 'system',
  ): void {
    if (!output) return
    const line = document.createElement('div')
    line.className = `bottom-line bottom-line--${kind}`
    line.textContent = text.replace(ANSI_ESCAPE_RE, '')
    output.appendChild(line)
    output.scrollTop = output.scrollHeight
  }
}
