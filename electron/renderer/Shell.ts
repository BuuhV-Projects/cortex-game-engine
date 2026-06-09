import { h, icon } from './ui'
import { t } from './i18n'

/** `t` com fallback: usa a tradução se a chave existir, senão o texto dado. */
function tr(key: string, fallback: string): string {
  const v = t(key)
  return v === key ? fallback : v
}

/**
 * Casca nova do studio (redesign / Layout A): **MenuBar** (marca + menus
 * funcionais + botões de janela) e **Toolbar** (Novo Projeto / Abrir / transport
 * Play·Stop / chip RODANDO / leitura de câmera / ícones). Monta-se acima do
 * `#app` existente (sem mexer no grid/resizer) e religa-se aos eventos que os
 * componentes já usam (`request-new-project`, `project-open/close`,
 * `play-started/stopped`, `build-installer-requested`).
 */
export class Shell {
  private menubarEl: HTMLElement
  private toolbarEl: HTMLElement
  private projectLabelEl: HTMLElement | null = null
  private transportEl: HTMLElement | null = null
  private runChipEl: HTMLElement | null = null
  private running = false
  private projectName: string | null = null
  private openMenu: HTMLElement | null = null

  constructor(menubarEl: HTMLElement, toolbarEl: HTMLElement) {
    this.menubarEl = menubarEl
    this.toolbarEl = toolbarEl
  }

  init(): void {
    this.build()
    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      this.projectName = path.split(/[\\/]/).filter(Boolean).pop() ?? path
      this.syncProjectLabel()
    })
    document.addEventListener('project-close', () => {
      this.projectName = null
      this.syncProjectLabel()
    })
    document.addEventListener('play-started', () => this.setRunning(true))
    document.addEventListener('play-stopped', () => this.setRunning(false))
    document.addEventListener('locale-change', () => this.build())
    // Fecha menu aberto ao clicar fora / Esc.
    document.addEventListener('click', (e) => {
      if (this.openMenu && !this.openMenu.contains(e.target as Node)) this.closeMenu()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenu()
    })
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  private build(): void {
    this.buildMenuBar()
    this.buildToolbar()
    this.syncProjectLabel()
    this.syncTransport()
  }

  private buildMenuBar(): void {
    this.menubarEl.className = 'menubar'
    this.menubarEl.textContent = ''

    const brand = h('div', { class: 'brand' }, h('span', { class: 'logo' }), 'cortex')

    const menus = h('div', { class: 'row', style: 'gap:1px;-webkit-app-region:no-drag' })
    menus.append(
      this.menuItem('File', [
        { label: tr('projectManager.new_project', 'Novo Projeto'), run: () => document.dispatchEvent(new CustomEvent('request-new-project')) },
        { label: tr('fileTree.open_project', 'Abrir Projeto'), run: () => void this.openProject() },
        { sep: true },
        { label: tr('menu.close_project', 'Fechar projeto'), run: () => document.dispatchEvent(new CustomEvent('project-close')) },
      ]),
      this.menuItem('Edit', [
        { label: tr('menu.reload_tree', 'Recarregar árvore'), run: () => document.dispatchEvent(new CustomEvent('filetree-refresh')) },
      ]),
      this.menuItem('View', [
        { label: 'English', run: () => void this.setLocale('en') },
        { label: 'Português', run: () => void this.setLocale('pt') },
      ]),
      this.menuItem('Projeto', [
        { label: tr('menu.build_installer', 'Gerar instalador…'), run: () => document.dispatchEvent(new CustomEvent('build-installer-requested', { detail: { debug: false } })) },
        { label: tr('menu.build_installer_debug', 'Gerar instalador (debug)…'), run: () => document.dispatchEvent(new CustomEvent('build-installer-requested', { detail: { debug: true } })) },
        { sep: true },
        { label: tr('menu.close_project', 'Fechar projeto'), run: () => document.dispatchEvent(new CustomEvent('project-close')) },
      ]),
      this.menuItem('Window', [
        { label: tr('menu.minimize', 'Minimizar'), run: () => void window.electronAPI.windowMinimize?.() },
        { label: tr('menu.maximize', 'Maximizar'), run: () => void window.electronAPI.windowMaximize?.() },
        { label: tr('menu.close', 'Fechar'), run: () => void window.electronAPI.windowClose?.() },
      ]),
    )

    const label = h('span', { class: 'mi muted', style: { fontSize: '11.5px' } })
    this.projectLabelEl = label

    const winbtns = h('div', { class: 'winbtns' },
      h('span', { class: 'winbtn', title: 'Minimizar', onClick: () => void window.electronAPI.windowMinimize?.() }, icon('min', { size: 13 })),
      h('span', { class: 'winbtn', title: 'Maximizar', onClick: () => void window.electronAPI.windowMaximize?.() }, icon('max', { size: 11 })),
      h('span', { class: 'winbtn close', title: 'Fechar', onClick: () => void window.electronAPI.windowClose?.() }, icon('close', { size: 12 })),
    )

    this.menubarEl.append(brand, menus, h('span', { class: 'spacer' }), label, winbtns)
  }

  private menuItem(name: string, items: Array<{ label?: string; sep?: boolean; run?: () => void }>): HTMLElement {
    const btn = h('span', { class: 'mi' }, name)
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this.openMenu && this.openMenu.dataset['for'] === name) {
        this.closeMenu()
        return
      }
      this.closeMenu()
      const rect = btn.getBoundingClientRect()
      const menu = h('div', { class: 'cge-menu', 'data-for': name, style: { left: `${rect.left}px`, top: `${rect.bottom + 2}px` } })
      for (const it of items) {
        if (it.sep) {
          menu.append(h('div', { class: 'cge-menu-sep' }))
          continue
        }
        const item = h('button', { class: 'cge-menu-item' }, it.label ?? '')
        item.addEventListener('click', () => {
          this.closeMenu()
          it.run?.()
        })
        menu.append(item)
      }
      document.body.append(menu)
      this.openMenu = menu
    })
    return btn
  }

  private closeMenu(): void {
    this.openMenu?.remove()
    this.openMenu = null
  }

  private buildToolbar(): void {
    this.toolbarEl.className = 'cge-toolbar row'
    this.toolbarEl.textContent = ''

    const newBtn = h('button', { class: 'btn accent sm', onClick: () => document.dispatchEvent(new CustomEvent('request-new-project')) }, icon('plus', { size: 13 }), tr('projectManager.new_project', 'Novo Projeto'))
    const openBtn = h('button', { class: 'btn ghost sm', onClick: () => void this.openProject() }, icon('folder', { size: 13, fill: true }), tr('fileTree.open_project', 'Abrir'))

    // Transport (Play/Stop + pause + refresh).
    const transport = h('div', { class: 'row gap-6' })
    this.transportEl = transport

    // Chip RODANDO (visível só rodando).
    const runChip = h('span', { class: 'chip run' }, h('span', { class: 'dot' }), tr('preview.status_running', 'Rodando').toUpperCase())
    this.runChipEl = runChip

    // Leitura de câmera (placeholder; ligada ao editor via ponte depois).
    const camPill = h('span', { class: 'vp-pill', style: { background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--tx)' } },
      icon('camera', { size: 13, color: 'var(--tx-lo)' }),
      h('span', { class: 'vp-coords', style: { fontSize: '11px' }, html: 'cam <b>—</b>' }),
    )

    this.toolbarEl.append(
      newBtn, openBtn,
      h('div', { class: 'divx' }),
      transport, runChip,
      h('span', { class: 'spacer' }),
      camPill,
      h('button', { class: 'iconbtn', title: 'Layout' }, icon('layout', { size: 16 })),
      h('button', { class: 'iconbtn', title: 'Grid' }, icon('grid', { size: 16 })),
      h('button', { class: 'iconbtn', title: 'Tela cheia', onClick: () => document.dispatchEvent(new CustomEvent('request-fullscreen-toggle')) }, icon('expand', { size: 15 })),
      h('button', { class: 'iconbtn', title: 'Configurações' }, icon('gear', { size: 16 })),
    )
    this.syncTransport()
  }

  // ── Estado ─────────────────────────────────────────────────────────────────

  private setRunning(running: boolean): void {
    this.running = running
    this.syncTransport()
  }

  private syncTransport(): void {
    if (!this.transportEl) return
    this.transportEl.textContent = ''
    const toggle = this.running
      ? h('button', { class: 'btn stop', onClick: () => document.dispatchEvent(new CustomEvent('request-play-toggle')) }, icon('stop', { size: 13, fill: true }), 'Stop')
      : h('button', { class: 'btn play', onClick: () => document.dispatchEvent(new CustomEvent('request-play-toggle')) }, icon('play', { size: 13, fill: true }), 'Play')
    this.transportEl.append(
      toggle,
      h('button', { class: 'iconbtn', title: 'Pausar' }, icon('pause', { size: 15 })),
      h('button', { class: 'iconbtn', title: 'Recarregar', onClick: () => document.dispatchEvent(new CustomEvent('request-play-reload')) }, icon('refresh', { size: 15 })),
    )
    if (this.runChipEl) this.runChipEl.style.display = this.running ? '' : 'none'
  }

  private syncProjectLabel(): void {
    if (this.projectLabelEl) this.projectLabelEl.textContent = this.projectName ?? ''
  }

  // ── Ações ─────────────────────────────────────────────────────────────────

  private async openProject(): Promise<void> {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    document.dispatchEvent(new CustomEvent<{ path: string }>('project-open', { detail: { path } }))
  }

  private async setLocale(locale: 'en' | 'pt'): Promise<void> {
    const { setLocale } = await import('./i18n')
    await setLocale(locale)
  }
}
