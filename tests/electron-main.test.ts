/**
 * Testes unitários para electron/main.ts
 * Cobre: createProject (cópia do template + substituição de placeholder),
 * writeFile (rejeição de path traversal), readDir (lista FileEntry).
 * Ref: ADR-0004.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import path from 'path'
import os from 'os'

// ── Mocks (içados pelo vitest antes de qualquer import) ───────────────────────

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getPath: vi.fn(),
    getAppPath: vi.fn(),
    whenReady: vi.fn(() => ({ then: vi.fn() })),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    webContents: { send: vi.fn() },
  })),
}))

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  cp: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// ── Imports (após mocks) ──────────────────────────────────────────────────────

import { ipcMain, app } from 'electron'
import * as fsp from 'fs/promises'

// Efeito colateral: registra todos os ipcMain.handle do main process
// eslint-disable-next-line import/no-unresolved
import '../electron/main.ts'

// ── Constantes de teste ───────────────────────────────────────────────────────

const MOCK_USERDATA = path.join(os.tmpdir(), 'test-userdata-electron-main')
const MOCK_APP_PATH = process.cwd()
const PROJECTS_ROOT = path.resolve(MOCK_USERDATA, 'projects')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recupera o listener registrado para um canal IPC. */
function getIpcHandler(channel: string) {
  const calls = vi.mocked(ipcMain.handle).mock.calls
  const found = calls.find(([ch]) => ch === channel)
  if (!found) throw new Error(`Handler '${channel}' não encontrado nas chamadas de ipcMain.handle`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return found[1] as (event: null, ...args: any[]) => Promise<unknown>
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(() => {
  vi.mocked(app.getPath).mockReturnValue(MOCK_USERDATA)
  vi.mocked(app.getAppPath).mockReturnValue(MOCK_APP_PATH)
})

afterEach(() => {
  vi.mocked(fsp.cp).mockReset()
  vi.mocked(fsp.readdir).mockReset()
  vi.mocked(fsp.readFile).mockReset()
  vi.mocked(fsp.writeFile).mockReset()
})

// ── Testes ────────────────────────────────────────────────────────────────────

describe('fs:createProject', () => {
  it('copia todos os arquivos do template e substitui {{PROJECT_NAME}}', async () => {
    const targetDir = os.tmpdir()
    const projectName = 'meu-jogo'
    const projectPath = path.resolve(targetDir, projectName)
    const templateDir = path.join(MOCK_APP_PATH, 'templates', 'new-project')

    // Entradas simuladas do diretório copiado (dois arquivos: um com placeholder, outro sem)
    const entries = [
      { name: 'package.json', isFile: () => true, isDirectory: () => false },
      { name: 'main.ts', isFile: () => true, isDirectory: () => false },
    ]

    vi.mocked(fsp.cp).mockResolvedValueOnce(undefined)
    vi.mocked(fsp.readdir).mockResolvedValueOnce(entries as never)
    // package.json contém o placeholder; main.ts não contém
    vi.mocked(fsp.readFile)
      .mockResolvedValueOnce('{"name":"{{PROJECT_NAME}}"}' as never)
      .mockResolvedValueOnce('// sem placeholder' as never)
    vi.mocked(fsp.writeFile).mockResolvedValue(undefined)

    const handler = getIpcHandler('fs:createProject')
    const result = await handler(null, targetDir, projectName)

    // Deve ter copiado o diretório do template para o path do projeto
    expect(vi.mocked(fsp.cp)).toHaveBeenCalledWith(templateDir, projectPath, { recursive: true })

    // Apenas package.json contém o placeholder — só ele deve ser reescrito
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledWith(
      path.join(projectPath, 'package.json'),
      '{"name":"meu-jogo"}',
      'utf-8',
    )

    // Retorna o path absoluto do projeto criado
    expect(result).toBe(projectPath)
  })
})

describe('fs:writeFile', () => {
  it('rejeita path com .. que sai do diretório de projetos (path traversal)', async () => {
    // path.join + '..' navega um nível acima de PROJECTS_ROOT → fora da área permitida
    const traversalPath = path.join(PROJECTS_ROOT, '..', 'evil.txt')

    const handler = getIpcHandler('fs:writeFile')
    await expect(handler(null, traversalPath, 'conteúdo')).rejects.toThrow(
      'Path fora do diretório de projetos permitido',
    )
  })

  it('aceita path válido dentro do diretório de projetos', async () => {
    const validPath = path.join(PROJECTS_ROOT, 'meu-jogo', 'main.ts')

    vi.mocked(fsp.writeFile).mockResolvedValueOnce(undefined)

    const handler = getIpcHandler('fs:writeFile')
    await expect(handler(null, validPath, 'conteúdo')).resolves.toBeUndefined()
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledWith(
      path.resolve(validPath),
      'conteúdo',
      'utf-8',
    )
  })
})

describe('fs:readDir', () => {
  it('retorna lista correta de { name, path, isDir }', async () => {
    const dirPath = path.join(os.tmpdir(), 'testdir-readdir')

    const entries = [
      { name: 'main.ts', isDirectory: () => false },
      { name: 'src', isDirectory: () => true },
    ]
    vi.mocked(fsp.readdir).mockResolvedValueOnce(entries as never)

    const handler = getIpcHandler('fs:readDir')
    const result = await handler(null, dirPath)

    expect(result).toEqual([
      { name: 'main.ts', path: path.join(dirPath, 'main.ts'), isDir: false },
      { name: 'src', path: path.join(dirPath, 'src'), isDir: true },
    ])
  })
})
