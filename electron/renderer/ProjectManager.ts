export class ProjectManager {
  private container: HTMLElement
  private dialog: HTMLDialogElement | null = null
  private nameInput: HTMLInputElement | null = null
  private dirInput: HTMLInputElement | null = null

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

    // Campo: pasta destino (webkitdirectory)
    const dirGroup = document.createElement('div')
    dirGroup.className = 'project-manager-field'

    const dirLabel = document.createElement('label')
    dirLabel.textContent = 'Pasta destino'
    dirLabel.htmlFor = 'pm-dir-input'

    const dirInput = document.createElement('input')
    dirInput.type = 'file'
    dirInput.id = 'pm-dir-input'
    dirInput.className = 'project-manager-input'
    dirInput.setAttribute('webkitdirectory', '')
    this.dirInput = dirInput

    dirGroup.appendChild(dirLabel)
    dirGroup.appendChild(dirInput)

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
    this.dialog?.close()
  }

  private async handleCreate(): Promise<void> {
    const name = this.nameInput?.value.trim() ?? ''
    if (!name) {
      this.nameInput?.reportValidity()
      return
    }

    const files = this.dirInput?.files
    if (!files || files.length === 0) {
      alert('Selecione uma pasta destino.')
      return
    }

    const targetDir = this.extractDirPath(files[0])

    try {
      const createdPath = await window.electronAPI.createProject(targetDir, name)
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

  /**
   * Extrai o path absoluto da pasta selecionada via <input webkitdirectory>.
   * Em Electron, File tem a propriedade não-padrão `.path` com o caminho absoluto do SO.
   * webkitRelativePath usa sempre `/` como separador: "nomePasta/sub/arquivo.ext".
   */
  private extractDirPath(file: File): string {
    const absPath = (file as unknown as { path: string }).path
    const relPath = file.webkitRelativePath
    const rootDirName = relPath.split('/')[0]
    // Normaliza para `/` para calcular o comprimento do prefixo
    // (no Windows, absPath usa `\` mas relPath usa `/`)
    const normalizedAbs = absPath.replace(/\\/g, '/')
    const prefixLength = normalizedAbs.length - relPath.length
    return absPath.slice(0, prefixLength + rootDirName.length)
  }
}
