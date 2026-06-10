/**
 * Tipos compartilhados pelo renderer Electron.
 *
 * Fonte canônica da API exposta pelo preload em `window.electronAPI`.
 * O ambient `window.d.ts` (mesmo diretório) aumenta a interface `Window`
 * usando o `ElectronAPI` exportado daqui.
 */

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

export interface AiToolRequest {
  id: string
  name: string
  input: Record<string, unknown>
  summary: string
  needsApproval: boolean
}

export interface TurnStats {
  durationMs: number
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  /** Session ID do SDK; persistido por projeto pra retomar entre execuções. */
  sessionId: string | null
}

export interface ElectronAPI {
  // Sistema de arquivos
  readDir(dirPath: string): Promise<FileEntry[]>
  listProjectFiles(projectDir: string): Promise<string[]>
  readFile(filePath: string): Promise<string>
  /** Lê um arquivo binário (imagem) como base64 — pro preview de imagem. */
  readFileBase64(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  createProject(targetDir: string, name: string, kind?: '2d' | '2.5d'): Promise<string>
  createFile(dirPath: string, name: string): Promise<string>
  createDir(dirPath: string, name: string): Promise<string>
  move(src: string, dest: string): Promise<void>
  deletePath(targetPath: string): Promise<void>
  selectDirectory(): Promise<string | null>
  readEngineTypes(): Promise<Array<{ path: string; content: string; navigable: boolean }>>

  // Execução de projeto (Play/Stop)
  runProject(projectDir: string): Promise<void>
  stopProject(): Promise<void>

  // Terminal embutido
  runTerminalCommand(projectDir: string, command: string): Promise<void>
  stopTerminalCommand(): Promise<void>

  // Chat IA
  chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    mode: 'ask' | 'auto' | 'plan',
  ): Promise<void>
  setActiveProject(projectDir: string | null): Promise<void>
  decideToolCall(id: string, approved: boolean): Promise<void>
  cancelChat(): Promise<void>
  saveClipboardImage(dataUrl: string): Promise<string>
  deleteClipboardImage(relPath: string): Promise<void>
  loadChatHistory(
    projectDir: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>>
  saveChatHistory(
    projectDir: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<void>
  clearChatHistory(projectDir: string): Promise<void>

  /** Observa o projeto no disco (fs.watch) — dispara `onProjectFilesChanged`. */
  watchProject(projectDir: string): Promise<void>
  /** Re-vendoriza o engine atual do IDE no `vendor/` do projeto (engine atualizou). */
  revendorEngine(projectDir: string): Promise<void>
  /** `true` em dev (electron:dev). Pra mostrar opções de dev (DevTools). */
  isDev: boolean
  /** Abre/fecha o DevTools do studio (só em dev). */
  toggleDevTools(): Promise<void>

  // Eventos do main → renderer
  onLog(callback: (line: string) => void): void
  onProjectStopped(callback: () => void): void
  /** Mudou algo no disco do projeto (criar/apagar/salvar/git/build). */
  onProjectFilesChanged(callback: () => void): void
  onTerminalOutput(callback: (text: string) => void): void
  onTerminalDone(callback: (exitCode: number) => void): void
  onAiChunk(callback: (text: string) => void): void
  onAiDone(
    callback: (payload: { stopReason: string | null; stats: TurnStats | null }) => void,
  ): void
  onAiError(callback: (message: string) => void): void
  onAiToolRequest(callback: (request: AiToolRequest) => void): void
  onAiToolExecuted(
    callback: (payload: { id: string; result: { content: string; isError: boolean } }) => void,
  ): void

  // Itens do Menu nativo (ADR-0024)
  onMenuBuildInstaller(callback: (payload: { debug: boolean }) => void): void
  // Fechar projeto via menu nativo
  onMenuCloseProject(callback: () => void): void
  // Trocar idioma via menu nativo (ADR-0025)
  onMenuChangeLocale(callback: (locale: 'en' | 'pt') => void): void

  // Setup de Tauri em projetos pré-existentes (ADR-0024)
  installerCheck(projectDir: string): Promise<{ configured: boolean }>
  installerSetup(projectDir: string): Promise<{ ok: true; iconsGenerated: boolean }>

  // Preferências persistentes (ADR-0025 — i18n)
  prefsGet(): Promise<{ locale?: 'en' | 'pt'; welcomed?: boolean }>
  prefsSet(patch: { locale?: 'en' | 'pt'; welcomed?: boolean }): Promise<{
    locale?: 'en' | 'pt'
    welcomed?: boolean
  }>
  menuRebuild(locale: 'en' | 'pt'): Promise<void>

  // Controles da janela frameless (redesign / Layout A). Implementados no
  // preload+main; em janela com moldura nativa não são usados.
  windowMinimize(): Promise<void>
  windowMaximize(): Promise<void>
  windowClose(): Promise<void>
}
