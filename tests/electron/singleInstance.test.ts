/**
 * Instância única do Studio (ADR-0141), ramo do lock NEGADO.
 *
 * O `tests/electron-main.test.ts` cobre o caminho feliz (lock concedido →
 * handlers IPC registrados). Aqui travamos o outro ramo, que é o arriscado: se
 * a segunda instância não chamasse `app.quit()`, teríamos dois Studios no mesmo
 * `userData`; se ela purgasse o cache, estragaria o da instância viva.
 *
 * Arquivo separado porque `electron/main.ts` só roda o top-level uma vez por
 * módulo — testar o outro ramo exige um registry de módulos limpo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

const MOCK_USERDATA = path.join(os.tmpdir(), 'test-userdata-single-instance')

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getPath: vi.fn(() => MOCK_USERDATA),
    getAppPath: vi.fn(() => process.cwd()),
    whenReady: vi.fn(() => ({ then: vi.fn() })),
    on: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => false), // já existe um Studio aberto
  },
  dialog: { showMessageBox: vi.fn(), showErrorBox: vi.fn(), showOpenDialog: vi.fn() },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    webContents: { send: vi.fn() },
  })),
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
  shell: { openExternal: vi.fn() },
}))

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  cp: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock('child_process', () => ({ spawn: vi.fn(), spawnSync: vi.fn() }))

// Espiona a higiene de cache pra provar que a 2ª instância NÃO a executa.
const recoverCacheIfUnclean = vi.fn(() => [] as string[])
vi.mock('../../electron/cacheHygiene.js', () => ({
  recoverCacheIfUnclean,
  markSessionEnd: vi.fn(),
}))

beforeEach(() => {
  vi.resetModules()
  recoverCacheIfUnclean.mockClear()
})

describe('segunda instância do Studio', () => {
  it('sai imediatamente e NÃO toca no cache da instância viva', async () => {
    const { app } = await import('electron')
    vi.mocked(app.quit).mockClear()

    await import('../../electron/main.js')

    expect(app.requestSingleInstanceLock).toHaveBeenCalled()
    expect(app.quit).toHaveBeenCalled()

    // Prova que o mock do cacheHygiene está de fato interceptando — sem isto o
    // `not.toHaveBeenCalled()` abaixo passaria mesmo com o mock desligado.
    const hygiene = await import('../../electron/cacheHygiene.js')
    expect(hygiene.recoverCacheIfUnclean).toBe(recoverCacheIfUnclean)
    // Purgar aqui apagaria o cache que a 1ª instância está usando.
    expect(recoverCacheIfUnclean).not.toHaveBeenCalled()
  })

  it('não registra o handler second-instance (quem escuta é a instância dona)', async () => {
    const { app } = await import('electron')
    vi.mocked(app.on).mockClear()

    await import('../../electron/main.js')

    const channels = vi.mocked(app.on).mock.calls.map(([ch]) => ch)
    expect(channels).not.toContain('second-instance')
  })
})
