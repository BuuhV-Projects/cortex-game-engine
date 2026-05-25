const STORAGE_KEY = 'fileTree_projectDir'

export class FileTree {
  private container: HTMLElement
  private projectDir: string | null = null
  private treeArea: HTMLElement | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.projectDir = localStorage.getItem(STORAGE_KEY)
  }

  async init(): Promise<void> {
    this.buildShell()
    if (this.projectDir) {
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

    // Barra de ferramentas com botão "Abrir Projeto"
    const toolbar = document.createElement('div')
    toolbar.className = 'filetree-toolbar'

    const btn = document.createElement('button')
    btn.textContent = 'Abrir Projeto'
    btn.className = 'filetree-open-btn'
    btn.addEventListener('click', () => input.click())
    toolbar.appendChild(btn)
    this.container.appendChild(toolbar)

    // Área da árvore
    const treeArea = document.createElement('div')
    treeArea.className = 'filetree-area'
    this.container.appendChild(treeArea)
    this.treeArea = treeArea
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

    if (entry.isDir) {
      this.attachDirBehavior(li, label, entry)
    } else {
      label.addEventListener('click', () => {
        document.dispatchEvent(
          new CustomEvent<{ path: string; name: string }>('file-open', {
            detail: { path: entry.path, name: entry.name },
          })
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
}
