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

  // Execução de projeto
  runProject: (projectDir: string) =>
    ipcRenderer.invoke('run:start', projectDir),

  stopProject: () =>
    ipcRenderer.invoke('run:stop'),

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
})
