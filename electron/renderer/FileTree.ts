import { customPrompt } from './customPrompt'
import { t } from './i18n'
import type { FileEntry } from './types'

const STORAGE_KEY = 'fileTree_projectDir'

/**
 * Mapeia extensão → glyph curto + classe de cor. Glyphs são caracteres
 * unicode/curtos pra evitar dep de assets/svg externos. Tones casam com
 * cores definidas em styles.css (.filetree-file-icon--ts, --js, etc.).
 */
function fileIconFor(name: string): { glyph: string; tone: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'ts':
    case 'tsx':
      return { glyph: 'TS', tone: 'ts' }
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return { glyph: 'JS', tone: 'js' }
    case 'json':
      return { glyph: '{}', tone: 'json' }
    case 'html':
    case 'htm':
      return { glyph: '<>', tone: 'html' }
    case 'css':
      return { glyph: '#', tone: 'css' }
    case 'md':
      return { glyph: 'M↓', tone: 'md' }
    case 'glb':
    case 'gltf':
    case 'obj':
    case 'fbx':
      return { glyph: '3D', tone: 'model' }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
      return { glyph: '◳', tone: 'img' }
    case 'lock':
      return { glyph: '🔒', tone: 'default' }
    default:
      return { glyph: '·', tone: 'default' }
  }
}

export class FileTree {
  private container: HTMLElement
  private projectDir: string | null = null
  private treeArea: HTMLElement | null = null
  private activeContextMenu: HTMLElement | null = null

  // Header estilo Cursor
  private headerToggleEl: HTMLButtonElement | null = null
  private projectLabelEl: HTMLElement | null = null
  private treeCollapsed = false

  constructor(container: HTMLElement) {
    this.container = container
    this.projectDir = localStorage.getItem(STORAGE_KEY)
  }

  // ── Helpers do header ──────────────────────────────────────────────────────

  private projectLabelText(): string {
    if (!this.projectDir) return t('fileTree.no_project')
    const name = this.projectDir.split(/[\\/]/).filter(Boolean).pop() ?? this.projectDir
    return name.toUpperCase()
  }

  private makeIconButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'filetree-icon-btn'
    btn.type = 'button'
    btn.title = title
    btn.setAttribute('aria-label', title)
    btn.textContent = icon
    btn.addEventListener('click', onClick)
    return btn
  }

  private toggleTreeCollapsed(): void {
    this.treeCollapsed = !this.treeCollapsed
    if (this.headerToggleEl) {
      this.headerToggleEl.textContent = this.treeCollapsed ? '›' : '⌄'
    }
    if (this.treeArea) {
      this.treeArea.style.display = this.treeCollapsed ? 'none' : ''
    }
  }

  /** Fecha todas as pastas expandidas sem perder o conteúdo carregado. */
  private collapseAll(): void {
    if (!this.treeArea) return
    for (const li of this.treeArea.querySelectorAll<HTMLLIElement>('.filetree-dir.expanded')) {
      li.classList.remove('expanded')
      const child = li.querySelector<HTMLUListElement>(':scope > .filetree-list')
      if (child) child.style.display = 'none'
    }
  }

  async init(): Promise<void> {
    this.buildShell()
    // Fecha context menu ao clicar fora
    document.addEventListener('click', () => this.dismissContextMenu())
    document.addEventListener('locale-change', () => {
      this.buildShell()
      void this.refresh()
    })
    // Recarrega a árvore quando o Chat IA executa uma tool que mexe no FS
    // (Write/Edit/Bash/MCP tools que escrevem arquivos).
    document.addEventListener('filetree-refresh', () => {
      void this.refresh()
    })
    if (this.projectDir) {
      // Anuncia o projeto restaurado do localStorage para os demais
      // componentes (Chat, BottomPanel, Preview). Adia para o próximo
      // microtask para garantir que os listeners dos outros componentes
      // já estejam registrados (o FileTree é instanciado/init antes deles).
      const path = this.projectDir
      queueMicrotask(() => {
        document.dispatchEvent(
          new CustomEvent<{ path: string }>('project-open', { detail: { path } }),
        )
      })
      await this.refresh()
    }
  }

  /**
   * Abre um projeto pelo caminho absoluto: persiste no localStorage e recarrega a árvore.
   * Chamado externamente quando o evento 'project-open' é despachado (ex.: pelo ProjectManager).
   */
  async openProject(path: string): Promise<void> {
    this.projectDir = path
    localStorage.setItem(STORAGE_KEY, this.projectDir)
    if (this.projectLabelEl) this.projectLabelEl.textContent = this.projectLabelText()
    await this.refresh()
  }

  /** Fecha o projeto: limpa a árvore, o label e o localStorage (volta ao estado sem projeto). */
  closeProject(): void {
    this.projectDir = null
    localStorage.removeItem(STORAGE_KEY)
    if (this.projectLabelEl) this.projectLabelEl.textContent = this.projectLabelText()
    if (this.treeArea) this.treeArea.innerHTML = ''
  }

  private buildShell(): void {
    this.container.innerHTML = ''

    // "Novo Projeto" e "Abrir Projeto" agora vivem na toolbar/menu da casca nova
    // (Shell). A sidebar começa direto no header da árvore.

    // ── Header da árvore: chevron + nome do projeto + ações à direita ─────
    const treeHeader = document.createElement('div')
    treeHeader.className = 'filetree-tree-header'

    const headerToggle = document.createElement('button')
    headerToggle.className = 'filetree-tree-header-toggle'
    headerToggle.type = 'button'
    headerToggle.title = t('fileTree.tooltip_toggle_tree')
    headerToggle.textContent = this.treeCollapsed ? '›' : '⌄'
    headerToggle.addEventListener('click', () => this.toggleTreeCollapsed())
    this.headerToggleEl = headerToggle

    const projectLabel = document.createElement('span')
    projectLabel.className = 'filetree-project-label'
    projectLabel.textContent = this.projectLabelText()
    this.projectLabelEl = projectLabel

    const headerActions = document.createElement('div')
    headerActions.className = 'filetree-header-actions'

    headerActions.appendChild(
      this.makeIconButton('📄', t('fileTree.tooltip_new_file'), () =>
        void this.createFileIn(this.projectDir),
      ),
    )
    headerActions.appendChild(
      this.makeIconButton('📁', t('fileTree.tooltip_new_folder'), () =>
        void this.createDirIn(this.projectDir),
      ),
    )
    headerActions.appendChild(
      this.makeIconButton('↻', t('fileTree.tooltip_reload'), () => void this.refresh()),
    )
    headerActions.appendChild(
      this.makeIconButton('⇡', t('fileTree.tooltip_collapse_all'), () => this.collapseAll()),
    )

    treeHeader.appendChild(headerToggle)
    treeHeader.appendChild(projectLabel)
    treeHeader.appendChild(headerActions)
    this.container.appendChild(treeHeader)

    // Área da árvore
    const treeArea = document.createElement('div')
    treeArea.className = 'filetree-area'
    // Drop na própria área cai como drop na raiz do projeto
    this.attachDropTarget(treeArea, () => this.projectDir)
    this.container.appendChild(treeArea)
    this.treeArea = treeArea
  }

  // ── Ações de criar (recebem o diretório de destino) ─────────────────────────

  private async createFileIn(dirPath: string | null): Promise<void> {
    if (!dirPath) {
      alert(t('fileTree.open_first_for_files'))
      return
    }
    const name = await customPrompt(t('fileTree.prompt_file_name'), {
      placeholder: t('fileTree.placeholder_file'),
    })
    if (!name || name.trim() === '') return
    try {
      await window.electronAPI.createFile(dirPath, name.trim())
      await this.refresh()
    } catch (err) {
      alert(`${t('fileTree.error_create_file')} ${String(err)}`)
    }
  }

  private async createDirIn(dirPath: string | null): Promise<void> {
    if (!dirPath) {
      alert(t('fileTree.open_first_for_folders'))
      return
    }
    const name = await customPrompt(t('fileTree.prompt_folder_name'), {
      placeholder: t('fileTree.placeholder_folder'),
    })
    if (!name || name.trim() === '') return
    try {
      await window.electronAPI.createDir(dirPath, name.trim())
      await this.refresh()
    } catch (err) {
      alert(`${t('fileTree.error_create_folder')} ${String(err)}`)
    }
  }

  /**
   * Abre o diálogo nativo do SO para selecionar a pasta do projeto e
   * notifica os outros componentes (Chat, Preview, BottomPanel, etc.)
   * via evento `project-open` — quem escuta esse evento chama de volta
   * `openProject()` neste mesmo FileTree, atualizando localStorage e
   * recarregando a árvore.
   *
   * Substitui o antigo `<input webkitdirectory>` que dependia da
   * propriedade não-padrão `File.path` do Electron, removida no
   * Electron 32+.
   */
  private async handleOpenProject(): Promise<void> {
    const path = await window.electronAPI.selectDirectory()
    if (!path) return
    document.dispatchEvent(
      new CustomEvent<{ path: string }>('project-open', { detail: { path } }),
    )
  }

  private async refresh(): Promise<void> {
    if (this.projectLabelEl) this.projectLabelEl.textContent = this.projectLabelText()
    if (!this.projectDir || !this.treeArea) return

    this.treeArea.innerHTML = `<p class="filetree-loading">${t('fileTree.loading')}</p>`
    try {
      const entries = await window.electronAPI.readDir(this.projectDir)
      const ul = this.buildList(entries)
      this.treeArea.innerHTML = ''
      this.treeArea.appendChild(ul)
    } catch (err) {
      this.treeArea.innerHTML = `<p class="filetree-error">${t('fileTree.error_read_dir')} ${String(err)}</p>`
    }
  }

  /**
   * Constrói uma `<ul>` a partir de um array de entradas.
   * Pastas são expansíveis via clique (carregamento lazy via readDir).
   */
  private buildList(entries: FileEntry[]): HTMLUListElement {
    const ul = document.createElement('ul')
    ul.className = 'filetree-list'

    // Pastas primeiro, depois arquivos; ambos em ordem alfabética
    const sorted = [...entries].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of sorted) {
      ul.appendChild(this.buildItem(entry))
    }

    return ul
  }

  private buildItem(entry: FileEntry): HTMLLIElement {
    const li = document.createElement('li')
    li.className = entry.isDir ? 'filetree-dir' : 'filetree-file'
    li.dataset['path'] = entry.path

    const label = document.createElement('span')
    label.className = 'filetree-label'

    // Ícone por tipo de arquivo (file-icons estilo Cursor)
    if (!entry.isDir) {
      const icon = document.createElement('span')
      const { glyph, tone } = fileIconFor(entry.name)
      icon.className = `filetree-file-icon filetree-file-icon--${tone}`
      icon.textContent = glyph
      label.appendChild(icon)
    }

    const name = document.createElement('span')
    name.className = 'filetree-name'
    name.textContent = entry.name
    label.appendChild(name)

    li.appendChild(label)

    // Context menu (botão direito) — Itens dependem se é pasta ou arquivo
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.showContextMenuFor(entry, e.clientX, e.clientY)
    })

    // Drag para mover (arquivos e pastas)
    label.draggable = true
    label.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', entry.path)
      e.dataTransfer!.effectAllowed = 'move'
    })

    if (entry.isDir) {
      // Pastas aceitam drop (move arquivo/pasta pra dentro delas)
      this.attachDropTarget(li, () => entry.path)
      this.attachDirBehavior(li, label, entry)
    } else {
      label.addEventListener('click', () => {
        document.dispatchEvent(
          new CustomEvent<{ path: string; name: string }>('file-open', {
            detail: { path: entry.path, name: entry.name },
          }),
        )
      })
    }

    return li
  }

  /** Adiciona comportamento de expansão lazy a um item de diretório. */
  private attachDirBehavior(li: HTMLLIElement, label: HTMLSpanElement, entry: FileEntry): void {
    let expanded = false
    let childUl: HTMLUListElement | null = null

    label.addEventListener('click', async () => {
      expanded = !expanded
      li.classList.toggle('expanded', expanded)

      if (expanded) {
        if (!childUl) {
          li.classList.add('loading')
          try {
            const subEntries = await window.electronAPI.readDir(entry.path)
            childUl = this.buildList(subEntries)
            li.appendChild(childUl)
          } catch {
            li.classList.add('error')
            expanded = false
            li.classList.remove('expanded')
          } finally {
            li.classList.remove('loading')
          }
        } else {
          childUl.style.display = ''
        }
      } else {
        if (childUl) childUl.style.display = 'none'
      }
    })
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  /**
   * Marca o elemento como destino de drop. `getDestDir` é resolvido na hora
   * do drop (pasta destino), permitindo passar lazily o path do projeto raiz.
   */
  private attachDropTarget(el: HTMLElement, getDestDir: () => string | null): void {
    el.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer!.dropEffect = 'move'
      el.classList.add('drop-target')
    })
    el.addEventListener('dragleave', (e) => {
      e.stopPropagation()
      el.classList.remove('drop-target')
    })
    el.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      el.classList.remove('drop-target')
      const src = e.dataTransfer?.getData('text/plain')
      const dest = getDestDir()
      if (!src || !dest) return
      void this.moveItem(src, dest)
    })
  }

  private async moveItem(src: string, destDir: string): Promise<void> {
    // Não mover pra si mesmo nem pra dentro do próprio caminho (loop)
    if (src === destDir) return
    // Path do destino final = destDir/<nome do src>
    const name = src.split(/[\\/]/).pop() ?? ''
    const dest = `${destDir}${destDir.endsWith('\\') || destDir.endsWith('/') ? '' : (destDir.includes('\\') ? '\\' : '/')}${name}`
    try {
      await window.electronAPI.move(src, dest)
      await this.refresh()
    } catch (err) {
      alert(`Erro ao mover: ${String(err)}`)
    }
  }

  // ── Context Menu ───────────────────────────────────────────────────────────

  private showContextMenuFor(entry: FileEntry, x: number, y: number): void {
    const items: Array<{ label: string; action: () => void }> = []
    if (entry.isDir) {
      items.push({ label: 'Novo arquivo aqui', action: () => void this.createFileIn(entry.path) })
      items.push({ label: 'Nova pasta aqui', action: () => void this.createDirIn(entry.path) })
    }
    items.push({
      label: entry.isDir ? 'Apagar pasta' : 'Apagar arquivo',
      action: () => void this.deleteEntry(entry),
    })
    this.openContextMenu(items, x, y)
  }

  private openContextMenu(
    items: Array<{ label: string; action: () => void }>,
    x: number,
    y: number,
  ): void {
    this.dismissContextMenu()
    const menu = document.createElement('div')
    menu.className = 'filetree-context-menu'
    menu.style.left = `${x}px`
    menu.style.top = `${y}px`
    for (const item of items) {
      const btn = document.createElement('button')
      btn.className = 'filetree-context-item'
      btn.textContent = item.label
      btn.addEventListener('click', () => {
        this.dismissContextMenu()
        item.action()
      })
      menu.appendChild(btn)
    }
    document.body.appendChild(menu)
    this.activeContextMenu = menu
  }

  private dismissContextMenu(): void {
    this.activeContextMenu?.remove()
    this.activeContextMenu = null
  }

  private async deleteEntry(entry: FileEntry): Promise<void> {
    const ok = window.confirm(`Apagar ${entry.isDir ? 'pasta' : 'arquivo'} "${entry.name}"?`)
    if (!ok) return
    try {
      await window.electronAPI.deletePath(entry.path)
      await this.refresh()
    } catch (err) {
      alert(`Erro ao apagar: ${String(err)}`)
    }
  }
}
