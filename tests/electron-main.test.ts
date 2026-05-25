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
  mkdir: vi.fn(),
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
  vi.mocked(fsp.mkdir).mockReset()
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

    vi.mocked(fsp.cp).mockResolvedValue(undefined)
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined)
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

    // package.json é reescrito com o placeholder substituído
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledWith(
      path.join(projectPath, 'package.json'),
      '{"name":"meu-jogo"}',
      'utf-8',
    )

    // Retorna o path absoluto do projeto criado
    expect(result).toBe(projectPath)
  })

  it('vendoriza o engine em <projeto>/vendor/js-game-engine/', async () => {
    const targetDir = os.tmpdir()
    const projectName = 'meu-jogo'
    const projectPath = path.resolve(targetDir, projectName)
    const vendorDir = path.join(projectPath, 'vendor', 'js-game-engine')

    vi.mocked(fsp.cp).mockResolvedValue(undefined)
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined)
    vi.mocked(fsp.readdir).mockResolvedValueOnce([] as never)
    vi.mocked(fsp.writeFile).mockResolvedValue(undefined)

    const handler = getIpcHandler('fs:createProject')
    await handler(null, targetDir, projectName)

    // Bundle do engine copiado para vendor/js-game-engine/index.js
    expect(vi.mocked(fsp.cp)).toHaveBeenCalledWith(
      path.join(MOCK_APP_PATH, 'dist-engine', 'index.js'),
      path.join(vendorDir, 'index.js'),
    )

    // .d.ts de um módulo de core e um de ecs (representantes — não exaustivo)
    expect(vi.mocked(fsp.cp)).toHaveBeenCalledWith(
      path.join(MOCK_APP_PATH, 'dist', 'src', 'core', 'GameLoop.d.ts'),
      path.join(vendorDir, 'core', 'GameLoop.d.ts'),
    )
    expect(vi.mocked(fsp.cp)).toHaveBeenCalledWith(
      path.join(MOCK_APP_PATH, 'dist', 'src', 'ecs', 'World.d.ts'),
      path.join(vendorDir, 'ecs', 'World.d.ts'),
    )

    // index.d.ts agregador com re-exports
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledWith(
      path.join(vendorDir, 'index.d.ts'),
      expect.stringContaining("export * from './core/GameLoop.js';"),
      'utf-8',
    )
  })
})

describe('fs:writeFile', () => {
  it('rejeita path com byte nulo', async () => {
    const handler = getIpcHandler('fs:writeFile')
    await expect(handler(null, 'foo\0bar.txt', 'conteúdo')).rejects.toThrow(
      'Path contém byte nulo',
    )
  })

  it('rejeita content que não é string', async () => {
    const validPath = path.join(os.tmpdir(), 'meu-jogo', 'main.ts')

    const handler = getIpcHandler('fs:writeFile')
    await expect(handler(null, validPath, 123)).rejects.toThrow(
      'content deve ser uma string',
    )
  })

  it('escreve em qualquer path absoluto válido (sem restrição de diretório)', async () => {
    // O IDE permite criar projetos em qualquer pasta — o save aceita o path
    // resolvido sem restringir a userData/projects.
    const validPath = path.join(os.tmpdir(), 'meu-jogo', 'main.ts')

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
