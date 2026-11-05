import * as monaco from 'monaco-editor'
import { getThemeName } from './theme'
import { GlbPreview } from './GlbPreview'
import { PreviewOverlay } from './PreviewOverlay'
import { detectLanguage, isImageFile, isMarkdownFile } from './fileKinds'
import {
  configureTypeScriptDefaults,
  pathToVirtualUri,
  virtualUriToPath,
} from './monacoWorkspace'
import { getOrCreateEngineTypeModel, loadEngineTypes, preloadProjectFiles } from './monacoModels'
import { renderEditorTabs } from './editorTabsView'
import { registerMonacoWorkers } from './monacoWorkers'

/** Tamanho da fonte do editor de código, em px. */
const EDITOR_FONT_SIZE = 13

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
  private preview: PreviewOverlay | null = null
  private glbPreview: GlbPreview | null = null
  private instance: monaco.editor.IStandaloneCodeEditor | null = null
  // Ordem das abas (insertion order do Map é estável)
  private tabs: Map<string, Tab> = new Map()
  private activePath: string | null = null
  /**
   * Model mostrado quando não há aba aberta — UM só, reusado (SPEC-0166).
   * Criar um por fechamento vazava models (cada um assina o emitter global de
   * linguagem do Monaco, que alerta em 200 listeners).
   */
  private emptyModel: monaco.editor.ITextModel | null = null
  /** Último estado "vazio" notificado — evita disparar o evento à toa. */
  private lastEmpty: boolean | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    registerMonacoWorkers()
    configureTypeScriptDefaults()

    // Alimenta os types do engine no servidor TS do Monaco
    void loadEngineTypes()

    this.buildShell()

    this.instance = monaco.editor.create(this.editorArea as HTMLElement, {
      theme: getThemeName(),
      automaticLayout: true,
      fontSize: EDITOR_FONT_SIZE,
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
      if (GlbPreview.handles(name)) {
        // Modelo 3D abre como PREVIEW (viewport + lista de animações).
        this.preview?.hide()
        void this.glbPreview?.open(path, name)
        this.notifyEmptyState()
        this.notifyDoc('glb')
      } else if (isImageFile(name)) {
        // Imagem abre como PREVIEW, não no editor de código.
        this.glbPreview?.close()
        void this.preview?.openImage(path, name)
        this.notifyDoc('preview')
      } else if (isMarkdownFile(name)) {
        // Markdown abre renderizado como PREVIEW.
        this.glbPreview?.close()
        void this.preview?.openMarkdown(path, name)
        this.notifyDoc('preview')
      } else {
        this.glbPreview?.close()
        this.preview?.hide()
        void this.openFile(path, name)
        this.notifyDoc('code')
      }
    })

    // DocTabs (barra unificada) pede pra mostrar/fechar um doc já aberto.
    document.addEventListener('doc-show', (e) => {
      const { path, name } = (e as CustomEvent<{ path: string; name: string }>).detail
      if (GlbPreview.handles(name)) {
        this.preview?.hide()
        void this.glbPreview?.open(path, name)
        this.notifyEmptyState()
        this.notifyDoc('glb')
      } else if (isImageFile(name)) {
        this.glbPreview?.close()
        void this.preview?.openImage(path, name)
        this.notifyDoc('preview')
      } else if (isMarkdownFile(name)) {
        this.glbPreview?.close()
        void this.preview?.openMarkdown(path, name)
        this.notifyDoc('preview')
      } else {
        this.glbPreview?.close()
        this.preview?.hide()
        if (this.tabs.has(path)) this.activateTab(path)
        else void this.openFile(path, name)
        this.notifyDoc('code')
      }
    })
    document.addEventListener('doc-close', (e) => {
      const { path, name } = (e as CustomEvent<{ path: string; name: string }>).detail
      // PATH-AWARE: só fecha se o preview ainda mostra AQUELE doc. A aba de
      // preview do DocTabs (estilo VSCode) fecha o doc substituído DEPOIS que o
      // novo já abriu — fechar incondicionalmente apagava o conteúdo novo (o
      // usuário tinha que clicar 2× pro glb carregar).
      if (GlbPreview.handles(name)) {
        if (this.glbPreview?.currentPath === path) this.glbPreview.close()
      } else if (isImageFile(name) || isMarkdownFile(name)) {
        if (this.preview?.currentPath === path) this.preview.hide()
      } else {
        void this.closeTab(path)
      }
    })

    // Alimenta o TS service com os fontes do projeto (via addExtraLib, sem
    // criar models — SPEC-0692). Sem isso, o TypeScript service do Monaco não
    // sabe que arquivos como `./scenes/RaceScene` existem e o Ctrl+click no
    // import nem chega a chamar registerEditorOpener — não tem destino.
    document.addEventListener('project-open', (e) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      void preloadProjectFiles(path)
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
        if (!realPath) {
          // Type navegável do engine (sem fs real): o model nasce aqui, na
          // primeira navegação, a partir do conteúdo guardado (SPEC-0692).
          const engineModel = getOrCreateEngineTypeModel(resource)
          if (engineModel) {
            this.openModel(engineModel, selectionOrPosition)
            return true
          }
          return false
        }
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
    // `tab.path` precisa ser o PATH REAL (pra o save/writeFile) — não a URI virtual
    // do Monaco (`/_drive_d/...`). Converte de volta; se for um type virtual de
    // node_modules (sem fs real), cai pra URI (a aba entra read-only por isso).
    const real = virtualUriToPath(model.uri)
    const path = real ?? model.uri.toString()
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
    // A barra de abas unificada (DocTabs, no topo do #center) substitui esta —
    // mantida só pra a lógica interna de tabs (render/ativar), escondida na UI.
    tabsBar.style.display = 'none'
    const editorArea = document.createElement('div')
    editorArea.className = 'editor-area'
    this.container.appendChild(tabsBar)
    this.container.appendChild(editorArea)
    this.tabsBar = tabsBar
    this.editorArea = editorArea

    // Overlay de preview de imagem/markdown (cobre o Monaco quando aberto).
    editorArea.style.position = 'relative'
    this.preview = new PreviewOverlay(editorArea, () => this.notifyEmptyState())

    // Preview 3D de .glb/.gltf (overlay próprio, acima do Monaco e do preview de imagem).
    this.glbPreview = new GlbPreview(editorArea, () => {
      this.notifyEmptyState()
      this.notifyDoc(this.tabs.size ? 'code' : 'scene')
    })
  }

  /**
   * Emite `editor-empty-change` quando o editor passa a (não) ter nada aberto —
   * sem aba de código E sem preview de imagem/markdown visível. O layout
   * (`main.ts`/`Resizer`) usa isso pra dar o espaço do editor ao jogo (right-panel)
   * quando não há nada aberto. Só dispara quando o estado realmente muda.
   */
  private notifyEmptyState(): void {
    const previewVisible = this.preview?.isVisible() ?? false
    const glbVisible = this.glbPreview?.isOpen() ?? false
    const empty = this.tabs.size === 0 && !previewVisible && !glbVisible
    if (empty === this.lastEmpty) return
    this.lastEmpty = empty
    document.dispatchEvent(new CustomEvent('editor-empty-change', { detail: { empty } }))
    // Sem nada aberto → o doc ativo é a cena (dock direito mostra o Inspector).
    if (empty) this.notifyDoc('scene')
  }

  /** Avisa qual tipo de documento está ativo, pra o dock direito reagir (Layout A). */
  private notifyDoc(kind: 'scene' | 'code' | 'glb' | 'preview'): void {
    document.dispatchEvent(new CustomEvent('editor-doc-change', { detail: { kind } }))
  }

  private renderTabs(): void {
    if (!this.tabsBar) return
    renderEditorTabs(this.tabsBar, this.tabs.values(), this.activePath, {
      onActivate: (path) => this.activateTab(path),
      onClose: (path) => void this.closeTab(path),
    })
    this.notifyEmptyState()
  }

  private activateTab(path: string): void {
    const tab = this.tabs.get(path)
    if (!tab || !this.instance) return
    // Ativar uma aba de código sai de qualquer preview (3D/imagem) por cima.
    this.glbPreview?.close()
    this.preview?.hide()
    this.instance.setModel(tab.model)
    this.instance.updateOptions({ readOnly: tab.readOnly })
    this.activePath = path
    this.renderTabs()
  }

  private async closeTab(path: string): Promise<void> {
    const tab = this.tabs.get(path)
    if (!tab) return

    if (tab.dirty) {
      // Diálogo nativo via IPC — window.confirm quebra o foco do renderer
      // no Electron (teclado para de funcionar até re-focar a janela).
      const ok = await window.electronAPI.confirmDialog(
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
        // Model vazio ÚNICO (SPEC-0166): criar um a cada fechamento deixava um
        // model órfão por vez pela sessão inteira — e cada model assina o
        // emitter global de linguagem do Monaco (limite de 200 listeners).
        this.emptyModel ??= monaco.editor.createModel('', 'plaintext')
        this.instance?.setModel(this.emptyModel)
      }
    }
    this.renderTabs()
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
