import { contextBridge, ipcRenderer } from 'electron'

// Repete a forma de TurnStats do agentLoop — preload é um arquivo compilado
// separadamente e não importa do main bundle. Mantém em sync manualmente.
interface TurnStats {
  durationMs: number
  costUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  sessionId: string | null
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Sistema de arquivos
  readDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:readDir', dirPath),

  listProjectFiles: (projectDir: string) =>
    ipcRenderer.invoke('fs:listProjectFiles', projectDir),

  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),

  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  createProject: (targetDir: string, name: string) =>
    ipcRenderer.invoke('fs:createProject', targetDir, name),

  createFile: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:createFile', dirPath, name),

  createDir: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:createDir', dirPath, name),

  move: (src: string, dest: string) =>
    ipcRenderer.invoke('fs:move', src, dest),

  deletePath: (targetPath: string) =>
    ipcRenderer.invoke('fs:delete', targetPath),

  // Diálogo nativo de seleção de pasta
  selectDirectory: () =>
    ipcRenderer.invoke('dialog:openDirectory'),

  // Types do engine para alimentar o Monaco
  readEngineTypes: () =>
    ipcRenderer.invoke('engine:readTypes'),

  // Execução de projeto
  runProject: (projectDir: string) =>
    ipcRenderer.invoke('run:start', projectDir),

  stopProject: () =>
    ipcRenderer.invoke('run:stop'),

  // Terminal embutido (ADR-0012)
  runTerminalCommand: (projectDir: string, command: string) =>
    ipcRenderer.invoke('terminal:run', projectDir, command),

  stopTerminalCommand: () =>
    ipcRenderer.invoke('terminal:stop'),

  // Chat IA (ADR-0014, ADR-0017)
  chat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>, mode: 'ask' | 'auto') =>
    ipcRenderer.invoke('ai:chat', messages, mode),

  // Define o projeto que o agente do chat vê (sandbox de tools — ADR-0017)
  setActiveProject: (projectDir: string | null) =>
    ipcRenderer.invoke('project:setActive', projectDir),

  // Decisão do usuário sobre uma tool call pendente (ADR-0018)
  decideToolCall: (id: string, approved: boolean) =>
    ipcRenderer.invoke('ai:tool_decision', id, approved),

  // Cancela o turno do agente em andamento
  cancelChat: () => ipcRenderer.invoke('ai:cancel'),

  // Salva imagem do clipboard em .cortex/paste/ e retorna path relativo
  saveClipboardImage: (dataUrl: string) =>
    ipcRenderer.invoke('clipboard:saveImage', dataUrl),

  // Apaga uma imagem de .cortex/paste/ (após o turno do agente usar)
  deleteClipboardImage: (relPath: string) =>
    ipcRenderer.invoke('clipboard:deleteImage', relPath),

  // Persistência do histórico de chat por projeto (PRD-0001 V2)
  loadChatHistory: (projectDir: string) =>
    ipcRenderer.invoke('chat:load', projectDir),
  saveChatHistory: (projectDir: string, messages: Array<{ role: string; content: string }>) =>
    ipcRenderer.invoke('chat:save', projectDir, messages),
  clearChatHistory: (projectDir: string) =>
    ipcRenderer.invoke('chat:clear', projectDir),

  // Eventos do main → renderer. Cada chamada adiciona um listener ao canal;
  // múltiplos componentes (Preview, BottomPanel, etc.) podem se inscrever
  // ao mesmo evento. Os componentes só chamam onX uma vez no init, então
  // acumular listeners ao longo da sessão não é problema.
  onLog: (callback: (line: string) => void) => {
    ipcRenderer.on('log', (_event, line: string) => callback(line))
  },

  onProjectStopped: (callback: () => void) => {
    ipcRenderer.on('project:stopped', () => callback())
  },

  onTerminalOutput: (callback: (text: string) => void) => {
    ipcRenderer.on('terminal:output', (_event, text: string) => callback(text))
  },

  onTerminalDone: (callback: (exitCode: number) => void) => {
    ipcRenderer.on('terminal:done', (_event, payload: { code: number }) => callback(payload.code))
  },

  onAiChunk: (callback: (text: string) => void) => {
    ipcRenderer.on('ai:chunk', (_event, payload: { text: string }) => callback(payload.text))
  },

  onAiDone: (callback: (payload: { stopReason: string | null; stats: TurnStats | null }) => void) => {
    ipcRenderer.on(
      'ai:done',
      (_event, payload: { stopReason: string | null; stats: TurnStats | null }) =>
        callback(payload),
    )
  },

  onAiError: (callback: (message: string) => void) => {
    ipcRenderer.on('ai:error', (_event, payload: { message: string }) => callback(payload.message))
  },

  // Tool calls do agente (ADR-0018)
  onAiToolRequest: (
    callback: (request: {
      id: string
      name: string
      input: Record<string, unknown>
      summary: string
      needsApproval: boolean
    }) => void,
  ) => {
    ipcRenderer.on('ai:tool_request', (_event, request) => callback(request))
  },

  onAiToolExecuted: (
    callback: (payload: { id: string; result: { content: string; isError: boolean } }) => void,
  ) => {
    ipcRenderer.on('ai:tool_executed', (_event, payload) => callback(payload))
  },

  // Item "Projeto > Gerar instalador..." do Menu nativo (ADR-0024)
  onMenuBuildInstaller: (callback: () => void) => {
    ipcRenderer.on('menu:build-installer', () => callback())
  },

  // Setup de Tauri em projetos pré-existentes (ADR-0024)
  installerCheck: (projectDir: string) =>
    ipcRenderer.invoke('installer:check', projectDir),
  installerSetup: (projectDir: string) =>
    ipcRenderer.invoke('installer:setup', projectDir),
})
