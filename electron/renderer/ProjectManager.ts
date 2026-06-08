import { t } from './i18n'

export class ProjectManager {
  private container: HTMLElement
  private dialog: HTMLDialogElement | null = null
  private nameInput: HTMLInputElement | null = null
  private dirPathDisplay: HTMLSpanElement | null = null
  private selectedDir: string | null = null
  private kindSelect: HTMLSelectElement | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    this.buildDialog()
    this.injectButton()
    // A tela inicial (Launcher) pede o dialog de criação por evento.
    document.addEventListener('request-new-project', () => this.dialog?.showModal())
    // Reconstrói tudo se o usuário trocar de idioma na sessão atual.
    document.addEventListener('locale-change', () => {
      this.dialog?.remove()
      this.container.querySelector('.project-manager-new-btn')?.remove()
      this.buildDialog()
      this.injectButton()
    })
  }

  /** Insere o botão "+ Novo Projeto" no topo da sidebar. */
  private injectButton(): void {
    const btn = document.createElement('button')
    btn.textContent = t('projectManager.new_btn')
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

    // Campo: tipo do jogo (2.5D malhas/perspectiva × 2D pixel/ortográfica). O
    // template e a orientação do Chat IA vêm configurados conforme a escolha.
    const kindGroup = document.createElement('div')
    kindGroup.className = 'project-manager-field'
    const kindLabel = document.createElement('label')
    kindLabel.textContent = t('projectManager.label_kind')
    const kindSelect = document.createElement('select')
    kindSelect.className = 'project-manager-input'
    const opt25 = document.createElement('option')
    opt25.value = '2.5d'
    opt25.textContent = t('projectManager.kind_25d')
    const opt2 = document.createElement('option')
    opt2.value = '2d'
    opt2.textContent = t('projectManager.kind_2d')
    kindSelect.append(opt25, opt2)
    this.kindSelect = kindSelect
    kindGroup.appendChild(kindLabel)
    kindGroup.appendChild(kindSelect)

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
    cancelBtn.addEventListener('click', () => this.closeAndReset())

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.textContent = t('projectManager.create')
    confirmBtn.className = 'project-manager-btn project-manager-btn--primary'
    confirmBtn.addEventListener('click', () => void this.handleCreate())

    actions.appendChild(cancelBtn)
    actions.appendChild(confirmBtn)

    dialog.appendChild(title)
    dialog.appendChild(nameGroup)
    dialog.appendChild(kindGroup)
    dialog.appendChild(dirGroup)
    dialog.appendChild(actions)
    document.body.appendChild(dialog)
    this.dialog = dialog
  }

  private closeAndReset(): void {
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
    const name = this.nameInput?.value.trim() ?? ''
    if (!name) {
      this.nameInput?.reportValidity()
      return
    }

    if (!this.selectedDir) {
      alert(t('projectManager.alert_select_folder'))
      return
    }

    try {
      const kind = this.kindSelect?.value === '2d' ? '2d' : '2.5d'
      const createdPath = await window.electronAPI.createProject(this.selectedDir, name, kind)
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
      alert(`${t('projectManager.error_create')} ${String(err)}`)
    }
  }
}
