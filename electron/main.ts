/**
 * Bootstrap do main process do Studio: identidade de dados, instância única,
 * higiene de cache, registro dos handlers IPC (por área, em `electron/main/`)
 * e ciclo de vida do app. SPEC-0693.
 */
import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { recoverCacheIfUnclean, markSessionEnd } from './cacheHygiene.js'
import { APP_DATA_NAME } from './appIdentity.js'
import { getMainWindow } from './main/shared.js'
import { createSplash, createWindow } from './main/window.js'
import { registerFsIpc } from './main/fsIpc.js'
import { registerEngineIpc } from './main/engineVendor.js'
import { registerExportIpc } from './main/exportIpc.js'
import { registerProjectConfigIpc } from './main/projectConfigIpc.js'
import { registerInstallerIpc } from './main/installerIpc.js'
import { loadPreferences, registerPrefsDialogsIpc } from './main/prefsDialogsIpc.js'
import { killRunnerForQuit, registerRunIpc } from './main/projectRunner.js'
import { killTerminalForQuit, registerTerminalIpc } from './main/terminalIpc.js'
import { killCharacterRigForQuit, registerCharacterRigIpc } from './main/characterRigIpc.js'
import { registerChatStoreIpc } from './main/chatStore.js'
import { registerAgentIpc } from './main/agentIpc.js'
import { buildAppMenu, registerMenuIpc, setMenuLocale } from './main/appMenu.js'

// ---------------------------------------------------------------------------
// Identidade de dados + instância única + higiene de cache
// (rodam ANTES de qualquer janela)
// ---------------------------------------------------------------------------

/**
 * Prende o `userData` a um diretório fixo, independente do nome de exibição do
 * app (SPEC-0179). Sem isso o caminho sairia do `productName` do
 * electron-builder e cada rebrand abandonaria `preferences.json`, `chats/` e
 * `sessions/` do usuário.
 *
 * É `setPath` e NÃO `setName`: renomear o app moveria o diretório do mesmo
 * jeito, mas o nome do app também é o **título default** de toda janela sem
 * `<title>` próprio — a splash apareceria no Alt+Tab com o nome antigo.
 *
 * O `--user-data-dir` explícito vence: sem essa guarda, quem pede um perfil
 * alternativo (validar UI sem tocar no perfil real, abrir uma segunda instância)
 * seria redirecionado em silêncio para o diretório fixo.
 *
 * Tem que vir ANTES do primeiro `app.getPath('userData')` — que é logo abaixo,
 * na higiene de cache.
 */
if (!app.commandLine.hasSwitch('user-data-dir')) {
  try {
    app.setPath('userData', join(app.getPath('appData'), APP_DATA_NAME))
  } catch {
    /* appData indisponível (ex.: sob teste) — segue com o default do Electron */
  }
}

/**
 * Só uma instância do Studio por vez. Duas instâncias compartilhariam o mesmo
 * `userData` — mesmo disk cache, `preferences.json`, `chats/` e `sessions/` —
 * e a última a escrever venceria silenciosamente. A segunda invocação sai na
 * hora e apenas foca a janela que já existe.
 *
 * Também é pré-requisito da purga de cache abaixo: sem o lock, uma segunda
 * instância limparia o cache que a primeira está usando.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  // Shutdown sujo da sessão anterior (Ctrl+C no dev, crash) deixa o índice
  // blockfile do disk cache inconsistente — purga antes do Chromium abri-lo.
  try {
    recoverCacheIfUnclean(app.getPath('userData'))
  } catch {
    /* userData indisponível (ex.: sob teste) — segue o boot normalmente */
  }
}

// ---------------------------------------------------------------------------
// Handlers IPC — registrados no import (os testes do main dependem disso)
// ---------------------------------------------------------------------------

registerFsIpc()
registerEngineIpc()
registerExportIpc()
registerProjectConfigIpc()
registerInstallerIpc()
registerPrefsDialogsIpc()
registerRunIpc()
registerTerminalIpc()
registerCharacterRigIpc()
registerChatStoreIpc()
registerAgentIpc()
registerMenuIpc()

// ---------------------------------------------------------------------------
// Ciclo de vida do app
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Lê o locale persistido pra montar o menu nativo no idioma certo
  // já no primeiro frame (evita o "flash" do menu em inglês quando o
  // usuário tem PT escolhido).
  const prefs = await loadPreferences()
  if (prefs.locale === 'en' || prefs.locale === 'pt') setMenuLocale(prefs.locale)
  Menu.setApplicationMenu(buildAppMenu())
  createSplash()
  createWindow()

  // macOS: recria a janela ao clicar no ícone do dock quando não há janelas abertas
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Ao fechar o Studio, mata o vite/terminal SINCRONAMENTE — senão o `vite` (neto
// do shell) vira processo órfão segurando a porta, e na próxima abertura a porta
// fica presa. `before-quit` cobre o fechamento normal (window-all-closed→quit).
app.on('before-quit', () => {
  killRunnerForQuit()
  killTerminalForQuit()
  killCharacterRigForQuit()

  // Sentinela removida = este shutdown foi limpo; o próximo boot não precisa
  // purgar o disk cache. Se o processo morrer à força, a sentinela sobrevive
  // e o boot seguinte limpa o blockfile corrompido.
  if (gotSingleInstanceLock) {
    try {
      markSessionEnd(app.getPath('userData'))
    } catch {
      /* best-effort no shutdown */
    }
  }
})

app.on('window-all-closed', () => {
  // Em plataformas que não sejam macOS, encerra o app ao fechar todas as janelas
  if (process.platform !== 'darwin') app.quit()
})
