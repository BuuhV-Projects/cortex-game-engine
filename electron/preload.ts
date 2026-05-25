import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Sistema de arquivos
  readDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:readDir', dirPath),

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

  // Chat IA (ADR-0014)
  chat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    ipcRenderer.invoke('ai:chat', messages),

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

  onAiDone: (callback: () => void) => {
    ipcRenderer.on('ai:done', () => callback())
  },

  onAiError: (callback: (message: string) => void) => {
    ipcRenderer.on('ai:error', (_event, payload: { message: string }) => callback(payload.message))
  },
})
