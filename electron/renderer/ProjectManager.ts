import { t } from './i18n'

export class ProjectManager {
  private container: HTMLElement
  private dialog: HTMLDialogElement | null = null
  private nameInput: HTMLInputElement | null = null
  private dirPathDisplay: HTMLSpanElement | null = null
  private selectedDir: string | null = null
  // Refs das ações + flag de criação em andamento (trava duplo-clique e ESC).
  private confirmBtn: HTMLButtonElement | null = null
  private cancelBtn: HTMLButtonElement | null = null
  private dirBrowseBtn: HTMLButtonElement | null = null
  private creating = false

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    this.buildDialog()
    // "Novo Projeto" agora vive na toolbar/menu da casca nova (Shell) e na tela
    // inicial — ambos pedem o dialog por evento; o botão antigo da sidebar saiu.
    document.addEventListener('request-new-project', () => this.dialog?.showModal())
    // Reconstrói o dialog se o usuário trocar de idioma na sessão atual.
    document.addEventListener('locale-change', () => {
      this.dialog?.remove()
      this.buildDialog()
    })
  }

  /** Constrói o <dialog> nativo e o anexa ao <body>. */
  private buildDialog(): void {
    const dialog = document.createElement('dialog')
    dialog.className = 'project-manager-dialog'

    const title = document.createElement('h2')
    title.className = 'project-manager-dialog-title'
    title.textContent = t('projectManager.dialog_title')

    // Campo: nome do projeto
    const nameGroup = document.createElement('div')
    nameGroup.className = 'project-manager-field'

    const nameLabel = document.createElement('label')
    nameLabel.textContent = t('projectManager.label_name')
    nameLabel.htmlFor = 'pm-name-input'

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.id = 'pm-name-input'
    nameInput.className = 'project-manager-input'
    nameInput.placeholder = t('projectManager.placeholder_name')
    nameInput.required = true
    this.nameInput = nameInput

    nameGroup.appendChild(nameLabel)
    nameGroup.appendChild(nameInput)

    // Campo: pasta destino (diálogo nativo do Electron)
    const dirGroup = document.createElement('div')
    dirGroup.className = 'project-manager-field'

    const dirLabel = document.createElement('label')
    dirLabel.textContent = t('projectManager.label_target')

    const dirRow = document.createElement('div')
    dirRow.className = 'project-manager-dir-row'

    const dirBrowseBtn = document.createElement('button')
    dirBrowseBtn.type = 'button'
    dirBrowseBtn.textContent = t('projectManager.select_folder')
    dirBrowseBtn.className = 'project-manager-btn project-manager-btn--secondary'
    dirBrowseBtn.addEventListener('click', () => void this.handleSelectDir())
    this.dirBrowseBtn = dirBrowseBtn

    const dirPathDisplay = document.createElement('span')
    dirPathDisplay.className = 'project-manager-dir-path'
    dirPathDisplay.textContent = t('projectManager.no_folder_selected')
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
    cancelBtn.textContent = t('projectManager.cancel')
    cancelBtn.className = 'project-manager-btn project-manager-btn--secondary'
    cancelBtn.addEventListener('click', () => {
      if (this.creating) return // não cancela no meio da criação
      this.closeAndReset()
    })
    this.cancelBtn = cancelBtn

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.textContent = t('projectManager.create')
    confirmBtn.className = 'project-manager-btn project-manager-btn--primary'
    confirmBtn.addEventListener('click', () => void this.handleCreate())
    this.confirmBtn = confirmBtn

    actions.appendChild(cancelBtn)
    actions.appendChild(confirmBtn)

    dialog.appendChild(title)
    dialog.appendChild(nameGroup)
    dialog.appendChild(dirGroup)
    dialog.appendChild(actions)
    // Bloqueia o ESC (evento `cancel` do <dialog>) enquanto cria — senão fecharia
    // o modal com a criação ainda em andamento.
    dialog.addEventListener('cancel', (e) => {
      if (this.creating) e.preventDefault()
    })
    document.body.appendChild(dialog)
    this.dialog = dialog
  }

  /** Liga/desliga o estado "criando": trava botões/ESC e mostra o spinner no Criar. */
  private setBusy(busy: boolean): void {
    this.creating = busy
    if (this.confirmBtn) {
      this.confirmBtn.disabled = busy
      this.confirmBtn.classList.toggle('project-manager-btn--loading', busy)
      this.confirmBtn.textContent = busy ? t('projectManager.creating') : t('projectManager.create')
    }
    if (this.cancelBtn) this.cancelBtn.disabled = busy
    if (this.dirBrowseBtn) this.dirBrowseBtn.disabled = busy
    if (this.nameInput) this.nameInput.disabled = busy
  }

  private closeAndReset(): void {
    this.setBusy(false)
    if (this.nameInput) this.nameInput.value = ''
    this.selectedDir = null
    if (this.dirPathDisplay) this.dirPathDisplay.textContent = t('projectManager.no_folder_selected')
    this.dialog?.close()
  }

  private async handleSelectDir(): Promise<void> {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    this.selectedDir = path
    if (this.dirPathDisplay) this.dirPathDisplay.textContent = path
  }

  private async handleCreate(): Promise<void> {
    if (this.creating) return // já criando — ignora cliques repetidos no "Criar"

    const name = this.nameInput?.value.trim() ?? ''
    if (!name) {
      this.nameInput?.reportValidity()
      return
    }

    if (!this.selectedDir) {
      alert(t('projectManager.alert_select_folder'))
      return
    }

    this.setBusy(true)
    try {
      const createdPath = await window.electronAPI.createProject(this.selectedDir, name)
      this.closeAndReset()
      document.dispatchEvent(
        new CustomEvent<{ path: string }>('project-created', {
          detail: { path: createdPath },
        }),
      )
      document.dispatchEvent(
        new CustomEvent<{ path: string }>('project-open', {
          detail: { path: createdPath },
        }),
      )
    } catch (err) {
      this.setBusy(false) // reabilita pra tentar de novo
      alert(`${t('projectManager.error_create')} ${String(err)}`)
    }
  }
}
