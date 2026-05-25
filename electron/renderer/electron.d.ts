interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

interface ElectronAPI {
  readDir(dirPath: string): Promise<FileEntry[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  createProject(targetDir: string, name: string): Promise<string>
  createFile(dirPath: string, name: string): Promise<string>
  createDir(dirPath: string, name: string): Promise<string>
  move(src: string, dest: string): Promise<void>
  deletePath(targetPath: string): Promise<void>
  selectDirectory(): Promise<string | null>
  readEngineTypes(): Promise<Array<{ path: string; content: string; navigable: boolean }>>
  runProject(projectDir: string): Promise<void>
  stopProject(): Promise<void>
  runTerminalCommand(projectDir: string, command: string): Promise<void>
  stopTerminalCommand(): Promise<void>
  chat(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<void>
  onLog(callback: (line: string) => void): void
  onProjectStopped(callback: () => void): void
  onTerminalOutput(callback: (text: string) => void): void
  onTerminalDone(callback: (exitCode: number) => void): void
  onAiChunk(callback: (text: string) => void): void
  onAiDone(callback: () => void): void
  onAiError(callback: (message: string) => void): void
}

interface Window {
  electronAPI: ElectronAPI
}
