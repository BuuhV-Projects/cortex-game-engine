
export interface AiToolRequest {
    id: string
    name: string
    input: Record<string, unknown>
    summary: string
    needsApproval: boolean
}
export interface ElectronAPI {
    onAiChunk(callback: (text: string) => void): void
    onAiDone(callback: () => void): void
    onAiError(callback: (message: string) => void): void
    onAiToolRequest(callback: (request: AiToolRequest) => void): void
    onAiToolExecuted(callback: (payload: { id: string; result: { content: string; isError: boolean } }) => void): void
    setActiveProject(projectDir: string | null): Promise<void>
    cancelChat(): Promise<void>
    chat(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<void>
    decideToolCall(id: string, approved: boolean): Promise<void>
}