import { spawn, type ChildProcess } from 'node:child_process'
import { BrowserWindow } from 'electron'

/**
 * Sobe o `vite` do projeto, carrega o jogo numa BrowserWindow oculta (fora da
 * tela) do próprio Electron, captura um screenshot e coleta erros de console —
 * tudo no main process. Usado pela tool `playtest_game` do Chat IA pra "ver" o
 * jogo rodando e validar a própria implementação (ADR-0033).
 *
 * Roda no Electron (não Playwright) de propósito: o engine é WebGPU-only
 * (ADR-0032) e o Chromium do Electron renderiza WebGPU igual ao preview.
 */

// Vite imprime "Local:   http://localhost:NNNN/" com códigos ANSI de cor.
const ANSI_RE = /\x1b\[[0-9;]*m/g
const VITE_LOCAL_URL_RE = /Local:\s+(https?:\/\/[^\s]+)/

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
}

export interface PlaytestResult {
  /** PNG do screenshot, ou null se falhou antes de capturar. */
  pngBuffer: Buffer | null
  /** Mensagens de console do jogo (erros/warns/logs), capadas. */
  consoleMessages: string[]
  ok: boolean
  /** Nota humana (sucesso ou causa da falha). */
  note: string
  viteUrl: string | null
}

const MAX_MESSAGES = 60

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

export async function runAndCaptureGame(
  projectRoot: string,
  opts: PlaytestOptions = {},
): Promise<PlaytestResult> {
  const width = opts.width ?? 1280
  const height = opts.height ?? 720
  const waitMs = opts.waitMs ?? 3000
  const port = opts.port ?? 5180
  const urlTimeoutMs = opts.urlTimeoutMs ?? 30000

  const messages: string[] = []
  const pushMsg = (m: string): void => {
    if (messages.length < MAX_MESSAGES) messages.push(m)
  }

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

    // 3) Espera o init assíncrono (WebGPU) + assets + alguns frames.
    await delay(waitMs)

    // 4) Captura.
    const image = await wc.capturePage()
    const pngBuffer = image.toPNG()

    return {
      pngBuffer,
      consoleMessages: messages,
      ok: true,
      note: `Jogo carregado em ${viteUrl} e capturado (${width}x${height}).`,
      viteUrl,
    }
  } catch (err) {
    return {
      pngBuffer: null,
      consoleMessages: messages,
      ok: false,
      note: err instanceof Error ? err.message : String(err),
      viteUrl: null,
    }
  } finally {
    // 5) Teardown — sempre derruba a janela e o vite.
    if (win && !win.isDestroyed()) win.destroy()
    if (vite) killTree(vite)
  }
}
