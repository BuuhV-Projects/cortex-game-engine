import * as monaco from 'monaco-editor'

/**
 * URIs virtuais dos models do Monaco e configuração do serviço de TypeScript.
 * Extraído do `Editor.ts` — nada aqui depende da instância do editor.
 */

/**
 * O barrel principal do `monaco-editor` exporta `monaco.languages.typescript`
 * como `{ deprecated: true }` para sinalizar que existem submódulos com APIs
 * mais novas. As APIs continuam disponíveis em runtime, só perderam a tipagem
 * aqui. Esse cast acessa
 * `typescriptDefaults`/`javascriptDefaults` e os enums (`ModuleResolutionKind`
 * etc.) sem ter que repetir `as any` em cada chamada.
 */
type MonacoTypeScript = {
  typescriptDefaults: {
    getCompilerOptions(): Record<string, unknown>
    setCompilerOptions(opts: Record<string, unknown>): void
    setDiagnosticsOptions(opts: { noSemanticValidation?: boolean; noSyntaxValidation?: boolean }): void
    addExtraLib(content: string, path: string): { dispose(): void }
  }
  javascriptDefaults: {
    setDiagnosticsOptions(opts: { noSemanticValidation?: boolean; noSyntaxValidation?: boolean }): void
  }
  ModuleResolutionKind: { NodeJs: number; Classic: number }
}
export const monacoTs = monaco.languages.typescript as unknown as MonacoTypeScript

/**
 * Converte um path absoluto do SO em URI sintética para o Monaco que NÃO inclui
 * o drive letter como segmento `D:`. Isso permite que o Node resolver do TS
 * suba a partir do arquivo aberto até a raiz `/` e encontre os types virtuais
 * registrados em `/node_modules/...`. Sem essa transformação, o path do model
 * fica `/D:/foo/main.ts` e o resolver para no drive.
 */
export function pathToVirtualUri(realPath: string): monaco.Uri {
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
export function virtualUriToPath(uri: monaco.Uri): string | null {
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

/** Compiler options + diagnostics do serviço de TS/JS do Monaco. */
export function configureTypeScriptDefaults(): void {
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
}
