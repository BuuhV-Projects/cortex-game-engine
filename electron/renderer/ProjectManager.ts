export class ProjectManager {
  private container: HTMLElement
  private dialog: HTMLDialogElement | null = null
  private nameInput: HTMLInputElement | null = null
  private dirPathDisplay: HTMLSpanElement | null = null
  private selectedDir: string | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    this.buildDialog()
    this.injectButton()
  }

  /** Insere o botão "+ Novo Projeto" no topo da sidebar. */
  private injectButton(): void {
    const btn = document.createElement('button')
    btn.textContent = '+ Novo Projeto'
    btn.className = 'project-manager-new-btn'
    btn.addEventListener('click', () => this.dialog?.showModal())
    this.container.prepend(btn)
  }

  /** Constrói o <dialog> nativo e o anexa ao <body>. */
  private buildDialog(): void {
    const dialog = document.createElement('dialog')
    dialog.className = 'project-manager-dialog'

    const title = document.createElement('h2')
    title.className = 'project-manager-dialog-title'
    title.textContent = 'Novo Projeto'

    // Campo: nome do projeto
    const nameGroup = document.createElement('div')
    nameGroup.className = 'project-manager-field'

    const nameLabel = document.createElement('label')
    nameLabel.textContent = 'Nome do projeto'
    nameLabel.htmlFor = 'pm-name-input'

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.id = 'pm-name-input'
    nameInput.className = 'project-manager-input'
    nameInput.placeholder = 'meu-projeto'
    nameInput.required = true
    this.nameInput = nameInput

    nameGroup.appendChild(nameLabel)
    nameGroup.appendChild(nameInput)

    // Campo: pasta destino (diálogo nativo do Electron)
    const dirGroup = document.createElement('div')
    dirGroup.className = 'project-manager-field'

    const dirLabel = document.createElement('label')
    dirLabel.textContent = 'Pasta destino'

    const dirRow = document.createElement('div')
    dirRow.className = 'project-manager-dir-row'

    const dirBrowseBtn = document.createElement('button')
    dirBrowseBtn.type = 'button'
    dirBrowseBtn.textContent = 'Selecionar pasta'
    dirBrowseBtn.className = 'project-manager-btn project-manager-btn--secondary'
    dirBrowseBtn.addEventListener('click', () => void this.handleSelectDir())

    const dirPathDisplay = document.createElement('span')
    dirPathDisplay.className = 'project-manager-dir-path'
    dirPathDisplay.textContent = 'Nenhuma pasta selecionada'
    this.dirPathDisplay = dirPathDisplay

    dirRow.appendChild(dirBrowseBtn)
    dirRow.appendChild(dirPathDisplay)

    dirGroup.appendChild(dirLabel)
    dirGroup.appendChild(dirRow)

    // Ações
    const actions = document.createElement('div')
    actions.className = 'project-manager-actions'

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.className = 'project-manager-btn project-manager-btn--secondary'
    cancelBtn.addEventListener('click', () => this.closeAndReset())

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.textContent = 'Criar'
    confirmBtn.className = 'project-manager-btn project-manager-btn--primary'
    confirmBtn.addEventListener('click', () => void this.handleCreate())

    actions.appendChild(cancelBtn)
    actions.appendChild(confirmBtn)

    dialog.appendChild(title)
    dialog.appendChild(nameGroup)
    dialog.appendChild(dirGroup)
    dialog.appendChild(actions)
    document.body.appendChild(dialog)
    this.dialog = dialog
  }

  private closeAndReset(): void {
    if (this.nameInput) this.nameInput.value = ''
    this.selectedDir = null
    if (this.dirPathDisplay) this.dirPathDisplay.textContent = 'Nenhuma pasta selecionada'
    this.dialog?.close()
  }

  private async handleSelectDir(): Promise<void> {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    this.selectedDir = path
    if (this.dirPathDisplay) this.dirPathDisplay.textContent = path
  }

  private async handleCreate(): Promise<void> {
    const name = this.nameInput?.value.trim() ?? ''
    if (!name) {
      this.nameInput?.reportValidity()
      return
    }

    if (!this.selectedDir) {
      alert('Selecione uma pasta destino.')
      return
    }

    try {
      const createdPath = await window.electronAPI.createProject(this.selectedDir, name)
      this.closeAndReset()
      document.dispatchEvent(
        new CustomEvent<{ path: string }>('project-open', {
          detail: { path: createdPath },
        }),
      )
    } catch (err) {
      alert(`Erro ao criar projeto: ${String(err)}`)
    }
  }
}
