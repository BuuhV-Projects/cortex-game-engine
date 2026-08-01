/**
 * Diretório de dados preso ao nome legado (SPEC-0179).
 *
 * O `userData` do Electron sai do nome do app, que no build empacotado vem do
 * `productName`. Se o Studio não fixasse o caminho, o rebrand moveria
 * `%APPDATA%\<produto>` e o usuário abriria um Studio zerado — sem idioma, sem
 * projetos recentes e sem histórico do Chat IA. Falha silenciosa: o app funciona,
 * só perdeu tudo.
 *
 * Arquivo separado porque exige um mock de `getPath` que já responda no import
 * do `electron/main.ts` (o `tests/electron-main.test.ts` só configura o retorno
 * no `beforeAll`, tarde demais para o top-level do módulo) e um registry limpo
 * por teste, para exercitar os dois ramos da guarda de `--user-data-dir`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

import { APP_DATA_NAME, APP_DISPLAY_NAME } from '../../electron/appIdentity.js'

const MOCK_APPDATA = path.join(os.tmpdir(), 'test-appdata-cortex')

// Import frio do main process inteiro (transform + execução do grafo); a folga
// acompanha a do singleInstance.test.ts, que faz o mesmo.
const COLD_MAIN_IMPORT_TIMEOUT_MS = 30_000

/** Switches de linha de comando visíveis ao main — mutável por teste. */
const cliSwitches = new Set<string>()

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getPath: vi.fn((name: string) =>
      name === 'appData' ? MOCK_APPDATA : path.join(MOCK_APPDATA, 'default-userdata'),
    ),
    getAppPath: vi.fn(() => process.cwd()),
    whenReady: vi.fn(() => ({ then: vi.fn() })),
    on: vi.fn(),
    quit: vi.fn(),
    setPath: vi.fn(),
    setName: vi.fn(),
    commandLine: { hasSwitch: vi.fn((name: string) => cliSwitches.has(name)) },
    // Lock concedido: só assim o boot segue até a higiene de cache, que é o
    // primeiro `getPath('userData')` do processo — o marco que a ordem compara.
    requestSingleInstanceLock: vi.fn(() => true),
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
vi.mock('../../electron/cacheHygiene.js', () => ({
  recoverCacheIfUnclean: vi.fn(() => [] as string[]),
  markSessionEnd: vi.fn(),
}))

beforeEach(() => {
  // `resetModules` re-executa o main.ts, mas o módulo 'electron' mockado é o
  // MESMO objeto entre testes: sem limpar, as chamadas de um boot vazam para o
  // seguinte (e `not.toHaveBeenCalled()` nunca falharia). `clearAllMocks` zera o
  // histórico preservando as implementações da factory.
  vi.resetModules()
  vi.clearAllMocks()
  cliSwitches.clear()
})

/** Sobe o main process do zero e devolve o `app` mockado daquele boot. */
async function bootMain() {
  const { app } = await import('electron')
  await import('../../electron/main.js')
  return app
}

describe('diretório de dados do Studio', () => {
  it(
    'fixa o userData no nome legado, dentro do appData',
    async () => {
      const app = await bootMain()
      expect(app.setPath).toHaveBeenCalledWith('userData', path.join(MOCK_APPDATA, APP_DATA_NAME))
    },
    COLD_MAIN_IMPORT_TIMEOUT_MS,
  )

  it(
    'fixa o caminho ANTES do primeiro getPath("userData")',
    async () => {
      const app = await bootMain()

      // Depois que o Electron resolve o userData, mudar o caminho não move mais
      // o que já foi lido/escrito.
      const [setPathOrder] = vi.mocked(app.setPath).mock.invocationCallOrder
      const userDataCallIndex = vi
        .mocked(app.getPath)
        .mock.calls.findIndex(([name]) => name === 'userData')
      expect(userDataCallIndex).toBeGreaterThanOrEqual(0)
      const getUserDataOrder = vi.mocked(app.getPath).mock.invocationCallOrder[userDataCallIndex]

      expect(setPathOrder).toBeGreaterThan(0)
      expect(setPathOrder).toBeLessThan(getUserDataOrder as number)
    },
    COLD_MAIN_IMPORT_TIMEOUT_MS,
  )

  it(
    'NÃO renomeia o app — o título das janelas segue o nome de exibição',
    async () => {
      const app = await bootMain()

      // `app.setName(APP_DATA_NAME)` também travaria o userData, mas o nome do
      // app é o título default de janelas sem <title> (a splash): o Alt+Tab
      // mostraria o nome antigo. Ver SPEC-0179 §3.
      expect(app.setName).not.toHaveBeenCalledWith(APP_DATA_NAME)
      expect(APP_DISPLAY_NAME).not.toBe(APP_DATA_NAME)
    },
    COLD_MAIN_IMPORT_TIMEOUT_MS,
  )

  it(
    'respeita --user-data-dir explícito em vez de redirecionar em silêncio',
    async () => {
      // Perfil alternativo (validação de UI, segunda instância): `setPath`
      // sobrescreveria o switch e mandaria a escrita pro diretório real.
      cliSwitches.add('user-data-dir')

      const app = await bootMain()

      expect(app.commandLine.hasSwitch).toHaveBeenCalledWith('user-data-dir')
      expect(app.setPath).not.toHaveBeenCalled()
    },
    COLD_MAIN_IMPORT_TIMEOUT_MS,
  )
})
