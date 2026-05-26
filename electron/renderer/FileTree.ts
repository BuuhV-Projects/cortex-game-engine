import { customPrompt } from './customPrompt'

const STORAGE_KEY = 'fileTree_projectDir'

export class FileTree {
  private container: HTMLElement
  private projectDir: string | null = null
  private treeArea: HTMLElement | null = null
  private activeContextMenu: HTMLElement | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.projectDir = localStorage.getItem(STORAGE_KEY)
  }

  async init(): Promise<void> {
    this.buildShell()
    // Fecha context menu ao clicar fora
    document.addEventListener('click', () => this.dismissContextMenu())
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
    await this.refresh()
  }

  private buildShell(): void {
    this.container.innerHTML = ''

    // Input oculto para seleção de pasta via webkitdirectory
    const input = document.createElement('input')
    input.type = 'file'
    input.setAttribute('webkitdirectory', '')
    input.style.display = 'none'
    input.addEventListener('change', () => {
      void this.handleDirSelect(input)
    })
    this.container.appendChild(input)

    // Barra de ferramentas com botão "Abrir Projeto" e "+ Arquivo"
    const toolbar = document.createElement('div')
    toolbar.className = 'filetree-toolbar'

    const openBtn = document.createElement('button')
    openBtn.textContent = 'Abrir Projeto'
    openBtn.className = 'filetree-open-btn'
    openBtn.addEventListener('click', () => input.click())
    toolbar.appendChild(openBtn)

    // "+ Arquivo" — cria arquivo na raiz do projeto ativo (ADR-0011)
    const newFileBtn = document.createElement('button')
    newFileBtn.textContent = '+ Arquivo'
    newFileBtn.className = 'filetree-new-file-btn'
    newFileBtn.title = 'Criar arquivo na raiz do projeto'
    newFileBtn.addEventListener('click', () => void this.createFileIn(this.projectDir))
    toolbar.appendChild(newFileBtn)

    // "+ Pasta" — cria pasta na raiz do projeto ativo (ADR-0015)
    const newDirBtn = document.createElement('button')
    newDirBtn.textContent = '+ Pasta'
    newDirBtn.className = 'filetree-new-file-btn'
    newDirBtn.title = 'Criar pasta na raiz do projeto'
    newDirBtn.addEventListener('click', () => void this.createDirIn(this.projectDir))
    toolbar.appendChild(newDirBtn)

    this.container.appendChild(toolbar)

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
      alert('Abra um projeto antes de criar arquivos.')
      return
    }
    const name = await customPrompt('Nome do arquivo:', { placeholder: 'main.ts' })
    if (!name || name.trim() === '') return
    try {
      await window.electronAPI.createFile(dirPath, name.trim())
      await this.refresh()
    } catch (err) {
      alert(`Erro ao criar arquivo: ${String(err)}`)
    }
  }

  private async createDirIn(dirPath: string | null): Promise<void> {
    if (!dirPath) {
      alert('Abra um projeto antes de criar pastas.')
      return
    }
    const name = await customPrompt('Nome da pasta:', { placeholder: 'assets' })
    if (!name || name.trim() === '') return
    try {
      await window.electronAPI.createDir(dirPath, name.trim())
      await this.refresh()
    } catch (err) {
      alert(`Erro ao criar pasta: ${String(err)}`)
    }
  }

  private async handleDirSelect(input: HTMLInputElement): Promise<void> {
    const { files } = input
    if (!files || files.length === 0) return

    const file = files[0]
    // Electron adiciona a propriedade não-padrão `.path` com o caminho absoluto do SO
    const absPath = (file as unknown as { path: string }).path
    // webkitRelativePath usa sempre `/`: "nomePasta/sub/arquivo.ext"
    const relPath = file.webkitRelativePath
    const rootDirName = relPath.split('/')[0]

    // Normaliza para `/` para calcular o comprimento do prefixo
    // (no Windows, absPath usa `\` mas relPath usa `/`)
    const normalizedAbs = absPath.replace(/\\/g, '/')
    const prefixLength = normalizedAbs.length - relPath.length
    // Reconstrói com os separadores originais do SO
    this.projectDir = absPath.slice(0, prefixLength + rootDirName.length)

    localStorage.setItem(STORAGE_KEY, this.projectDir)
    await this.refresh()
  }

  private async refresh(): Promise<void> {
    if (!this.projectDir || !this.treeArea) return

    this.treeArea.innerHTML = '<p class="filetree-loading">Carregando...</p>'
    try {
      const entries = await window.electronAPI.readDir(this.projectDir)
      const ul = this.buildList(entries)
      this.treeArea.innerHTML = ''
      this.treeArea.appendChild(ul)
    } catch (err) {
      this.treeArea.innerHTML = `<p class="filetree-error">Erro ao ler diretorio: ${String(err)}</p>`
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
    label.textContent = entry.name
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
