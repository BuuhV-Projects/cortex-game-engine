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

  // Eventos do main → renderer
  // removeAllListeners garante que chamadas repetidas não acumulem handlers
  onLog: (callback: (line: string) => void) => {
    ipcRenderer.removeAllListeners('log')
    ipcRenderer.on('log', (_event, line: string) => callback(line))
  },

  onProjectStopped: (callback: () => void) => {
    ipcRenderer.removeAllListeners('project:stopped')
    ipcRenderer.on('project:stopped', () => callback())
  },

  onTerminalOutput: (callback: (text: string) => void) => {
    ipcRenderer.removeAllListeners('terminal:output')
    ipcRenderer.on('terminal:output', (_event, text: string) => callback(text))
  },

  onTerminalDone: (callback: (exitCode: number) => void) => {
    ipcRenderer.removeAllListeners('terminal:done')
    ipcRenderer.on('terminal:done', (_event, payload: { code: number }) => callback(payload.code))
  },
})
