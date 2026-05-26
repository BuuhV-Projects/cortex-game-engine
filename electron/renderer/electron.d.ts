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
  setActiveProject(projectDir: string | null): Promise<void>
  decideToolCall(id: string, approved: boolean): Promise<void>
  cancelChat(): Promise<void>
  checkAuth(): Promise<{ method: 'api-key' | 'oauth' | 'none'; hasCredential: boolean }>
  loginClaude(): Promise<{ ok: true } | { ok: false; message: string }>
  onLog(callback: (line: string) => void): void
  onProjectStopped(callback: () => void): void
  onTerminalOutput(callback: (text: string) => void): void
  onTerminalDone(callback: (exitCode: number) => void): void
  onAiChunk(callback: (text: string) => void): void
  onAiDone(callback: () => void): void
  onAiError(callback: (message: string) => void): void
  onAiToolRequest(
    callback: (request: AiToolRequest) => void,
  ): void
  onAiToolExecuted(
    callback: (payload: { id: string; result: { content: string; isError: boolean } }) => void,
  ): void
}

interface AiToolRequest {
  id: string
  name: string
  input: Record<string, unknown>
  summary: string
  needsApproval: boolean
}

interface Window {
  electronAPI: ElectronAPI
}
