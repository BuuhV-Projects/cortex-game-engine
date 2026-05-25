import * as monaco from 'monaco-editor'

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

export class Editor {
  private container: HTMLElement
  private tabsBar: HTMLElement | null = null
  private editorArea: HTMLElement | null = null
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
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      ...monaco.languages.typescript.typescriptDefaults.getCompilerOptions(),
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
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
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })

    // Alimenta os types do engine no servidor TS do Monaco
    void this.loadEngineTypes()

    this.buildShell()

    this.instance = monaco.editor.create(this.editorArea as HTMLElement, {
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 13,
      minimap: { enabled: false },
      value: '',
      language: 'plaintext',
    })

    this.instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void this.save()
    })

    document.addEventListener('file-open', (e) => {
      const { path, name } = (e as CustomEvent<{ path: string; name: string }>).detail
      void this.openFile(path, name)
    })

    // Intercepta "abrir arquivo" do Monaco (clique no peek/breadcrumb,
    // Ctrl+click numa referência etc.). Sem isso, o editor standalone
    // ignora o request e o usuário não consegue navegar para definições
    // em outros models (ex: o .d.ts do engine).
    monaco.editor.registerEditorOpener({
      openCodeEditor: (_source, resource, selectionOrPosition) => {
        const model = monaco.editor.getModel(resource)
        if (!model) return false
        this.openModel(model, selectionOrPosition)
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

    if (selectionOrPosition) {
      if ('startLineNumber' in selectionOrPosition) {
        this.instance.setSelection(selectionOrPosition)
        this.instance.revealRangeInCenter(selectionOrPosition)
      } else {
        this.instance.setPosition(selectionOrPosition)
        this.instance.revealPositionInCenter(selectionOrPosition)
      }
    }
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

  private async loadEngineTypes(): Promise<void> {
    try {
      const files = await window.electronAPI.readEngineTypes()
      for (const { path, content, navigable } of files) {
        // addExtraLib é essencial para que o TS service resolva `import 'X'`
        // — sem isso o módulo nem é encontrado.
        monaco.languages.typescript.typescriptDefaults.addExtraLib(content, path)
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

  private async openFile(path: string, name: string): Promise<void> {
    if (!this.instance) return

    // Arquivo já aberto: apenas ativa a aba existente (preserva o estado do model)
    if (this.tabs.has(path)) {
      this.activateTab(path)
      return
    }

    try {
      const content = await window.electronAPI.readFile(path)
      const language = detectLanguage(name)
      // URI sintética sem drive — permite que o Node resolver do TS suba até
      // a raiz virtual `/` e encontre node_modules/. O path real fica salvo
      // separadamente em `tab.path` para o save (writeFile).
      const uri = pathToVirtualUri(path)
      const model =
        monaco.editor.getModel(uri) ?? monaco.editor.createModel(content, language, uri)

      this.tabs.set(path, this.makeTab(path, name, model))
      this.activateTab(path)
    } catch (err) {
      console.error('Erro ao abrir arquivo:', err)
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
