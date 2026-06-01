import { spawn, type ChildProcess } from 'node:child_process'
import { BrowserWindow, type WebContents } from 'electron'

/**
 * Sobe o `vite` do projeto, carrega o jogo numa BrowserWindow oculta (fora da
 * tela) do próprio Electron, opcionalmente injeta input (teclado) pra "jogar",
 * captura screenshot(s) e coleta as mensagens de console — tudo no main process.
 * Usado pela tool `playtest_game` do Chat IA pra "ver" e "jogar" o jogo rodando
 * e validar a própria implementação (ADR-0033).
 *
 * Roda no Electron (não Playwright) de propósito: o engine é WebGPU-only
 * (ADR-0032) e o Chromium do Electron renderiza WebGPU igual ao preview.
 *
 * Input: `webContents.sendInputEvent` dispara `keydown`/`keyup` DOM reais, que o
 * InputManager do engine (escuta `document.body`) lê normalmente.
 */

// Vite imprime "Local:   http://localhost:NNNN/" com códigos ANSI de cor.
const ANSI_RE = /\x1b\[[0-9;]*m/g
const VITE_LOCAL_URL_RE = /Local:\s+(https?:\/\/[^\s]+)/

/**
 * Uma ação na timeline do playtest:
 * - `press`: pressiona a tecla (keyDown) e a mantém até um `release`.
 * - `release`: solta a tecla (keyUp).
 * - `tap`: pressiona e solta rapidamente (keyDown + espera `ms` + keyUp).
 * - `wait`: só espera `ms` (o jogo continua rodando frames).
 * - `screenshot`: captura um PNG nesse ponto da timeline.
 *
 * `key` usa o valor de `KeyboardEvent.key` (ex.: `"ArrowRight"`, `"a"`, `" "`)
 * ou aliases amigáveis (`"Right"`, `"Space"`); ver KEY_ALIASES.
 */
export type InputAction =
  | { type: 'press'; key: string }
  | { type: 'release'; key: string }
  | { type: 'tap'; key: string; ms?: number }
  | { type: 'wait'; ms: number }
  | { type: 'screenshot' }

export interface PlaytestOptions {
  /** Largura da janela/captura. Default 1280. */
  width?: number
  /** Altura da janela/captura. Default 720. */
  height?: number
  /** Espera após o load, pra dar tempo do init WebGPU + assets + alguns frames. Default 3000ms. */
  waitMs?: number
  /** Porta do vite dedicado (evita colidir com o Play do usuário em 5174). Default 5180. */
  port?: number
  /** Timeout esperando o vite imprimir a URL. Default 30000ms. */
  urlTimeoutMs?: number
  /**
   * Sequência de input pra "jogar" o jogo. Executada após o `waitMs` inicial.
   * Se nenhuma ação `screenshot` for incluída, um screenshot é tirado no fim.
   */
  actions?: InputAction[]
}

export interface PlaytestResult {
  /** PNGs capturados (um por ação `screenshot`, ou um único no fim). */
  screenshots: Buffer[]
  /** Mensagens de console do jogo (erros/warns/logs), capadas. */
  consoleMessages: string[]
  ok: boolean
  /** Nota humana (sucesso ou causa da falha). */
  note: string
  viteUrl: string | null
}

const MAX_MESSAGES = 200

/**
 * Mapeia `KeyboardEvent.key` (e aliases) → keyCode do Electron (estilo
 * Accelerator). Letras/dígitos não mapeados são passados como estão
 * (ex.: `"a"` → `"a"`, que o Chromium entrega como `key: "a"`).
 */
const KEY_ALIASES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  ' ': 'Space',
  Space: 'Space',
  Spacebar: 'Space',
  Enter: 'Enter',
  Return: 'Enter',
  Escape: 'Esc',
  Esc: 'Esc',
  Shift: 'Shift',
  Control: 'Control',
  Ctrl: 'Control',
  Alt: 'Alt',
  Tab: 'Tab',
  Backspace: 'Backspace',
}

function toElectronKeyCode(key: string): string {
  return KEY_ALIASES[key] ?? key
}

function killTree(proc: ChildProcess): void {
  if (!proc.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'])
  } else {
    proc.kill('SIGTERM')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function sendKey(wc: WebContents, type: 'keyDown' | 'keyUp', key: string): void {
  wc.sendInputEvent({ type, keyCode: toElectronKeyCode(key) })
}

/** Normaliza o `console-message` (a assinatura mudou entre versões do Electron). */
function formatConsole(args: unknown[]): string {
  const first = args[0]
  if (first && typeof first === 'object' && 'message' in (first as object)) {
    const e = first as { level?: unknown; message?: unknown }
    return `[${String(e.level ?? 'log')}] ${String(e.message ?? '')}`.trim()
  }
  // Assinatura antiga: (event, level, message, line, sourceId)
  return `[${String(args[1] ?? 'log')}] ${String(args[2] ?? '')}`.trim()
}

/**
 * Executa a timeline de input, capturando screenshots nas ações `screenshot`.
 * Teclas mantidas via `press` sem `release` são soltas implicitamente no
 * teardown (a janela é destruída).
 */
async function runActions(
  wc: WebContents,
  actions: InputAction[],
  screenshots: Buffer[],
): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case 'press':
        sendKey(wc, 'keyDown', action.key)
        break
      case 'release':
        sendKey(wc, 'keyUp', action.key)
        break
      case 'tap':
        sendKey(wc, 'keyDown', action.key)
        await delay(action.ms ?? 80)
        sendKey(wc, 'keyUp', action.key)
        break
      case 'wait':
        await delay(action.ms)
        break
      case 'screenshot': {
        const image = await wc.capturePage()
        screenshots.push(image.toPNG())
        break
      }
    }
  }
}

export async function runAndCaptureGame(
  projectRoot: string,
  opts: PlaytestOptions = {},
): Promise<PlaytestResult> {
  const width = opts.width ?? 1280
  const height = opts.height ?? 720
  const waitMs = opts.waitMs ?? 3000
  const port = opts.port ?? 5180
  const urlTimeoutMs = opts.urlTimeoutMs ?? 30000
  const actions = opts.actions ?? []

  const messages: string[] = []
  const pushMsg = (m: string): void => {
    if (messages.length < MAX_MESSAGES) messages.push(m)
  }
  const screenshots: Buffer[] = []

  let vite: ChildProcess | null = null
  let win: BrowserWindow | null = null

  try {
    // 1) Sobe o vite dedicado (mesmo comando do Play, com porta alternativa).
    //    Comando como string única (sem array de args) porque com `shell: true`
    //    passar args separados dispara o DeprecationWarning DEP0190. `port` é um
    //    inteiro interno controlado — sem risco de injeção.
    vite = spawn(`vite --port ${port}`, {
      cwd: projectRoot,
      shell: true,
      env: process.env,
    })

    const viteUrl = await new Promise<string>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(
        () => rejectPromise(new Error(`Timeout (${urlTimeoutMs}ms) esperando o vite subir.`)),
        urlTimeoutMs,
      )
      const onData = (data: Buffer): void => {
        const clean = data.toString().replace(ANSI_RE, '')
        const match = clean.match(VITE_LOCAL_URL_RE)
        if (match) {
          clearTimeout(timer)
          resolvePromise(match[1]!)
        }
      }
      vite!.stdout?.on('data', onData)
      vite!.stderr?.on('data', onData)
      vite!.on('error', (e) => {
        clearTimeout(timer)
        rejectPromise(e)
      })
      vite!.on('close', (code) => {
        clearTimeout(timer)
        rejectPromise(new Error(`vite encerrou (código ${code}) antes de servir.`))
      })
    })

    // 2) Janela oculta. Posicionada fora da tela e "mostrada" pra garantir que o
    //    Chromium realmente pinte (capturePage em janela never-shown pode vir em
    //    branco). skipTaskbar evita aparecer na barra de tarefas.
    win = new BrowserWindow({
      x: -4000,
      y: -4000,
      width,
      height,
      show: true,
      skipTaskbar: true,
      webPreferences: { backgroundThrottling: false },
    })
    const wc = win.webContents

    wc.on('console-message', (...args: unknown[]) => pushMsg(formatConsole(args)))
    wc.on('did-fail-load', (_e, code, desc, url) =>
      pushMsg(`[load-fail] ${code} ${desc} ${url}`),
    )
    wc.on('render-process-gone', (_e, details) =>
      pushMsg(`[render-gone] ${JSON.stringify(details)}`),
    )

    // loadURL rejeita em falha de load; não deixamos isso abortar a captura —
    // ainda assim tentamos screenshotar (pode ter renderizado parcialmente).
    await wc.loadURL(viteUrl).catch((e: unknown) => pushMsg(`[loadURL] ${String(e)}`))

    // Foco pra o sendInputEvent chegar no elemento certo (InputManager escuta
    // document.body). A janela está fora da tela mas recebe input injetado.
    win.focus()
    wc.focus()

    // 3) Espera o init assíncrono (WebGPU) + assets + alguns frames.
    await delay(waitMs)

    // 4) Executa o input (se houver). Os keydown/keyup chegam ao InputManager.
    await runActions(wc, actions, screenshots)

    // 5) Se nenhuma ação pediu screenshot, captura uma no fim (comportamento
    //    padrão: sempre devolver ao menos uma imagem).
    if (screenshots.length === 0) {
      const image = await wc.capturePage()
      screenshots.push(image.toPNG())
    }

    const playedNote = actions.length > 0 ? ` Executadas ${actions.length} ação(ões) de input.` : ''
    return {
      screenshots,
      consoleMessages: messages,
      ok: true,
      note: `Jogo carregado em ${viteUrl} e capturado (${width}x${height}).${playedNote}`,
      viteUrl,
    }
  } catch (err) {
    return {
      screenshots,
      consoleMessages: messages,
      ok: false,
      note: err instanceof Error ? err.message : String(err),
      viteUrl: null,
    }
  } finally {
    // 6) Teardown — sempre derruba a janela e o vite.
    if (win && !win.isDestroyed()) win.destroy()
    if (vite) killTree(vite)
  }
}
