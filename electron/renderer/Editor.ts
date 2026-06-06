import * as monaco from 'monaco-editor'
import { getThemeName } from './theme'

/**
 * O barrel principal do `monaco-editor` exporta `monaco.languages.typescript`
 * como `{ deprecated: true }` para sinalizar que existem submódulos com APIs
 * mais novas. As APIs continuam disponíveis em runtime (usadas pelo plugin
 * vite-plugin-monaco-editor), só perderam a tipagem aqui. Esse cast acessa
 * `typescriptDefaults`/`javascriptDefaults` e os enums (`ModuleResolutionKind`
 * etc.) sem ter que repetir `as any` em cada chamada.
 */
type MonacoTypeScript = {
  typescriptDefaults: {
    getCompilerOptions(): Record<string, unknown>
    setCompilerOptions(opts: Record<string, unknown>): void
    setDiagnosticsOptions(opts: { noSemanticValidation?: boolean; noSyntaxValidation?: boolean }): void
    addExtraLib(content: string, path: string): void
  }
  javascriptDefaults: {
    setDiagnosticsOptions(opts: { noSemanticValidation?: boolean; noSyntaxValidation?: boolean }): void
  }
  ModuleResolutionKind: { NodeJs: number; Classic: number }
}
const monacoTs = monaco.languages.typescript as unknown as MonacoTypeScript

// Mapeia extensão de arquivo para a linguagem reconhecida pelo Monaco
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  html: 'html',
  css: 'css',
  md: 'markdown',
}

function detectLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXT[ext] ?? 'plaintext'
}

function workerUrl(name: string): string {
  // O vite-plugin-monaco-editor emite os workers em monacoeditorwork/<nome>.bundle.js
  // tanto em dev (servido pelo dev server) quanto em build.
  return new URL(`./monacoeditorwork/${name}.bundle.js`, window.location.href).toString()
}

/**
 * Converte um path absoluto do SO em URI sintética para o Monaco que NÃO inclui
 * o drive letter como segmento `D:`. Isso permite que o Node resolver do TS
 * suba a partir do arquivo aberto até a raiz `/` e encontre os types virtuais
 * registrados em `/node_modules/...`. Sem essa transformação, o path do model
 * fica `/D:/foo/main.ts` e o resolver para no drive.
 */
function pathToVirtualUri(realPath: string): monaco.Uri {
  const posix = realPath
    .replace(/\\/g, '/')
    .replace(/^([a-z]):/i, (_m, letter: string) => `/_drive_${letter.toLowerCase()}`)
  return monaco.Uri.parse(`file://${posix}`)
}

/**
 * Inverso de `pathToVirtualUri`. Recebe uma URI sintética do Monaco e devolve
 * o path real do sistema de arquivos — ou `null` se a URI não representa um
 * arquivo do projeto (ex.: types virtuais em `/node_modules/...`, que vivem
 * só na memória do TS service e não têm fs real).
 *
 * Usado no `registerEditorOpener` para resolver Ctrl+click em imports relativos
 * (`./foo`) que apontam para arquivos que o usuário ainda não abriu no editor.
 */
function virtualUriToPath(uri: monaco.Uri): string | null {
  const p = uri.path
  if (p.startsWith('/node_modules/')) return null

  // Windows: /_drive_d/projeto/foo.ts → D:\projeto\foo.ts
  const winMatch = /^\/_drive_([a-z])\/(.*)$/i.exec(p)
  if (winMatch) {
    return `${winMatch[1].toUpperCase()}:\\${winMatch[2].replace(/\//g, '\\')}`
  }

  // Unix absoluto: /foo/bar.ts → /foo/bar.ts
  if (p.startsWith('/')) return p

  return null
}

interface Tab {
  /** Path real do filesystem (arquivos do projeto) ou URI virtual (engine .d.ts). */
  path: string
  name: string
  model: monaco.editor.ITextModel
  dirty: boolean
  /** Arquivos do engine vendoriado são apenas para leitura — save é no-op. */
  readOnly: boolean
  /** Listener de onDidChangeContent — descartado quando a aba é fechada. */
  changeListener: monaco.IDisposable
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** `true` se o arquivo é uma imagem (abre como preview, não no editor de código). */
function isImageFile(name: string): boolean {
  return extOf(name) in IMAGE_MIME
}

function mimeForImage(name: string): string {
  return IMAGE_MIME[extOf(name)] ?? 'application/octet-stream'
}

export class Editor {
  private container: HTMLElement
  private tabsBar: HTMLElement | null = null
  private editorArea: HTMLElement | null = null
  private previewEl: HTMLElement | null = null
  private instance: monaco.editor.IStandaloneCodeEditor | null = null
  // Ordem das abas (insertion order do Map é estável)
  private tabs: Map<string, Tab> = new Map()
  private activePath: string | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    self.MonacoEnvironment = {
      getWorkerUrl: (_moduleId: string, label: string) => {
        if (label === 'typescript' || label === 'javascript') return workerUrl('ts.worker')
        if (label === 'json') return workerUrl('json.worker')
        if (label === 'css' || label === 'scss' || label === 'less') return workerUrl('css.worker')
        if (label === 'html' || label === 'handlebars' || label === 'razor') return workerUrl('html.worker')
        return workerUrl('editor.worker')
      },
    }

    // O Node resolver do TS sobe procurando node_modules/ a partir do
    // diretório do arquivo aberto. No Monaco, arquivos abertos têm URI
    // como /D:/projeto/main.ts e os types virtuais estão em /node_modules/.
    // O resolver pode parar no drive (/D:/) e não subir até /, falhando.
    // Mapeamos explicitamente via paths + baseUrl para forçar a resolução.
    monacoTs.typescriptDefaults.setCompilerOptions({
      ...monacoTs.typescriptDefaults.getCompilerOptions(),
      moduleResolution: monacoTs.ModuleResolutionKind.NodeJs,
      baseUrl: '/',
      paths: {
        'cortex-game-engine': ['/node_modules/cortex-game-engine/index.d.ts'],
        'cortex-game-engine/*': ['/node_modules/cortex-game-engine/*'],
        three: ['/node_modules/three/index.d.ts'],
        'three/*': ['/node_modules/three/*'],
      },
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    })

    // Diagnostics semânticos ficam desligados — o servidor TS do Monaco não
    // tem acesso ao node_modules do projeto aberto, então imports
    // não-vendoriados gerariam ruído. Autocomplete via Ctrl+Space continua
    // funcionando para os tipos alimentados via addExtraLib.
    monacoTs.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })
    monacoTs.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })

    // Alimenta os types do engine no servidor TS do Monaco
    void this.loadEngineTypes()

    this.buildShell()

    this.instance = monaco.editor.create(this.editorArea as HTMLElement, {
      theme: getThemeName(),
      automaticLayout: true,
      fontSize: 13,
      minimap: { enabled: false },
      value: '',
      language: 'plaintext',
      // Habilita semantic highlighting do TS worker — sem isso classe/função/
      // tipo viram tudo 'identifier' no Monarch e ficam sem cor.
      'semanticHighlighting.enabled': true,
    } as monaco.editor.IStandaloneEditorConstructionOptions)

    this.instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void this.save()
    })

    document.addEventListener('file-open', (e) => {
      const { path, name } = (e as CustomEvent<{ path: string; name: string }>).detail
      if (isImageFile(name)) {
        // Imagem abre como PREVIEW, não no editor de código.
        void this.openImagePreview(path, name)
      } else {
        this.hideImagePreview()
        void this.openFile(path, name)
      }
    })

    // Pre-carrega models pra todos os fontes do projeto. Sem isso, o
    // TypeScript service do Monaco não sabe que arquivos como
    // `./scenes/RaceScene` existem e o Ctrl+click no import nem chega
    // a chamar registerEditorOpener — não tem destino pra navegar.
    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      void this.preloadProjectFiles(path)
    })

    // Intercepta "abrir arquivo" do Monaco (clique no peek/breadcrumb,
    // Ctrl+click numa referência etc.). Sem isso, o editor standalone
    // ignora o request e o usuário não consegue navegar para definições
    // em outros models (ex: o .d.ts do engine).
    //
    // Fallback de filesystem: se a URI requisitada ainda não tem model
    // registrado (caso típico: Ctrl+click num `import './foo'` cujo arquivo
    // o usuário nunca abriu), tentamos reverter URI → path real e abrir
    // via `openFile`. Pré-carregar todos os arquivos do projeto na entrada
    // seria caro em projetos grandes; lazy load aqui é o equilíbrio.
    monaco.editor.registerEditorOpener({
      openCodeEditor: (_source, resource, selectionOrPosition) => {
        const existing = monaco.editor.getModel(resource)
        if (existing) {
          this.openModel(existing, selectionOrPosition)
          return true
        }
        const realPath = virtualUriToPath(resource)
        if (!realPath) return false
        const name = resource.path.split('/').pop() ?? '(sem nome)'
        // Async — o Monaco aceita true como "vou cuidar disso" e a aba
        // aparece logo que readFile responde.
        void this.openFile(realPath, name, selectionOrPosition)
        return true
      },
    })
  }

  /**
   * Ativa (ou cria) uma aba para um model já existente — usado quando o
   * Monaco solicita abrir um arquivo internamente (peek/Ctrl+click).
   */
  private openModel(
    model: monaco.editor.ITextModel,
    selectionOrPosition?: monaco.IRange | monaco.IPosition,
  ): void {
    if (!this.instance) return
    const path = model.uri.toString()
    if (!this.tabs.has(path)) {
      const name = model.uri.path.split('/').pop() ?? '(sem nome)'
      this.tabs.set(path, this.makeTab(path, name, model))
    }
    this.activateTab(path)
    if (selectionOrPosition) this.applyPosition(selectionOrPosition)
  }

  /**
   * Cria uma Tab e registra o listener de mudança de conteúdo. Qualquer
   * edição marca a aba como dirty (bolinha) até que o save (Ctrl+S) limpe.
   * Arquivos do engine (URI virtual em node_modules/) entram como readOnly.
   */
  private makeTab(path: string, name: string, model: monaco.editor.ITextModel): Tab {
    const readOnly = path.includes('/node_modules/')
    const tab: Tab = {
      path,
      name,
      model,
      dirty: false,
      readOnly,
      changeListener: model.onDidChangeContent(() => {
        if (!tab.dirty) {
          tab.dirty = true
          this.renderTabs()
        }
      }),
    }
    return tab
  }

  private buildShell(): void {
    this.container.innerHTML = ''
    const tabsBar = document.createElement('div')
    tabsBar.className = 'editor-tabs'
    const editorArea = document.createElement('div')
    editorArea.className = 'editor-area'
    this.container.appendChild(tabsBar)
    this.container.appendChild(editorArea)
    this.tabsBar = tabsBar
    this.editorArea = editorArea

    // Overlay de preview de imagem (cobre o Monaco quando uma imagem é aberta).
    editorArea.style.position = 'relative'
    const preview = document.createElement('div')
    preview.className = 'editor-image-preview'
    preview.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:10px',
      'padding:16px',
      'background:#1e1e1e',
      'overflow:auto',
      'z-index:5',
    ].join(';')
    const img = document.createElement('img')
    img.style.cssText = 'max-width:100%;max-height:calc(100% - 28px);object-fit:contain;image-rendering:auto'
    const caption = document.createElement('div')
    caption.className = 'editor-preview-caption'
    caption.style.cssText = 'color:#9aa0ad;font:12px "Segoe UI",Roboto,Arial,sans-serif'
    preview.append(img, caption)
    editorArea.appendChild(preview)
    this.previewEl = preview
  }

  /** Mostra a imagem como preview (cobre o editor de código). */
  private async openImagePreview(path: string, name: string): Promise<void> {
    if (!this.previewEl) return
    const img = this.previewEl.querySelector('img') as HTMLImageElement | null
    const caption = this.previewEl.querySelector('.editor-preview-caption') as HTMLElement | null
    try {
      const b64 = await window.electronAPI.readFileBase64(path)
      if (img) img.src = `data:${mimeForImage(name)};base64,${b64}`
      if (caption) caption.textContent = name
      this.previewEl.style.display = 'flex'
    } catch {
      if (caption) caption.textContent = `Falha ao abrir ${name}`
      if (img) img.removeAttribute('src')
      this.previewEl.style.display = 'flex'
    }
  }

  /** Esconde o preview de imagem (volta a mostrar o editor de código). */
  private hideImagePreview(): void {
    if (this.previewEl) this.previewEl.style.display = 'none'
  }

  private renderTabs(): void {
    if (!this.tabsBar) return
    this.tabsBar.innerHTML = ''
    for (const tab of this.tabs.values()) {
      const el = document.createElement('div')
      el.className = 'editor-tab'
      if (tab.path === this.activePath) el.classList.add('active')
      if (tab.dirty) el.classList.add('dirty')
      el.addEventListener('click', () => this.activateTab(tab.path))
      // Middle-click (botão do scroll) fecha a aba — convenção de browsers
      // e VS Code. `mousedown` é mais previsível que `auxclick` em Electron.
      // preventDefault evita o cursor de auto-scroll do middle-click.
      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault()
          this.closeTab(tab.path)
        }
      })

      const label = document.createElement('span')
      label.className = 'editor-tab-label'
      label.textContent = tab.name

      // Indicador de "modificado, não salvo". Visível só quando dirty;
      // some no hover para dar lugar ao botão de fechar.
      const dot = document.createElement('span')
      dot.className = 'editor-tab-dot'
      dot.textContent = '●'

      const close = document.createElement('button')
      close.className = 'editor-tab-close'
      close.textContent = '×'
      close.title = 'Fechar'
      close.addEventListener('click', (e) => {
        e.stopPropagation()
        this.closeTab(tab.path)
      })

      el.appendChild(label)
      el.appendChild(dot)
      el.appendChild(close)
      this.tabsBar.appendChild(el)
    }
  }

  private activateTab(path: string): void {
    const tab = this.tabs.get(path)
    if (!tab || !this.instance) return
    this.instance.setModel(tab.model)
    this.instance.updateOptions({ readOnly: tab.readOnly })
    this.activePath = path
    this.renderTabs()
  }

  private closeTab(path: string): void {
    const tab = this.tabs.get(path)
    if (!tab) return

    if (tab.dirty) {
      const ok = window.confirm(
        `"${tab.name}" tem alterações não salvas. Fechar mesmo assim?`,
      )
      if (!ok) return
    }

    tab.changeListener.dispose()
    // Não chamamos model.dispose() — alguns models são compartilhados (ex.: o
    // .d.ts do engine usado pelo TS service para resolução). Em troca, recriar
    // a aba reusa o model existente (openFile faz getModel ?? createModel).
    this.tabs.delete(path)

    if (this.activePath === path) {
      // Ativa a próxima aba (insertion order); se não houver, limpa o editor
      const next = this.tabs.values().next().value
      if (next) {
        this.activateTab(next.path)
      } else {
        this.activePath = null
        const emptyModel = monaco.editor.createModel('', 'plaintext')
        this.instance?.setModel(emptyModel)
      }
    }
    this.renderTabs()
  }

  /**
   * Para cada arquivo-fonte do projeto, cria silenciosamente um model no
   * Monaco (sem abrir aba). Isso alimenta o TypeScript service: imports
   * relativos (`./foo`) passam a ser resolvíveis e Ctrl+click consegue
   * navegar pra arquivos que o usuário ainda não abriu manualmente.
   *
   * Idempotente: pula arquivos que já têm model. Arquivos que falhem ao
   * ler são silenciados — perder navegação pra 1 arquivo problemático é
   * melhor que abortar todo o pre-load. Leituras em paralelo.
   *
   * Trade-off: gasta RAM proporcional ao tamanho do projeto. Pra projetos
   * típicos (< 100 arquivos × poucos KB cada) é desprezível.
   */
  private async preloadProjectFiles(projectDir: string): Promise<void> {
    try {
      const files = await window.electronAPI.listProjectFiles(projectDir)
      await Promise.all(
        files.map(async (path) => {
          const uri = pathToVirtualUri(path)
          if (monaco.editor.getModel(uri)) return
          try {
            const content = await window.electronAPI.readFile(path)
            const name = path.split(/[\\/]/).pop() ?? ''
            const language = detectLanguage(name)
            monaco.editor.createModel(content, language, uri)
          } catch {
            // Arquivo pode ter sumido entre o list e o read — ignora.
          }
        }),
      )
    } catch (err) {
      console.error('Erro ao pre-carregar arquivos do projeto:', err)
    }
  }

  private async loadEngineTypes(): Promise<void> {
    try {
      const files = await window.electronAPI.readEngineTypes()
      for (const { path, content, navigable } of files) {
        // addExtraLib é essencial para que o TS service resolva `import 'X'`
        // — sem isso o módulo nem é encontrado.
        monacoTs.typescriptDefaults.addExtraLib(content, path)
        // createModel adicional só para os arquivos do engine (poucos) —
        // viabiliza Ctrl+click. Para @types/three (~946 arquivos) cair aqui
        // estoura o limite de 200 listeners do Monaco.
        if (navigable) {
          const uri = monaco.Uri.parse(path)
          if (!monaco.editor.getModel(uri)) {
            monaco.editor.createModel(content, 'typescript', uri)
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar types do engine:', err)
    }
  }

  private async openFile(
    path: string,
    name: string,
    selectionOrPosition?: monaco.IRange | monaco.IPosition,
  ): Promise<void> {
    if (!this.instance) return

    // Arquivo já aberto: apenas ativa a aba existente (preserva o estado do model)
    if (this.tabs.has(path)) {
      this.activateTab(path)
      if (selectionOrPosition) this.applyPosition(selectionOrPosition)
      return
    }

    try {
      const content = await window.electronAPI.readFile(path)
      const language = detectLanguage(name)
      // URI sintética sem drive — permite que o Node resolver do TS suba até
      // a raiz virtual `/` and encontre node_modules/. O path real fica salvo
      // separadamente em `tab.path` para o save (writeFile).
      const uri = pathToVirtualUri(path)
      const model =
        monaco.editor.getModel(uri) ?? monaco.editor.createModel(content, language, uri)

      this.tabs.set(path, this.makeTab(path, name, model))
      this.activateTab(path)
      if (selectionOrPosition) this.applyPosition(selectionOrPosition)
    } catch (err) {
      console.error('Erro ao abrir arquivo:', err)
    }
  }

  /** Posiciona o cursor e dá scroll. Reusado pelo openModel e openFile. */
  private applyPosition(target: monaco.IRange | monaco.IPosition): void {
    if (!this.instance) return
    if ('startLineNumber' in target) {
      this.instance.setSelection(target)
      this.instance.revealRangeInCenter(target)
    } else {
      this.instance.setPosition(target)
      this.instance.revealPositionInCenter(target)
    }
  }

  private async save(): Promise<void> {
    if (!this.instance || !this.activePath) return
    const tab = this.tabs.get(this.activePath)
    if (!tab || tab.readOnly) return
    const content = tab.model.getValue()
    try {
      await window.electronAPI.writeFile(tab.path, content)
      if (tab.dirty) {
        tab.dirty = false
        this.renderTabs()
      }
    } catch (err) {
      console.error('Erro ao salvar arquivo:', err)
    }
  }
}
