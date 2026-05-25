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
  selectDirectory(): Promise<string | null>
  readEngineTypes(): Promise<Array<{ path: string; content: string; navigable: boolean }>>
  runProject(projectDir: string): Promise<void>
  stopProject(): Promise<void>
  onLog(callback: (line: string) => void): void
  onProjectStopped(callback: () => void): void
}

interface Window {
  electronAPI: ElectronAPI
}
