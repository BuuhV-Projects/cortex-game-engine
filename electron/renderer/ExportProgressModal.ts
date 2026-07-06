import { t } from './i18n'

/**
 * Modal de progresso do export CortexNative (ADR-0101).
 *
 * Usa `<dialog>.showModal()` — o backdrop nativo BLOQUEIA toda a Studio
 * enquanto o export roda (o usuário não mexe em nada até terminar). As etapas
 * chegam via `electronAPI.onExportProgress` (marcadores do script) e o
 * `main.ts` os retransmite. Enquanto roda, o modal não pode ser fechado
 * (Escape/cancel são bloqueados); ao terminar, aparece o rodapé com
 * "Abrir pasta" / "Fechar".
 */

/** Ordem das etapas exibidas (bate com as chaves emitidas pelo script). */
const STEPS = ['prepare', 'bundle', 'bytecode', 'runtime', 'assets'] as const
type StepKey = (typeof STEPS)[number]

type StepState = 'pending' | 'active' | 'done'

export class ExportProgressModal {
  private dialog: HTMLDialogElement
  private rows = new Map<StepKey, HTMLElement>()
  private footer: HTMLElement
  private statusEl: HTMLElement
  private running = true
  private distDir: string | null = null

  constructor() {
    this.dialog = document.createElement('dialog')
    this.dialog.className = 'export-modal'

    const header = document.createElement('div')
    header.className = 'export-modal__header'
    const title = document.createElement('h2')
    title.className = 'export-modal__title'
    title.textContent = t('bottomPanel.export_title')
    const subtitle = document.createElement('div')
    subtitle.className = 'export-modal__subtitle'
    subtitle.textContent = t('bottomPanel.export_subtitle')
    header.appendChild(title)
    header.appendChild(subtitle)

    const steps = document.createElement('ol')
    steps.className = 'export-modal__steps'
    for (const key of STEPS) {
      const row = document.createElement('li')
      row.className = 'export-modal__step'
      const icon = document.createElement('span')
      icon.className = 'export-modal__icon'
      const label = document.createElement('span')
      label.className = 'export-modal__label'
      label.textContent = t(`bottomPanel.export_step_${key}`)
      row.appendChild(icon)
      row.appendChild(label)
      steps.appendChild(row)
      this.rows.set(key, row)
      this.setState(key, 'pending')
    }

    this.statusEl = document.createElement('div')
    this.statusEl.className = 'export-modal__status'
    this.statusEl.textContent = t('bottomPanel.export_hint')

    this.footer = document.createElement('div')
    this.footer.className = 'export-modal__footer'
    this.footer.hidden = true

    this.dialog.appendChild(header)
    this.dialog.appendChild(steps)
    this.dialog.appendChild(this.statusEl)
    this.dialog.appendChild(this.footer)
    document.body.appendChild(this.dialog)

    // Enquanto roda, não deixa fechar (Escape dispara 'cancel' no <dialog>).
    this.dialog.addEventListener('cancel', (e) => {
      if (this.running) e.preventDefault()
    })

    this.dialog.showModal()
  }

  /** Marca a etapa recebida como ativa e todas as anteriores como concluídas. */
  step(key: string): void {
    if (key === 'done') {
      for (const k of STEPS) this.setState(k, 'done')
      return
    }
    const idx = STEPS.indexOf(key as StepKey)
    if (idx < 0) return
    for (let i = 0; i < STEPS.length; i++) {
      if (i < idx) this.setState(STEPS[i], 'done')
      else if (i === idx) this.setState(STEPS[i], 'active')
      else this.setState(STEPS[i], 'pending')
    }
  }

  /** Encerra o modal: libera o fechamento e mostra o rodapé com o resultado. */
  finish(ok: boolean, distDir?: string): void {
    this.running = false
    this.distDir = distDir ?? null
    if (ok) for (const k of STEPS) this.setState(k, 'done')

    this.statusEl.textContent = ok
      ? t('bottomPanel.export_done_ok')
      : t('bottomPanel.export_done_fail')
    this.statusEl.classList.toggle('export-modal__status--ok', ok)
    this.statusEl.classList.toggle('export-modal__status--fail', !ok)

    this.footer.hidden = false
    if (ok && this.distDir) {
      const openBtn = document.createElement('button')
      openBtn.type = 'button'
      openBtn.className = 'export-modal__btn export-modal__btn--secondary'
      openBtn.textContent = t('bottomPanel.export_open_folder')
      openBtn.addEventListener('click', () => {
        if (this.distDir) void window.electronAPI.openPath(this.distDir)
      })
      this.footer.appendChild(openBtn)
    }
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'export-modal__btn export-modal__btn--primary'
    closeBtn.textContent = t('bottomPanel.export_close')
    closeBtn.addEventListener('click', () => this.close())
    this.footer.appendChild(closeBtn)
    closeBtn.focus()
  }

  private close(): void {
    this.dialog.close()
    this.dialog.remove()
  }

  private setState(key: StepKey, state: StepState): void {
    const row = this.rows.get(key)
    if (!row) return
    row.dataset.state = state
    const icon = row.querySelector('.export-modal__icon')
    if (icon) icon.textContent = state === 'done' ? '✓' : state === 'active' ? '' : ''
  }
}
