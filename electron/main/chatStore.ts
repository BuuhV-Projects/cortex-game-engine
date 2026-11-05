/**
 * Persistência do Chat IA: histórico (PRD-0001 V2 / ADR-0021), session id do
 * Claude Agent SDK e imagens coladas (Ctrl+V). SPEC-0693.
 *
 * Salva em <userData>/chats/<hash>.json, onde <hash> é SHA-1 do path do projeto.
 * Centralizado no IDE (não polui o diretório do projeto) e identificado por
 * path absoluto — se o usuário renomear/mover o projeto, perde o histórico
 * (trade-off assumido pra V1; mais simples que rastrear identidade do projeto).
 */
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { createHash } from 'crypto'
import { getCurrentProjectDir, validatePath } from './shared.js'

function projectHash(projectDir: string): string {
  return createHash('sha1').update(projectDir).digest('hex').slice(0, 16)
}

function chatHistoryPath(projectDir: string): string {
  return join(app.getPath('userData'), 'chats', `${projectHash(projectDir)}.json`)
}

/**
 * Path do arquivo que guarda o session_id do Claude Agent SDK para um
 * projeto. Permite retomar a conversa (resume) entre execuções diferentes
 * do IDE — o backend Claude Code mantém o histórico em ~/.claude/sessions/.
 */
function sessionIdPath(projectDir: string): string {
  return join(app.getPath('userData'), 'sessions', `${projectHash(projectDir)}.txt`)
}

export async function loadSessionId(projectDir: string): Promise<string | null> {
  try {
    const raw = await readFile(sessionIdPath(projectDir), 'utf-8')
    return raw.trim() || null
  } catch {
    return null
  }
}

export async function saveSessionId(projectDir: string, sessionId: string): Promise<void> {
  const file = sessionIdPath(projectDir)
  await mkdir(join(app.getPath('userData'), 'sessions'), { recursive: true })
  await writeFile(file, sessionId, 'utf-8')
}

/**
 * Diretório onde imagens coladas (Ctrl+V) vivem temporariamente.
 * Fica em <userData>/cortex-pastes/<hash do projeto>/ — fora do diretório
 * do projeto pra não poluir o repo do usuário. O agente recebe path
 * ABSOLUTO na mensagem [imagem: ...] e o system prompt explicita que
 * paths absolutos retornados pela UI são confiáveis para Read.
 */
function pasteDirForProject(projectDir: string): string {
  return join(app.getPath('userData'), 'cortex-pastes', projectHash(projectDir))
}

export function registerChatStoreIpc(): void {
  ipcMain.handle('chat:load', async (_event, projectDir: unknown) => {
    if (typeof projectDir !== 'string' || projectDir === '') return []
    const file = chatHistoryPath(validatePath(projectDir))
    try {
      const raw = await readFile(file, 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  ipcMain.handle('chat:save', async (_event, projectDir: unknown, messages: unknown) => {
    if (typeof projectDir !== 'string' || projectDir === '') return
    if (!Array.isArray(messages)) return
    const file = chatHistoryPath(validatePath(projectDir))
    await mkdir(join(app.getPath('userData'), 'chats'), { recursive: true })
    await writeFile(file, JSON.stringify(messages), 'utf-8')
  })

  ipcMain.handle('chat:clear', async (_event, projectDir: unknown) => {
    if (typeof projectDir !== 'string' || projectDir === '') return
    const dir = validatePath(projectDir)
    try {
      await unlink(chatHistoryPath(dir))
    } catch {
      // ignora se não existe
    }
    // Também descarta o session_id do Agent SDK — senão o próximo turno RETOMA a
    // sessão antiga no backend (com todo o histórico/imagens acumulados) e a UI
    // limpa não corresponde ao que é enviado. Apagar = começar de fato do zero.
    try {
      await unlink(sessionIdPath(dir))
    } catch {
      // ignora se não existe
    }
  })

  ipcMain.handle('clipboard:saveImage', async (_event, dataUrl: unknown) => {
    const currentProjectDir = getCurrentProjectDir()
    if (!currentProjectDir) throw new Error('Sem projeto ativo')
    if (typeof dataUrl !== 'string') throw new Error('dataUrl deve ser string')
    const match = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) throw new Error('dataUrl não é uma imagem base64 válida')
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
    const buf = Buffer.from(match[2], 'base64')
    const dir = pasteDirForProject(currentProjectDir)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, `clipboard_${Date.now()}.${ext}`)
    await writeFile(filePath, buf)
    // Path absoluto POSIX-style (Read do Claude Code aceita / no Windows)
    return filePath.replace(/\\/g, '/')
  })

  // Apaga uma imagem de <userData>/cortex-pastes/<projectHash>/. O renderer
  // chama isso após o turno do agente terminar — as imagens só fazem sentido
  // enquanto estão sendo referenciadas. Sandboxed: rejeita paths fora do
  // diretório de pastes pra não virar um deletePath genérico.
  ipcMain.handle('clipboard:deleteImage', async (_event, absolutePath: unknown) => {
    const currentProjectDir = getCurrentProjectDir()
    if (!currentProjectDir) return
    if (typeof absolutePath !== 'string') return
    const expected = pasteDirForProject(currentProjectDir).replace(/\\/g, '/')
    const normalized = absolutePath.replace(/\\/g, '/')
    if (!normalized.startsWith(expected + '/')) return
    if (normalized.includes('..') || normalized.includes('\0')) return
    try {
      await unlink(normalized)
    } catch {
      // ignora se já não existe
    }
  })
}
