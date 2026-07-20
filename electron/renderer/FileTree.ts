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
  private fileFilter = ''
  /**
   * Re-expansões async em andamento (refresh reconstrói a árvore e re-expande as
   * pastas de `expandedPaths` em background). O `refresh` espera TODAS antes de
   * restaurar o scroll — restaurar com a árvore ainda curta clampava pro topo.
   */
  private pendingExpands: Promise<void>[] = []
  /** Paths de pastas expandidas — persiste entre refreshes (real-time não colapsa). */
  private readonly expandedPaths = new Set<string>()
  /** Debounce do refresh disparado pelo watcher de fs (mudanças em rajada). */
  private watchTimer: ReturnType<typeof setTimeout> | null = null

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

  /** Caminho relativo ao projeto com `/` (URL servível pelo Vite), ou null se fora dele. */
  private projectRelative(absPath: string): string | null {
    if (!this.projectDir) return null
    const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')
    const root = norm(this.projectDir)
    const abs = norm(absPath)
    if (!abs.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return null
    return abs.slice(root.length + 1)
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
    this.expandedPaths.clear()
    if (!this.treeArea) return
    for (const li of this.treeArea.querySelectorAll<HTMLLIElement>('.filetree-dir.expanded')) {
      li.classList.remove('expanded')
      const child = li.querySelector<HTMLUListElement>(':scope > .filetree-list')
      if (child) child.style.display = 'none'
    }
  }

  /**
   * Filtra a árvore renderizada por nome (busca da aba Projeto). Mostra um item se
   * o nome casa OU se tem um descendente (já carregado) que casa — pastas não
   * expandidas não têm filhos no DOM (carregamento lazy), então não são varridas.
   */
  private applyFileFilter(q: string): void {
    this.fileFilter = q
    if (!this.treeArea) return
    const lis = Array.from(this.treeArea.querySelectorAll<HTMLLIElement>('li'))
    if (!q) {
      for (const li of lis) li.style.display = ''
      return
    }
    const selfMatch = new Map<HTMLLIElement, boolean>()
    for (const li of lis) {
      const name = (li.querySelector('.filetree-name')?.textContent ?? '').toLowerCase()
      selfMatch.set(li, name.includes(q))
    }
    for (const li of lis) {
      let show = selfMatch.get(li) ?? false
      if (!show) {
        for (const d of li.querySelectorAll<HTMLLIElement>('li')) {
          if (selfMatch.get(d)) {
            show = true
            break
          }
        }
      }
      li.style.display = show ? '' : 'none'
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
    // Tempo real: o main observa o projeto (fs.watch) e avisa aqui a cada mudança
    // no disco (criar/apagar/salvar/git/etc.). Debounce pra rajadas (ex.: git, build).
    window.electronAPI.onProjectFilesChanged?.(() => {
      if (this.watchTimer) clearTimeout(this.watchTimer)
      this.watchTimer = setTimeout(() => void this.refresh(), 200)
    })
    // Busca da aba Projeto (LeftDock) — filtra a árvore renderizada por nome.
    document.addEventListener('files-filter', (e) => {
      this.applyFileFilter((((e as CustomEvent<{ query: string }>).detail.query) || '').toLowerCase())
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
      window.electronAPI.watchProject?.(path)
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
    this.expandedPaths.clear() // outro projeto — estado de expansão não se aplica
    if (this.projectLabelEl) this.projectLabelEl.textContent = this.projectLabelText()
    window.electronAPI.watchProject?.(path)
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
      void window.electronAPI.infoDialog(t('fileTree.open_first_for_files'))
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
      void window.electronAPI.errorDialog(t('fileTree.error_create_file'), String(err))
    }
  }

  private async createDirIn(dirPath: string | null): Promise<void> {
    if (!dirPath) {
      void window.electronAPI.infoDialog(t('fileTree.open_first_for_folders'))
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
      void window.electronAPI.errorDialog(t('fileTree.error_create_folder'), String(err))
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

    const scroll = this.treeArea.scrollTop // preserva o scroll (refresh em tempo real)
    try {
      const entries = await window.electronAPI.readDir(this.projectDir)
      const ul = this.buildList(entries) // buildItem re-expande pastas de expandedPaths
      this.treeArea.innerHTML = ''
      this.treeArea.appendChild(ul)
      if (this.fileFilter) this.applyFileFilter(this.fileFilter)
      // Espera as re-expansões (recursivas: expandir pai agenda os filhos) antes
      // de restaurar o scroll — com a árvore curta, o scrollTop clampava pro topo.
      while (this.pendingExpands.length) await Promise.all(this.pendingExpands.splice(0))
      this.treeArea.scrollTop = scroll
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

    // Drag para mover (arquivos e pastas). Modelos 3D também carregam o MIME de
    // asset com a URL relativa ao projeto — soltar no viewport do Preview adiciona
    // o modelo à cena onde o mouse aponta (o editor no iframe trata o drop; DnD
    // nativo cruza a fronteira do iframe). SPEC-0090.
    label.draggable = true
    label.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', entry.path)
      e.dataTransfer!.effectAllowed = 'move'
      const rel = this.projectRelative(entry.path)
      if (!entry.isDir && rel && /\.(glb|gltf)$/i.test(entry.name)) {
        e.dataTransfer?.setData('application/x-cortex-asset', rel)
        e.dataTransfer!.effectAllowed = 'copyMove'
        // Avisa o Preview pra armar o overlay de drop sobre o palco (o Electron
        // não entrega DnD nativo pra dentro do iframe do jogo).
        document.dispatchEvent(new CustomEvent('asset-drag', { detail: { active: true, url: rel } }))
      }
    })
    label.addEventListener('dragend', () => {
      document.dispatchEvent(new CustomEvent('asset-drag', { detail: { active: false, url: '' } }))
    })

    if (entry.isDir) {
      // Pastas aceitam drop (move arquivo/pasta pra dentro delas)
      this.attachDropTarget(li, () => entry.path)
      this.attachDirBehavior(li, label, entry)
      // Re-expande pastas que estavam abertas (preserva estado no refresh real-time).
      // Registrada em pendingExpands: o refresh espera antes de restaurar o scroll.
      if (this.expandedPaths.has(entry.path)) this.pendingExpands.push(this.expandDir(li, entry))
    } else {
      // Clique simples abre em aba de PREVIEW (reutilizada — estilo VSCode);
      // duplo clique abre/FIXA a aba (`pin`). O DocTabs interpreta.
      label.addEventListener('click', () => {
        document.dispatchEvent(
          new CustomEvent<{ path: string; name: string }>('file-open', {
            detail: { path: entry.path, name: entry.name },
          }),
        )
      })
      label.addEventListener('dblclick', () => {
        document.dispatchEvent(
          new CustomEvent<{ path: string; name: string; pin: boolean }>('file-open', {
            detail: { path: entry.path, name: entry.name, pin: true },
          }),
        )
      })
    }

    return li
  }

  /** Adiciona comportamento de expansão lazy a um item de diretório. */
  private attachDirBehavior(li: HTMLLIElement, label: HTMLSpanElement, entry: FileEntry): void {
    label.addEventListener('click', () => {
      if (li.classList.contains('expanded')) this.collapseDir(li, entry)
      else void this.expandDir(li, entry)
    })
  }

  /** Expande uma pasta (carrega filhos lazy) e registra em `expandedPaths`. */
  private async expandDir(li: HTMLLIElement, entry: FileEntry): Promise<void> {
    this.expandedPaths.add(entry.path)
    li.classList.add('expanded')
    const existing = li.querySelector<HTMLUListElement>(':scope > .filetree-list')
    if (existing) {
      existing.style.display = ''
      return
    }
    li.classList.add('loading')
    try {
      const subEntries = await window.electronAPI.readDir(entry.path)
      li.appendChild(this.buildList(subEntries)) // buildList re-expande netos de expandedPaths
    } catch {
      li.classList.add('error')
      li.classList.remove('expanded')
      this.expandedPaths.delete(entry.path)
    } finally {
      li.classList.remove('loading')
    }
  }

  /** Recolhe uma pasta (mantém os filhos carregados, só esconde) e desregistra. */
  private collapseDir(li: HTMLLIElement, entry: FileEntry): void {
    this.expandedPaths.delete(entry.path)
    li.classList.remove('expanded')
    const childUl = li.querySelector<HTMLUListElement>(':scope > .filetree-list')
    if (childUl) childUl.style.display = 'none'
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
      void window.electronAPI.errorDialog('Erro ao mover', String(err))
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
    // Diálogos nativos via IPC — window.confirm/alert quebram o foco do
    // renderer no Electron (teclado para de funcionar até re-focar a janela).
    const ok = await window.electronAPI.confirmDialog(
      `Apagar ${entry.isDir ? 'pasta' : 'arquivo'} "${entry.name}"?`,
    )
    if (!ok) return
    try {
      await window.electronAPI.deletePath(entry.path)
      await this.refresh()
    } catch (err) {
      void window.electronAPI.errorDialog('Erro ao apagar', String(err))
    }
  }
}
