import { t } from './i18n'
import type { PackageListItem } from './types'

/**
 * Modal "Pacotes de textura" (SPEC-0641 §4): lista o `cortex.json#packages` com
 * o estado instalado, adiciona (id + versão exata), remove e instala o que falta.
 * O download/verificação roda no main (`electron/packages/`); aqui só UI.
 *
 * Mesmo molde do ProjectSettingsModal: `<dialog>.showModal()`, DOM à mão, `t()`.
 */
export class PackagesModal {
  private dialog: HTMLDialogElement
  private list: HTMLElement
  private status: HTMLElement
  private idInput: HTMLInputElement
  private versionInput: HTMLInputElement
  private offProgress: () => void

  constructor(private projectDir: string) {
    this.dialog = document.createElement('dialog')
    this.dialog.className = 'export-modal settings-modal'

    const header = document.createElement('div')
    header.className = 'export-modal__header'
    const title = document.createElement('h2')
    title.className = 'export-modal__title'
    title.textContent = t('packages.title')
    const subtitle = document.createElement('div')
    subtitle.className = 'export-modal__subtitle'
    subtitle.textContent = t('packages.subtitle')
    header.append(title, subtitle)

    this.list = document.createElement('div')
    this.list.className = 'gs-field'

    const addRow = document.createElement('div')
    addRow.className = 'gs-field'
    this.idInput = document.createElement('input')
    this.idInput.type = 'text'
    this.idInput.className = 'gs-input'
    this.idInput.placeholder = t('packages.id_placeholder')
    this.versionInput = document.createElement('input')
    this.versionInput.type = 'text'
    this.versionInput.className = 'gs-input'
    this.versionInput.placeholder = t('packages.version_placeholder')
    const addBtn = this.button(t('packages.add'), 'secondary', () => void this.add())
    addRow.append(this.idInput, this.versionInput, addBtn)

    this.status = document.createElement('div')
    this.status.className = 'gs-icon-hint'

    const footer = document.createElement('div')
    footer.className = 'export-modal__footer'
    footer.append(
      this.button(t('packages.sync'), 'secondary', () => void this.sync()),
      this.button(t('packages.close'), 'primary', () => this.dialog.close()),
    )

    this.dialog.append(header, this.list, addRow, this.status, footer)
    document.body.appendChild(this.dialog)

    this.offProgress = window.electronAPI.onPackagesProgress((msg) => {
      const stage = msg.stage === 'error' ? t('packages.error', { msg: msg.error ?? '' }) : t(`packages.stage_${msg.stage}`)
      this.status.textContent = `${msg.id}: ${stage}`
    })
    this.dialog.addEventListener('close', () => {
      this.offProgress()
      this.dialog.remove()
    })
    this.dialog.showModal()
    void this.refresh()
  }

  private button(label: string, kind: 'primary' | 'secondary', onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `export-modal__btn export-modal__btn--${kind}`
    b.textContent = label
    b.addEventListener('click', onClick)
    return b
  }

  private row(p: PackageListItem): HTMLElement {
    const el = document.createElement('div')
    el.className = 'gs-field__label'
    const state = p.installedVersion === p.version
      ? `${t('packages.installed')} · ${t('packages.materials', { n: p.materials })}`
      : t('packages.missing')
    const lic = p.redistributable === false ? ` · ${t('packages.private')}` : ''
    el.textContent = `${p.name} @ ${p.version} — ${state}${lic} `
    el.append(this.button(t('packages.remove'), 'secondary', () => void this.remove(p.id)))
    return el
  }

  private async refresh(): Promise<void> {
    const { items, errors } = await window.electronAPI.listPackages(this.projectDir)
    this.list.replaceChildren(...(items.length ? items.map((p) => this.row(p)) : [document.createTextNode(t('packages.empty'))]))
    if (errors.length) this.status.textContent = errors.join(' · ')
  }

  private async run(task: () => Promise<{ status?: string; error?: string } | void>): Promise<void> {
    try {
      const r = await task()
      if (r && r.status === 'error') this.status.textContent = t('packages.error', { msg: r.error ?? '' })
    } catch (err) {
      this.status.textContent = t('packages.error', { msg: err instanceof Error ? err.message : String(err) })
    }
    await this.refresh()
  }

  private add(): Promise<void> {
    const id = this.idInput.value.trim()
    const version = this.versionInput.value.trim()
    return this.run(() => window.electronAPI.addPackage(this.projectDir, id, version))
  }

  private remove(id: string): Promise<void> {
    return this.run(async () => {
      await window.electronAPI.removePackage(this.projectDir, id)
    })
  }

  private sync(): Promise<void> {
    return this.run(async () => {
      const { results } = await window.electronAPI.syncPackages(this.projectDir)
      const failed = results.find((r) => r.status === 'error')
      return failed ? { status: 'error', error: `${failed.id}: ${failed.error}` } : undefined
    })
  }
}
