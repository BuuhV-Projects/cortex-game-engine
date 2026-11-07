import { h } from './ui'
import { t } from './i18n'
import { debug } from '../../src/core/debug'
import { configRelPath, rigOutcome, sheetPathOf, stripAnsi, type RigAction } from './characterRig'
import type { RigBuildKind, RigEntry } from './characterRigRegistry'
import {
  existingBuilds,
  hasRigPipeline,
  listCharacterConfigs,
  loadRigRegistry,
  rigPanelMode,
  type ConfigEntry,
  type RigPanelMode,
  type RigTab,
} from './characterRigProject'
import { RigAnimationPreview } from './RigAnimationPreview'
import { RigFbxSelection } from './RigFbxSelection'
import { RigMarkerView } from './RigMarkerView'

/**
 * Painel **character-auto-rig** (SPEC-0349): marca queixo, pulsos, cotovelos,
 * joelhos e virilha num personagem GLB, como o auto-rigger do Mixamo, grava
 * `tools/characters/<CODE>.markers.json` e roda o `prepare-character.sh` do jogo.
 *
 * Abas (adendo 1): **Marcadores** (`RigMarkerView`), **Animações** (prévia do GLB
 * do registro de rigs, `RigAnimationPreview`) e **Pasta** (seleção dos FBX,
 * `RigFbxSelection`). Sem o `prepare-character.sh` no projeto (só o GLB
 * publicado, SPEC-0704) fica só a aba Animações, sem gerar nem revisar.
 */

export type { RigTab } from './characterRigProject'

const SCOPE = 'characterRig'
/** Mesma chave do FileTree/Shell para o projeto aberto. */
const PROJECT_KEY = 'fileTree_projectDir'
/** Teto do log em caracteres (o script do jogo é verboso em `--from`). */
const LOG_MAX_CHARS = 200_000
/** Código de saída assumido quando o script nem chegou a rodar (falha de infra). */
const INFRA_EXIT_CODE = 2
const ALL_TABS: RigTab[] = ['markers', 'animations', 'folder']

/** Liga o evento `character-rig-requested` (menu Projeto / botão direito na árvore). */
export function installCharacterRig(): void {
  document.addEventListener('character-rig-requested', (e) => {
    const detail = (e as CustomEvent<{ configPath?: string; tab?: RigTab } | undefined>).detail
    void openCharacterRig(detail?.configPath, detail?.tab)
  })
}

async function openCharacterRig(configPath?: string, tab: RigTab = 'markers'): Promise<void> {
  const projectDir = localStorage.getItem(PROJECT_KEY)
  if (!projectDir) {
    void window.electronAPI.infoDialog(t('characterRig.no_project'))
    return
  }
  const entries = await listCharacterConfigs(projectDir)
  if (!entries.length) {
    void window.electronAPI.infoDialog(t('characterRig.no_configs'))
    return
  }
  const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
  const initial = configPath ? entries.findIndex((e) => norm(e.path) === norm(configPath)) : 0
  if (initial < 0) {
    void window.electronAPI.infoDialog(t('characterRig.not_skinned'))
    return
  }
  const mode = rigPanelMode({ hasPipeline: await hasRigPipeline(projectDir) })
  debug(SCOPE, 'modo do painel', mode)
  new CharacterRigPanel(projectDir, entries, initial, tab, mode)
}

class CharacterRigPanel {
  private readonly dialog: HTMLDialogElement
  private readonly logCol: HTMLElement
  private readonly logEl: HTMLPreElement
  private readonly outcomeEl: HTMLElement
  private readonly sheetImg: HTMLImageElement
  private readonly reviewBar: HTMLElement
  private readonly approveBtn: HTMLButtonElement
  private readonly rejectBtn: HTMLButtonElement
  private readonly revertBtn: HTMLButtonElement
  private readonly saveBtn: HTMLButtonElement
  private readonly runBtn: HTMLButtonElement
  private readonly stopBtn: HTMLButtonElement
  private readonly tabBtns = new Map<RigTab, HTMLButtonElement>()
  private readonly tabBodies = new Map<RigTab, HTMLElement>()
  private readonly animNotice: HTMLElement
  private readonly markerView: RigMarkerView
  private readonly preview: RigAnimationPreview
  private readonly selection: RigFbxSelection
  private readonly folderRunBtn: HTMLButtonElement
  private tab: RigTab = 'markers'
  /** Aba pedida na abertura (Animações só depois de saber se há rig). */
  private wantedTab: RigTab | null = null
  private rig: RigEntry | null = null
  private awaitingReview = false
  private builds: RigBuildKind[] = []
  private entry: ConfigEntry
  private running = false
  private unsubscribeOutput: (() => void) | null = null
  private log = ''

  constructor(
    private readonly projectDir: string,
    private readonly entries: ConfigEntry[],
    initial: number,
    initialTab: RigTab,
    private readonly mode: RigPanelMode,
  ) {
    this.entry = entries[initial]!

    this.dialog = document.createElement('dialog')
    this.dialog.className = 'export-modal rig-modal'

    // ── Cabeçalho ───────────────────────────────────────────────────────────
    const select = h('select', { class: 'gs-input rig-select', title: t('characterRig.config') }) as HTMLSelectElement
    entries.forEach((e, i) => select.append(h('option', { value: String(i) }, `${e.config.code} — ${e.fileName}`)))
    select.value = String(initial)
    select.addEventListener('change', () => {
      this.entry = this.entries[Number(select.value)]!
      this.loadEntry()
    })
    const closeBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => this.dialog.close() }, t('characterRig.close'))
    const tabs = h('div', { class: 'rig-tabs' })
    tabs.setAttribute('role', 'tablist')
    for (const tab of ALL_TABS) {
      const btn = h('button', { class: 'rig-tab', type: 'button', 'data-tab': tab, onClick: () => this.setTab(tab) }, t(`characterRig.tab.${tab}`)) as HTMLButtonElement
      btn.setAttribute('role', 'tab')
      btn.hidden = !mode.tabs.includes(tab)
      this.tabBtns.set(tab, btn)
      tabs.append(btn)
    }
    const header = h('div', { class: 'rig-header' },
      h('div', { class: 'export-modal__header', style: { marginBottom: '0' } },
        h('h2', { class: 'export-modal__title' }, t('characterRig.title')),
        h('div', { class: 'export-modal__subtitle' }, t('characterRig.subtitle'))),
      tabs,
      h('span', { class: 'spacer', style: { flex: '1' } }),
      select,
      closeBtn,
    )

    // ── Aba Marcadores ──────────────────────────────────────────────────────
    this.saveBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.markerView.save(this.entry) }, t('characterRig.save')) as HTMLButtonElement
    this.runBtn = h('button', { class: 'export-modal__btn export-modal__btn--primary', type: 'button', onClick: () => void this.generate() }, t('characterRig.generate')) as HTMLButtonElement
    this.stopBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void window.electronAPI.characterRigStop() }, t('characterRig.stop')) as HTMLButtonElement
    this.stopBtn.hidden = true
    this.runBtn.hidden = !mode.canGenerate
    this.markerView = new RigMarkerView(this.dialog, h('div', { class: 'rig-actions' }, this.saveBtn, this.runBtn, this.stopBtn))

    // ── Log / folha ─────────────────────────────────────────────────────────
    this.outcomeEl = h('div', { class: 'rig-outcome' })
    this.logEl = h('pre', { class: 'rig-log__pre' }) as HTMLPreElement
    this.sheetImg = h('img', { class: 'rig-sheet', title: t('characterRig.sheet_open') }) as HTMLImageElement
    this.sheetImg.hidden = true
    this.sheetImg.addEventListener('click', () => {
      const path = sheetPathOf(this.projectDir, this.entry.config)
      if (path) void window.electronAPI.openPath(path)
    })
    // revisão da folha (código 3): publicar no jogo ou recusar; desfazer a última publicação
    this.approveBtn = h('button', { class: 'export-modal__btn export-modal__btn--primary', type: 'button', onClick: () => void this.run('approve') }, t('characterRig.review.approve')) as HTMLButtonElement
    this.rejectBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => this.reject() }, t('characterRig.review.reject')) as HTMLButtonElement
    this.revertBtn = h('button', { class: 'export-modal__btn export-modal__btn--secondary', type: 'button', onClick: () => void this.revert() }, t('characterRig.review.revert')) as HTMLButtonElement
    this.approveBtn.hidden = true
    this.rejectBtn.hidden = true
    this.revertBtn.hidden = true
    this.reviewBar = h('div', { class: 'rig-review' }, this.approveBtn, this.rejectBtn, this.revertBtn)
    this.reviewBar.hidden = !mode.canGenerate
    this.logCol = h('div', { class: 'rig-log' }, h('div', { class: 'rig-side__title' }, t('characterRig.log')), this.outcomeEl, this.reviewBar, this.sheetImg, this.logEl)

    // ── Abas Animações / Pasta ─────────────────────────────────────────────
    this.preview = new RigAnimationPreview()
    this.selection = new RigFbxSelection({
      onChange: () => void this.refreshPreview(),
      onPlay: (name) => {
        this.setTab('animations')
        this.preview.play(name)
      },
    })
    this.animNotice = h('div', { class: 'rig-notice' }, t('characterRig.anim.need_rig'))
    this.animNotice.hidden = true
    this.tabBtns.get('animations')!.disabled = true // até ler o registro
    this.folderRunBtn = h('button', { class: 'export-modal__btn export-modal__btn--primary', type: 'button', onClick: () => void this.generate() }, t('characterRig.generate')) as HTMLButtonElement
    this.folderRunBtn.hidden = !mode.canGenerate
    this.selection.footer.append(this.folderRunBtn)

    this.tabBodies.set('markers', this.markerView.el)
    this.tabBodies.set('animations', this.preview.el)
    this.tabBodies.set('folder', this.selection.el)
    const main = h('div', { class: 'rig-main' }, h('div', { class: 'rig-tabbody' }, ...this.tabBodies.values()), this.logCol)
    this.dialog.append(header, this.animNotice, main)
    document.body.appendChild(this.dialog)

    this.dialog.addEventListener('close', () => this.dispose())
    this.dialog.showModal()
    this.wantedTab = initialTab
    this.setTab(this.fallbackTab)
    this.loadEntry()
  }

  // ── Abas ──────────────────────────────────────────────────────────────────

  private get animationsEnabled(): boolean {
    return !!this.rig && this.builds.length > 0
  }

  /** Primeira aba do modo: Marcadores com o pipeline, Animações sem ele. */
  private get fallbackTab(): RigTab {
    return this.mode.tabs[0]!
  }

  private setTab(wanted: RigTab): void {
    const tab = this.mode.tabs.includes(wanted) ? wanted : this.fallbackTab
    // Animações sem rig fica bloqueada, a não ser que seja a única aba (aviso no topo).
    if (tab === 'animations' && !this.animationsEnabled && tab !== this.fallbackTab) return
    this.tab = tab
    for (const [k, btn] of this.tabBtns) {
      btn.classList.toggle('on', k === tab)
      btn.setAttribute('aria-selected', String(k === tab))
    }
    for (const [k, body] of this.tabBodies) body.hidden = k !== tab
    this.preview.setActive(tab === 'animations')
    if (tab === 'markers') this.markerView.draw()
  }

  /** Relê o registro de rigs e atualiza as abas Animações e Pasta. */
  private async loadRig(): Promise<void> {
    const code = this.entry.config.code
    const registry = await loadRigRegistry(this.projectDir)
    const rig = registry?.rigs[code] ?? null
    const builds = rig ? await existingBuilds(this.projectDir, rig) : []
    if (code !== this.entry.config.code) return
    this.rig = rig
    this.builds = builds
    this.updateReviewBar()
    const enabled = this.animationsEnabled
    const btn = this.tabBtns.get('animations')!
    btn.disabled = !enabled
    btn.title = enabled ? '' : t('characterRig.anim.need_rig')
    this.animNotice.hidden = enabled
    debug(SCOPE, 'registro de rigs', code, { noRegistro: !!rig, builds })
    if (!enabled && this.tab === 'animations') this.setTab(this.fallbackTab)
    if (this.wantedTab) {
      this.setTab(this.wantedTab === 'animations' && !enabled ? this.fallbackTab : this.wantedTab)
      this.wantedTab = null
    }
    await this.preview.reloadConfig(this.entry.path)
    this.selection.setRig(rig)
  }

  private async refreshPreview(): Promise<void> {
    await this.preview.show(this.rig && this.animationsEnabled
      ? { projectDir: this.projectDir, entry: this.rig, builds: this.builds, pending: this.selection.pending() }
      : null)
  }

  /** Troca de config: relê seleção/registro e, com o pipeline, o modelo e os marcadores. */
  private loadEntry(): void {
    this.rig = null
    this.builds = []
    this.tabBtns.get('animations')!.disabled = true // até reler o registro
    void this.selection.load(this.projectDir, this.entry.path, null).then(() => this.loadRig())
    // só o GLB publicado: não há fonte para marcar (SPEC-0704)
    if (this.mode.canGenerate) void this.markerView.load(this.projectDir, this.entry)
  }

  // ── Gerar / revisar ──────────────────────────────────────────────────────

  private appendLog(text: string): void {
    this.log = (this.log + stripAnsi(text)).slice(-LOG_MAX_CHARS)
    this.logEl.textContent = this.log
    this.logEl.scrollTop = this.logEl.scrollHeight
  }

  private setRunning(on: boolean): void {
    this.running = on
    this.runBtn.disabled = on
    this.folderRunBtn.disabled = on
    this.saveBtn.disabled = on
    this.stopBtn.hidden = !on
    this.preview.setBusy(on) // o pipeline regrava o GLB: o assado espera (SPEC-0704)
    this.updateReviewBar()
  }

  /** Aprovar/recusar só com uma folha aguardando revisão; desfazer só com rig publicado. */
  private updateReviewBar(): void {
    const reviewing = this.awaitingReview && !this.running
    this.approveBtn.hidden = !reviewing
    this.rejectBtn.hidden = !reviewing
    this.revertBtn.hidden = this.running || !this.rig?.published
  }

  /** Recusar não roda nada: o staging fica, nada é publicado; ajustar os marcadores e gerar de novo. */
  private reject(): void {
    this.awaitingReview = false
    this.outcomeEl.className = 'rig-outcome rejected'
    this.outcomeEl.textContent = t('characterRig.review.rejected')
    this.updateReviewBar()
    this.setTab('markers')
  }

  private async revert(): Promise<void> {
    if (!(await window.electronAPI.confirmDialog(t('characterRig.review.revert_confirm')))) return
    await this.run('revert')
  }

  /** Salva e roda `bash tools/prepare-character.sh --config tools/characters/<arquivo>`. */
  private async generate(): Promise<void> {
    if (this.running || !this.mode.canGenerate) return
    if (!(await this.markerView.save(this.entry))) {
      this.setTab('markers') // os erros dos marcadores aparecem lá
      return
    }
    if (!(await this.selection.save())) return
    if (!(await this.preview.saveArm()) || !(await this.preview.savePose())) {
      this.setTab('animations') // o erro aparece junto dos sliders / do painel de pose
      return
    }
    await this.run('generate')
  }

  /** Roda o script com a ação (gerar / `--approve` / `--revert`), mostra o resultado e relê o registro. */
  private async run(action: RigAction): Promise<void> {
    if (this.running || !this.mode.canGenerate) return
    const { config, fileName } = this.entry
    this.logCol.classList.add('on')
    this.log = ''
    this.logEl.textContent = ''
    this.awaitingReview = false
    if (action === 'generate') this.sheetImg.hidden = true
    this.outcomeEl.className = 'rig-outcome'
    this.outcomeEl.textContent = t(`characterRig.running_${action}`)
    this.setRunning(true)
    this.unsubscribeOutput = window.electronAPI.onCharacterRigOutput((text) => this.appendLog(text))
    let code = INFRA_EXIT_CODE
    try {
      code = (await window.electronAPI.characterRigRun(this.projectDir, configRelPath(fileName), action)).code
    } catch (err) {
      this.appendLog(`\n${String(err)}\n`)
    } finally {
      this.unsubscribeOutput?.()
      this.unsubscribeOutput = null
      this.setRunning(false)
    }
    const outcome = rigOutcome(code, action)
    debug(SCOPE, 'prepare-character terminou', config.code, action, code, outcome)
    this.outcomeEl.textContent = t(`characterRig.outcome.${outcome}`, { code })
    this.outcomeEl.classList.add(outcome)
    this.awaitingReview = outcome === 'review'
    if (outcome !== 'infra') await this.loadRig()
    this.updateReviewBar()
    if (outcome === 'published' || outcome === 'reverted') this.sheetImg.hidden = true
    const sheet = sheetPathOf(this.projectDir, config)
    if (outcome === 'review' && sheet) {
      try {
        this.sheetImg.src = `data:image/png;base64,${await window.electronAPI.readFileBase64(sheet)}`
        this.sheetImg.hidden = false
      } catch {
        this.appendLog(`\n${t('characterRig.sheet_missing', { file: sheet })}\n`)
      }
    }
  }

  private dispose(): void {
    if (this.running) void window.electronAPI.characterRigStop()
    this.unsubscribeOutput?.()
    this.preview.dispose()
    this.markerView.dispose()
    this.dialog.remove()
  }
}
