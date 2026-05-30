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
    window.electronAPI.onProjectStopped(() => this.appendConsole('■ Projeto parado.\n', 'system'))

    window.electronAPI.onTerminalOutput((text) => this.appendTerminal(text, 'log'))
    window.electronAPI.onTerminalDone((code) => {
      this.terminalRunning = false
      this.appendTerminal(`\n[processo encerrado: código ${code}]\n`, 'system')
      this.updateTerminalButtons()
    })

    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.projectDir = path
      localStorage.setItem(STORAGE_KEY, path)
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
    document.addEventListener('build-installer-requested', () => {
      void this.handleBuildInstaller()
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
  private async handleBuildInstaller(): Promise<void> {
    if (!this.projectDir) {
      alert('Abra um projeto antes de gerar o instalador.')
      return
    }
    if (this.playRunning) {
      alert('Pare o Play antes de gerar o instalador.')
      return
    }
    if (this.terminalRunning) {
      alert('Aguarde o comando atual do terminal terminar.')
      return
    }

    this.activateTab('terminal')

    const status = await window.electronAPI.installerCheck(this.projectDir)
    if (!status.configured) {
      const ok = confirm(
        'Este projeto ainda não tem o Tauri configurado.\n\n' +
          'Posso configurar agora (cópia de src-tauri/, scripts no package.json e @tauri-apps/cli) ' +
          'e rodar `yarn install` em seguida. Depois você gera os ícones e dispara o build de novo.\n\n' +
          'Configurar agora?',
      )
      if (!ok) return
      try {
        this.appendTerminal('▸ Configurando Tauri no projeto...\n', 'system')
        const result = await window.electronAPI.installerSetup(this.projectDir)
        this.appendTerminal('✓ src-tauri/ copiado, package.json atualizado.\n', 'system')
        if (result.iconsGenerated) {
          this.appendTerminal(
            '✓ Ícones placeholder gerados em src-tauri/icons/. ' +
              'Pra trocar pela arte do jogo depois, rode `yarn tauri icon caminho/icone.png`.\n',
            'system',
          )
        }
        this.appendTerminal(
          '\nPróximos passos:\n' +
            '  1. Aguardar `yarn install` terminar (vai rodar agora).\n' +
            '  2. (Se ainda não fez) instalar Rust + MSVC Build Tools (uma vez por máquina):\n' +
            '     - Rust:  https://rustup.rs/\n' +
            '     - MSVC:  https://visualstudio.microsoft.com/visual-cpp-build-tools/\n' +
            '     Detalhes em "Gerar instalador do jogo" no README.md da IDE.\n' +
            '  3. Clicar Menu → Projeto → Gerar instalador... de novo — agora vai buildar.\n\n',
          'system',
        )
      } catch (err) {
        this.appendTerminal(`Erro ao configurar Tauri: ${String(err)}\n`, 'error')
        return
      }
      await this.runCommandForce('yarn install')
      return
    }

    await this.runCommandForce('yarn tauri:build')
  }

  // ── Construção da UI ────────────────────────────────────────────────────────

  private buildShell(): void {
    this.container.innerHTML = ''

    this.tabBar = document.createElement('div')
    this.tabBar.className = 'bottom-tabs'
    this.tabBar.appendChild(this.makeTabButton('console', 'Console'))
    this.tabBar.appendChild(this.makeTabButton('terminal', 'Terminal'))

    const clearBtn = document.createElement('button')
    clearBtn.className = 'bottom-clear-btn'
    clearBtn.textContent = 'Limpar'
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
    input.placeholder = 'Digite um comando (ex: yarn install)'
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.runCommand()
    })
    this.terminalInput = input

    const runBtn = document.createElement('button')
    runBtn.className = 'terminal-run-btn'
    runBtn.textContent = 'Executar'
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
      this.appendTerminal('Abra um projeto antes de rodar comandos.\n', 'error')
      return
    }
    if (this.terminalRunning) return
    this.terminalRunning = true
    this.appendTerminal(`> ${cmd}\n`, 'system')
    this.updateTerminalButtons()
    try {
      await window.electronAPI.runTerminalCommand(this.projectDir, cmd)
      // O await retorna logo após o spawn — a duração real do comando é
      // sinalizada por onTerminalDone (que já reseta terminalRunning).
      // Aqui só cobrimos o caso de o IPC ter rejeitado (validação síncrona):
    } catch (err) {
      this.appendTerminal(`Erro: ${String(err)}\n`, 'error')
      this.terminalRunning = false
      this.updateTerminalButtons()
    }
  }

  private updateTerminalButtons(): void {
    if (!this.terminalRunBtn || !this.terminalInput) return
    this.terminalRunBtn.textContent = this.terminalRunning ? 'Parar' : 'Executar'
    // Bloqueado se Play ativo OU sem projeto OU comando em execução.
    // Quando terminalRunning é true (mas Play não), permitimos o botão
    // 'Parar' funcionar para interromper o comando.
    const blocked = this.playRunning || !this.projectDir
    this.terminalInput.disabled = blocked || this.terminalRunning
    this.terminalRunBtn.disabled = blocked && !this.terminalRunning
    if (!this.projectDir) {
      this.terminalInput.placeholder = 'Abra um projeto para usar o terminal'
    } else if (this.playRunning) {
      this.terminalInput.placeholder = 'Pare o Play para usar o terminal'
    } else if (this.terminalRunning) {
      this.terminalInput.placeholder = 'Comando em execução...'
    } else {
      this.terminalInput.placeholder = 'Digite um comando (ex: yarn install)'
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
