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

export class Editor {
  private container: HTMLElement
  private instance: monaco.editor.IStandaloneCodeEditor | null = null
  private currentPath: string | null = null

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

    // O servidor TS do Monaco não tem acesso ao node_modules do projeto aberto,
    // então erros como "Cannot find module" são ruído. Mantemos só sintaxe.
    // IntelliSense cross-file fica para iteração futura (ver ADR-0006).
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    })

    this.instance = monaco.editor.create(this.container, {
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
  }

  private async openFile(path: string, name: string): Promise<void> {
    if (!this.instance) return
    try {
      const content = await window.electronAPI.readFile(path)
      const language = detectLanguage(name)
      // Substitui o model em vez de só setar value para que o highlighting da linguagem seja aplicado
      const oldModel = this.instance.getModel()
      const newModel = monaco.editor.createModel(content, language)
      this.instance.setModel(newModel)
      oldModel?.dispose()
      this.currentPath = path
    } catch (err) {
      console.error('Erro ao abrir arquivo:', err)
    }
  }

  private async save(): Promise<void> {
    if (!this.instance || !this.currentPath) return
    const content = this.instance.getValue()
    try {
      await window.electronAPI.writeFile(this.currentPath, content)
    } catch (err) {
      console.error('Erro ao salvar arquivo:', err)
    }
  }
}
