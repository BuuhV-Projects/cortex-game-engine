import { h, icon } from './ui'
import { t } from './i18n'

/**
 * Dock esquerdo do redesign (Layout A): abas **Hierarquia** | **Projeto** + um
 * campo de busca, e dois panes. A hierarquia (EditorPanels.outliner) e a árvore
 * de arquivos (FileTree) montam-se nos panes via {@link hierarchyPane} /
 * {@link filesPane}. O search filtra a aba ativa (dispara `hierarchy-filter` /
 * `files-filter`).
 */
export class LeftDock {
  private container: HTMLElement
  private hierPane!: HTMLElement
  private filePane!: HTMLElement
  private searchInput!: HTMLInputElement
  private tabHierBtn!: HTMLButtonElement
  private tabFileBtn!: HTMLButtonElement
  private tab: 'hier' | 'files' = 'hier'

  constructor(container: HTMLElement) {
    this.container = container
  }

  get hierarchyPane(): HTMLElement {
    return this.hierPane
  }
  get filesPane(): HTMLElement {
    return this.filePane
  }

  init(): void {
    this.build()
    document.addEventListener('locale-change', () => this.build())
    // Ao abrir/aparecer a hierarquia (jogo conectou), foca nela.
    document.addEventListener('editor-active-change', () => {
      if (this.tab !== 'hier') return
    })
  }

  private build(): void {
    this.container.innerHTML = ''
    this.container.className = 'panel left-dock'

    const tabHier = h('button', { class: 'tab', onClick: () => this.setTab('hier') }, icon('cube', { size: 13 }), t('editor.hierarchy')) as HTMLButtonElement
    const projLabel = t('editor.project')
    const tabFile = h('button', { class: 'tab', onClick: () => this.setTab('files') }, icon('folder', { size: 13, fill: true }), projLabel === 'editor.project' ? 'Projeto' : projLabel) as HTMLButtonElement
    this.tabHierBtn = tabHier
    this.tabFileBtn = tabFile

    const header = h('div', { class: 'panel-h', style: 'padding:0;height:36px' },
      h('div', { class: 'tabs grow' }, tabHier, tabFile),
      h('button', { class: 'hbtn', title: t('fileTree.tooltip_new_file'), onClick: () => this.onPlus() }, icon('plus', { size: 14 })),
    )

    const search = h('input', {
      placeholder: 'Filtrar objetos…',
      onInput: () => this.emitFilter(),
    }) as HTMLInputElement
    this.searchInput = search
    const searchRow = h('div', { class: 'left-dock-search' },
      h('div', { class: 'search grow' }, icon('search', { size: 13 }), search),
    )

    const hierPane = h('div', { class: 'left-pane' })
    const filePane = h('div', { class: 'left-pane' })
    this.hierPane = hierPane
    this.filePane = filePane

    this.container.append(header, searchRow, hierPane, filePane)
    this.applyTab()
  }

  private setTab(tab: 'hier' | 'files'): void {
    if (this.tab === tab) return
    this.tab = tab
    this.searchInput.value = ''
    this.emitFilter()
    this.applyTab()
  }

  private applyTab(): void {
    const isHier = this.tab === 'hier'
    this.tabHierBtn.classList.toggle('on', isHier)
    this.tabFileBtn.classList.toggle('on', !isHier)
    this.hierPane.style.display = isHier ? '' : 'none'
    this.filePane.style.display = isHier ? 'none' : ''
    this.searchInput.placeholder = isHier ? 'Filtrar objetos…' : 'Buscar arquivos…'
  }

  private emitFilter(): void {
    const q = this.searchInput.value
    document.dispatchEvent(
      new CustomEvent(this.tab === 'hier' ? 'hierarchy-filter' : 'files-filter', { detail: { query: q } }),
    )
  }

  private onPlus(): void {
    // Hierarquia: adicionar objeto (futuro). Projeto: novo arquivo.
    if (this.tab === 'files') document.dispatchEvent(new CustomEvent('request-new-file'))
  }
}
