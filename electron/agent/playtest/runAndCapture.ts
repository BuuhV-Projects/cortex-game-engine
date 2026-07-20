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

/**
 * Câmera de inspeção (ADR-0131): posiciona a câmera livre pra "ver" a cena de
 * qualquer ângulo, independente da câmera de gameplay (que segue o player). Se
 * `pos` for dado, usa pose explícita; senão orbita (`orbit`); sem nenhum, enquadra
 * a cena inteira. Aplicada após o boot, antes das `actions`.
 */
export interface InspectCameraOption {
  /** Órbita ao redor de um alvo (ângulos em GRAUS). Ignorado se `pos` vier. */
  orbit?: { yaw?: number; pitch?: number; dist?: number; target?: [number, number, number] }
  /** Pose explícita: posição de mundo `[x,y,z]`. */
  pos?: [number, number, number]
  /** Ponto observado da pose explícita (default origem). */
  lookAt?: [number, number, number]
  /** Field of view (graus). */
  fov?: number
}

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
   * Espera DETERMINÍSTICA por boot: expressão JS avaliada na página a cada
   * 500ms até virar truthy (ex.: `window.__bootStage === 'pronto'`), em vez do
   * `waitMs` cego. Roda ANTES do `waitMs` (que vira só o settle de frames).
   * No timeout, o diagnóstico (último valor + recursos de rede pendentes) vai
   * pras mensagens de console e a captura segue mesmo assim.
   */
  waitFor?: string
  /** Timeout da espera `waitFor`. Default 60000ms. */
  waitForTimeoutMs?: number
  /**
   * JS arbitrário executado após o boot (waitFor/waitMs), ANTES das actions —
   * ex.: teleportar o player pra um checkpoint ou ligar câmera overview antes
   * da foto. O valor retornado vai pras mensagens de console (`[eval] …`).
   */
  evalJs?: string
  /**
   * Câmera de inspeção (ADR-0131): posiciona a câmera livre pra ver a cena de
   * qualquer ângulo. Aplicada após o boot/`evalJs`, antes das `actions`.
   */
  camera?: InspectCameraOption
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

/**
 * Faz polling de `probe` até retornar truthy ou estourar `timeoutMs`.
 * Exceções do probe contam como falsy (a página pode ainda não ter o global).
 * Devolve `{ ok, lastValue, elapsedMs }` — puro sobre as dependências
 * injetadas, testável sem Electron.
 */
export async function pollUntilTruthy(
  probe: () => Promise<unknown>,
  timeoutMs: number,
  intervalMs = 500,
  sleep: (ms: number) => Promise<void> = delay,
  now: () => number = Date.now,
): Promise<{ ok: boolean; lastValue: unknown; elapsedMs: number }> {
  const t0 = now()
  let lastValue: unknown
  for (;;) {
    try {
      lastValue = await probe()
      if (lastValue) return { ok: true, lastValue, elapsedMs: now() - t0 }
    } catch (err) {
      lastValue = `(exceção: ${err instanceof Error ? err.message : String(err)})`
    }
    if (now() - t0 >= timeoutMs) return { ok: false, lastValue, elapsedMs: now() - t0 }
    await sleep(intervalMs)
  }
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

/**
 * Aplica a câmera de inspeção na página via `window.__cortexInspect` (exposto pelo
 * bundle de dev). Monta a expressão a partir das opções e devolve a nota que a
 * página retornar (`ok`, `sem-inspect`, …) pras mensagens de console. Os valores
 * vão serializados como JSON — sem interpolação de string arbitrária.
 */
async function applyInspectCamera(wc: WebContents, cam: InspectCameraOption): Promise<string> {
  const calls: string[] = []
  if (typeof cam.fov === 'number') calls.push(`api.setFov(${JSON.stringify(cam.fov)})`)
  if (cam.pos) {
    const lookAt = cam.lookAt ? JSON.stringify(cam.lookAt) : 'undefined'
    calls.push(`api.pose(${JSON.stringify(cam.pos)}, ${lookAt})`)
  } else if (cam.orbit) {
    calls.push(`api.orbit(${JSON.stringify(cam.orbit)})`)
  } else {
    calls.push('api.frame()')
  }
  const js =
    `(() => { const api = window.__cortexInspect;` +
    ` if (!api) return 'sem-inspect (bundle de dev não carregado?)';` +
    ` ${calls.join('; ')}; return 'ok'; })()`
  const value = await wc.executeJavaScript(js, true)
  return String(value)
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
    // `?play`: o jogo boota em modo EDIÇÃO por padrão (estilo Unity); a IA precisa
    // rodar a GAMEPLAY, então força o modo jogo via query param.
    const playUrl = viteUrl + (viteUrl.includes('?') ? '&' : '?') + 'play=1'
    await wc.loadURL(playUrl).catch((e: unknown) => pushMsg(`[loadURL] ${String(e)}`))

    // Foco pra o sendInputEvent chegar no elemento certo (InputManager escuta
    // document.body). A janela está fora da tela mas recebe input injetado.
    win.focus()
    wc.focus()

    // 3a) Espera determinística (opcional): polling da expressão `waitFor` até
    //     truthy. No timeout, coleta diagnóstico (último valor + recursos de
    //     rede pendentes) e SEGUE pra captura — a foto parcial + console ainda
    //     ajudam o modelo a diagnosticar o boot travado.
    let bootNote = ''
    if (opts.waitFor) {
      const timeoutMs = opts.waitForTimeoutMs ?? 60000
      const probe = (): Promise<unknown> => wc.executeJavaScript(opts.waitFor!, true)
      const poll = await pollUntilTruthy(probe, timeoutMs)
      if (poll.ok) {
        bootNote = ` waitFor OK em ${(poll.elapsedMs / 1000).toFixed(1)}s.`
      } else {
        bootNote = ` ⚠️ waitFor NÃO virou truthy em ${timeoutMs}ms (último valor: ${JSON.stringify(poll.lastValue)}).`
        const pendingExpr =
          `performance.getEntriesByType('resource').slice(-8)` +
          `.map(r => r.name.split('/').pop() + (r.responseEnd ? '' : ' [PENDENTE]')).join(', ')`
        const pending = await wc.executeJavaScript(pendingExpr, true).catch(() => '(indisponível)')
        pushMsg(`[waitFor-timeout] últimos recursos de rede: ${String(pending)}`)
      }
    }

    // 3b) Espera o init assíncrono (WebGPU) + assets + alguns frames.
    await delay(waitMs)

    // 3c) Eval pós-boot (opcional): teleporte pra checkpoint, câmera overview,
    //     disparo de evento — qualquer setup antes do input/foto.
    if (opts.evalJs) {
      try {
        const value: unknown = await wc.executeJavaScript(opts.evalJs, true)
        if (value !== undefined) pushMsg(`[eval] ${JSON.stringify(value)}`)
      } catch (err) {
        pushMsg(`[eval-error] ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 3d) Câmera de inspeção (opcional): posiciona a câmera livre pra ver a cena
    //     de qualquer ângulo (via `window.__cortexInspect`, exposto pelo bundle de
    //     dev). Fica ATIVA pelo resto do playtest — todas as fotos saem por ela, com
    //     a gameplay seguindo. `?play` do playtest carrega o bundle de dev, então a
    //     API existe mesmo em modo jogo.
    if (opts.camera) {
      const note = await applyInspectCamera(wc, opts.camera).catch(
        (e: unknown) => `erro: ${e instanceof Error ? e.message : String(e)}`,
      )
      pushMsg(`[camera] ${note}`)
    }

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
      note: `Jogo carregado em ${viteUrl} e capturado (${width}x${height}).${bootNote}${playedNote}`,
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
