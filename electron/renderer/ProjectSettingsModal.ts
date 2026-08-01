import { t } from './i18n'

/** App id da Steam cabe em uint32 — 10 dígitos é o teto absoluto. */
const STEAM_APP_ID_MAX_DIGITS = 10

/**
 * Modal "Configurações do jogo" (SPEC-0128): registra a IDENTIDADE do jogo no
 * `cortex.json` — nome de exibição + ícone (PNG) + **Steam App ID**. O nome
 * serve PC (título da janela, Meus Programas) e console (DefaultDisplayName); o
 * ícone é embutido no `launcher.exe` no export (SPEC-0127) e alimenta o atalho
 * quando o instalador chegar; o app id é o que autoriza o export `--steam`
 * (ADR-0174). O `id` (chave de saves) NÃO é editável — é estável por design.
 *
 * Segue o molde do ExportProgressModal: `<dialog>.showModal()` com backdrop
 * nativo, DOM montado à mão, i18n via `t()`.
 */
export class ProjectSettingsModal {
  private dialog: HTMLDialogElement
  private projectDir: string
  private nameInput!: HTMLInputElement
  private steamInput!: HTMLInputElement
  private previewImg!: HTMLImageElement
  private previewEmpty!: HTMLElement
  private removeBtn!: HTMLButtonElement
  private saveBtn!: HTMLButtonElement
  private iconRel: string | null // ícone atual (relativo ao projeto) ou null
  private pendingSource: string | null = null // PNG novo escolhido, ainda não copiado
  private saved = false

  constructor(
    projectDir: string,
    config: { name: string; icon: string | null; steamAppId?: number | null },
  ) {
    this.projectDir = projectDir
    this.iconRel = config.icon

    this.dialog = document.createElement('dialog')
    this.dialog.className = 'export-modal settings-modal'

    const header = document.createElement('div')
    header.className = 'export-modal__header'
    const title = document.createElement('h2')
    title.className = 'export-modal__title'
    title.textContent = t('gameSettings.title')
    const subtitle = document.createElement('div')
    subtitle.className = 'export-modal__subtitle'
    subtitle.textContent = t('gameSettings.subtitle')
    header.append(title, subtitle)

    // Campo: nome do jogo
    const nameField = document.createElement('label')
    nameField.className = 'gs-field'
    const nameLabel = document.createElement('span')
    nameLabel.className = 'gs-field__label'
    nameLabel.textContent = t('gameSettings.name_label')
    this.nameInput = document.createElement('input')
    this.nameInput.type = 'text'
    this.nameInput.className = 'gs-input'
    this.nameInput.value = config.name
    this.nameInput.placeholder = t('gameSettings.name_placeholder')
    this.nameInput.maxLength = 120
    nameField.append(nameLabel, this.nameInput)

    // Campo: ícone (preview + escolher/remover)
    const iconField = document.createElement('div')
    iconField.className = 'gs-field'
    const iconLabel = document.createElement('span')
    iconLabel.className = 'gs-field__label'
    iconLabel.textContent = t('gameSettings.icon_label')

    const iconRow = document.createElement('div')
    iconRow.className = 'gs-icon-row'
    const preview = document.createElement('div')
    preview.className = 'gs-icon-preview'
    this.previewImg = document.createElement('img')
    this.previewImg.className = 'gs-icon-img'
    this.previewImg.alt = ''
    this.previewImg.hidden = true
    this.previewEmpty = document.createElement('span')
    this.previewEmpty.className = 'gs-icon-empty'
    this.previewEmpty.textContent = t('gameSettings.icon_none')
    preview.append(this.previewImg, this.previewEmpty)

    const iconBtns = document.createElement('div')
    iconBtns.className = 'gs-icon-btns'
    const chooseBtn = document.createElement('button')
    chooseBtn.type = 'button'
    chooseBtn.className = 'export-modal__btn export-modal__btn--secondary'
    chooseBtn.textContent = t('gameSettings.icon_choose')
    chooseBtn.addEventListener('click', () => void this.chooseIcon())
    this.removeBtn = document.createElement('button')
    this.removeBtn.type = 'button'
    this.removeBtn.className = 'export-modal__btn export-modal__btn--secondary'
    this.removeBtn.textContent = t('gameSettings.icon_remove')
    this.removeBtn.addEventListener('click', () => this.removeIcon())
    const iconHint = document.createElement('div')
    iconHint.className = 'gs-icon-hint'
    iconHint.textContent = t('gameSettings.icon_hint')
    iconBtns.append(chooseBtn, this.removeBtn, iconHint)
    iconRow.append(preview, iconBtns)
    iconField.append(iconLabel, iconRow)

    // Campo: Steam App ID (ADR-0174). Vazio = jogo que não publica na Steam —
    // estado válido; quem exporta só pra PC nunca precisa preencher.
    const steamField = document.createElement('label')
    steamField.className = 'gs-field'
    const steamLabel = document.createElement('span')
    steamLabel.className = 'gs-field__label'
    steamLabel.textContent = t('gameSettings.steam_label')
    this.steamInput = document.createElement('input')
    // `inputMode` numérico abre o teclado certo e sinaliza a intenção, mas o
    // type continua `text`: com `type="number"` o browser aceita `1e5`/`-3` e
    // devolve string vazia em valor inválido, escondendo o erro do usuário.
    this.steamInput.type = 'text'
    this.steamInput.inputMode = 'numeric'
    this.steamInput.className = 'gs-input'
    this.steamInput.value = config.steamAppId != null ? String(config.steamAppId) : ''
    this.steamInput.placeholder = t('gameSettings.steam_placeholder')
    this.steamInput.maxLength = STEAM_APP_ID_MAX_DIGITS
    const steamHint = document.createElement('div')
    steamHint.className = 'gs-icon-hint'
    steamHint.textContent = t('gameSettings.steam_hint')
    steamField.append(steamLabel, this.steamInput, steamHint)

    // Nota: atalho na área de trabalho depende do instalador (ADR-0126/0127).
    const note = document.createElement('div')
    note.className = 'gs-note'
    note.textContent = t('gameSettings.shortcut_note')

    // Rodapé: salvar / cancelar
    const footer = document.createElement('div')
    footer.className = 'export-modal__footer'
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'export-modal__btn export-modal__btn--secondary'
    cancelBtn.textContent = t('gameSettings.cancel')
    cancelBtn.addEventListener('click', () => this.close())
    this.saveBtn = document.createElement('button')
    this.saveBtn.type = 'button'
    this.saveBtn.className = 'export-modal__btn export-modal__btn--primary'
    this.saveBtn.textContent = t('gameSettings.save')
    this.saveBtn.addEventListener('click', () => void this.save())
    footer.append(cancelBtn, this.saveBtn)

    this.dialog.append(header, nameField, iconField, steamField, note, footer)
    document.body.appendChild(this.dialog)

    void this.loadPreview()
    this.dialog.addEventListener('close', () => this.dialog.remove())
    this.dialog.showModal()
    this.nameInput.focus()
    this.nameInput.select()
  }

  /** Mostra o ícone atual (ou o recém-escolhido) no preview. */
  private async loadPreview(): Promise<void> {
    const path = this.pendingSource ?? (this.iconRel ? `${this.projectDir}/${this.iconRel}` : null)
    if (!path) {
      this.previewImg.hidden = true
      this.previewEmpty.hidden = false
      this.removeBtn.disabled = true
      return
    }
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      this.previewImg.src = `data:image/png;base64,${b64}`
      this.previewImg.hidden = false
      this.previewEmpty.hidden = true
      this.removeBtn.disabled = false
    } catch {
      this.previewImg.hidden = true
      this.previewEmpty.hidden = false
      this.removeBtn.disabled = true
    }
  }

  private async chooseIcon(): Promise<void> {
    const src = await window.electronAPI.openImageDialog()
    if (!src) return
    this.pendingSource = src
    await this.loadPreview()
  }

  private removeIcon(): void {
    this.pendingSource = null
    this.iconRel = null
    void this.loadPreview()
  }

  private async save(): Promise<void> {
    // Vazio é válido (jogo fora da Steam); qualquer coisa que não seja só
    // dígitos é erro do usuário e vale avisar AQUI, não no export.
    const steamAppId = this.steamInput.value.trim()
    if (steamAppId && !/^\d+$/.test(steamAppId)) {
      void window.electronAPI.errorDialog(
        t('gameSettings.title'),
        t('gameSettings.steam_invalid'),
      )
      this.steamInput.focus()
      this.steamInput.select()
      return
    }
    this.saveBtn.disabled = true
    try {
      // Copia o PNG escolhido pra dentro do projeto (branding/icon.png).
      if (this.pendingSource) {
        const { icon } = await window.electronAPI.importProjectIcon(this.projectDir, this.pendingSource)
        this.iconRel = icon
        this.pendingSource = null
      }
      const res = await window.electronAPI.writeProjectConfig(this.projectDir, {
        name: this.nameInput.value.trim(),
        icon: this.iconRel ?? undefined,
        steamAppId,
      })
      this.saved = true
      // Avisa a Studio (ex.: rótulo do projeto pode refletir o novo nome).
      document.dispatchEvent(new CustomEvent('project-config-saved', { detail: res }))
      this.close()
    } catch (err) {
      this.saveBtn.disabled = false
      void window.electronAPI.errorDialog(t('gameSettings.title'), String(err))
    }
  }

  /** `true` se o usuário salvou (pra quem quiser reagir sem escutar o evento). */
  get didSave(): boolean {
    return this.saved
  }

  private close(): void {
    this.dialog.close()
  }
}
