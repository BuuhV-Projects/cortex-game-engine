/**
 * Janelas do Studio: splash com logo e a janela principal (frameless, com
 * hardening do renderer e os IPCs de controle de janela). SPEC-0693.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { APP_DISPLAY_NAME } from '../appIdentity.js'
import { getMainWindow, setMainWindow } from './shared.js'

let splashWindow: BrowserWindow | null = null

/** Logo (public/logo.png) como data URL, pra inlinar na splash sem depender de path. */
function logoDataUrl(): string | null {
  const candidates = [
    join(__dirname, '../renderer/logo.png'), // produção (out/renderer)
    join(app.getAppPath(), 'electron/renderer/public/logo.png'), // dev
    join(app.getAppPath(), 'out/renderer/logo.png'),
  ]
  for (const p of candidates) {
    try {
      return `data:image/png;base64,${readFileSync(p).toString('base64')}`
    } catch {
      /* tenta o próximo */
    }
  }
  return null
}

/** Splash com logo (janela sem moldura) enquanto o app carrega; fecha quando a janela principal está pronta. */
export function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  const logo = logoDataUrl()
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;overflow:hidden;font-family:"Segoe UI",Roboto,Arial,sans-serif}
    .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
      background:radial-gradient(120% 90% at 50% 0%,#23252e 0%,#16171c 75%);color:#e6e6e6}
    img{width:128px;height:auto;filter:drop-shadow(0 8px 22px rgba(0,0,0,.55))}
    .t{font-size:15px;font-weight:600}.s{font-size:12px;color:#9aa0ad}
    .bar{width:180px;height:4px;border-radius:3px;background:#2c2e36;overflow:hidden;margin-top:4px}
    .bar>i{display:block;height:100%;width:38%;background:#3b5bdb;border-radius:3px;animation:s 1.1s ease-in-out infinite}
    @keyframes s{0%{margin-left:-38%}100%{margin-left:100%}}
  </style><div class="card">${logo ? `<img src="${logo}">` : ''}
    <div class="t">${APP_DISPLAY_NAME}</div><div class="s">carregando…</div>
    <div class="bar"><i></i></div></div>`
  void splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  splashWindow.once('ready-to-show', () => splashWindow?.show())
}

export function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // só mostra quando o renderer carregou (a splash cobre o gap)
    // Janela sem moldura — a casca nova desenha a própria menubar + botões de
    // janela (redesign / Layout A). A área da menubar é arrastável via CSS
    // `-webkit-app-region: drag`. Controles de janela via IPC `window:*`.
    frame: false,
    backgroundColor: '#0d0e14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // Camadas de hardening (sem mudar comportamento funcional):
      // - nodeIntegration:false + contextIsolation:true blindam o renderer
      //   contra acesso direto a require/process do Node.
      // - sandbox:false é exigido pelo preload ESM (ADR-0008); compensamos
      //   com as flags defensivas abaixo.
      // - webSecurity:true mantém SOP/CORS ativos no renderer.
      // - allowRunningInsecureContent e experimentalFeatures explícitos em
      //   false bloqueiam mixed-content e features instáveis do Chromium.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })
  setMainWindow(mainWindow)

  // Bloqueia navegação para qualquer URL fora do app — se algum script
  // tentasse `location.href = 'https://evil'`, o request é abortado.
  // Em dev permitimos o origem do electron-vite (localhost com porta dinâmica).
  const allowedOrigins: string[] = []
  if (process.env['ELECTRON_RENDERER_URL']) {
    try {
      allowedOrigins.push(new URL(process.env['ELECTRON_RENDERER_URL']).origin)
    } catch {
      /* URL inválida — só ignora e mantém a allowlist vazia */
    }
  }
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const origin = new URL(url).origin
      if (allowedOrigins.includes(origin)) return
    } catch {
      /* URL ilegível também cai no deny */
    }
    event.preventDefault()
  })

  // Bloqueia `window.open(...)` e `target="_blank"`. Nenhuma página da IDE
  // precisa abrir popup; se um dia precisarmos abrir link externo, fazemos
  // explicitamente via shell.openExternal no main process.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Controles da janela frameless (redesign): a menubar custom chama estes via
  // IPC. Registrados aqui (createWindow roda uma vez).
  ipcMain.handle('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', () => getMainWindow()?.close())

  // DevTools do STUDIO — só em dev (no build empacotado o estúdio não expõe tools,
  // por design). A janela é frameless, então o menu nativo (com DevTools) fica
  // escondido; o item no menubar custom do studio chama isto.
  ipcMain.handle('devtools:toggle', () => {
    if (!app.isPackaged) getMainWindow()?.webContents.toggleDevTools()
  })
  // Síncrono: o renderer só MOSTRA o item de DevTools quando em dev.
  ipcMain.on('app:is-dev', (e) => {
    e.returnValue = !app.isPackaged
  })

  // Em desenvolvimento, electron-vite injeta ELECTRON_RENDERER_URL com o dev server
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Renderer pronto → mostra a janela principal e fecha a splash.
  mainWindow.webContents.once('did-finish-load', () => {
    getMainWindow()?.show()
    splashWindow?.close()
    splashWindow = null
  })

  mainWindow.on('closed', () => {
    setMainWindow(null)
  })
}
