// Preview NATIVO (SPEC-0201 / M2 do PRD-0007): roda o host do jogo como janela
// FILHA da janela do Studio, no lugar do iframe.
//
// Divisão de trabalho: o Electron só spawna o processo e manda a geometria do
// painel; quem se posiciona é o HOST (shim `__cortexSetWindowBounds`, via canal
// da IDE). Assim a IDE não precisa de FFI nem de addon nativo para chamar
// SetWindowPos — ver SPEC-0200 para o canal e SPEC-0201 para o embed.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Prefixo das linhas do canal no stdout do host (native/src/shims/ide_channel.h). */
const IDE_PREFIX = '@cortex-ide@'

/** Executável que o export gera na raiz. */
const HOST_EXE = 'launcher.exe'

/** Mensagem trafegada no canal (o mesmo contrato da ponte do editor). */
export interface IdeMessage {
  type: string
  [key: string]: unknown
}

/** O que o chamador precisa fornecer para subir o preview. */
export interface NativePreviewOptions {
  /** Pasta do export do jogo (a que tem `launcher.exe`). */
  exportDir: string
  /** HWND da janela do Studio, como inteiro — vira o pai da janela do host. */
  parentHwnd: bigint
  /** Linha de log do host (stdout/stderr que NÃO é do canal). */
  onLog?: (line: string) => void
  /** Mensagem do canal (já parseada). */
  onMessage?: (message: IdeMessage) => void
  /** Processo terminou (código de saída, `null` se morto por sinal). */
  onExit?: (code: number | null) => void
  /**
   * Query de boot do jogo (`level=space-1`), como o `?level=` do iframe. Trocar
   * de fase no preview nativo é reiniciar o host com outra query — é o mesmo
   * caminho de boot que o jogo já suporta (SPEC-0205).
   */
  launchQuery?: string
}

/**
 * Uma sessão de preview nativo. Um por Studio: `start` derruba a anterior.
 */
export class NativePreview {
  private _child: ChildProcess | null = null
  private _buffer = ''
  /** Última geometria pedida — reenviada quando o host confirma o handshake. */
  private _bounds: { x: number; y: number; width: number; height: number } | null = null

  /** Há um host rodando? */
  get running(): boolean {
    return this._child !== null && this._child.exitCode === null
  }

  /**
   * Sobe o host embutido. Lança se a pasta não tiver um export (é erro de uso,
   * e falhar calado deixaria o painel preto sem explicação).
   */
  start(options: NativePreviewOptions): void {
    const exe = join(options.exportDir, HOST_EXE)
    if (!existsSync(exe)) {
      throw new Error(`export sem ${HOST_EXE}: ${options.exportDir}`)
    }
    this.stop()

    const child = spawn(exe, [], {
      cwd: options.exportDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CORTEX_IDE_CHANNEL: '1',
        CORTEX_PARENT_HWND: options.parentHwnd.toString(),
        CORTEX_NO_SPLASH: '1',
        ...(options.launchQuery ? { CORTEX_LAUNCH_QUERY: options.launchQuery } : {}),
      },
    })
    this._child = child
    this._lastOptions = options

    child.stdout?.on('data', (chunk: Buffer) => this._readStdout(chunk, options))
    child.stderr?.on('data', (chunk: Buffer) => options.onLog?.(chunk.toString()))
    child.on('exit', (code) => {
      this._child = null
      options.onExit?.(code)
    })
  }

  /**
   * Manda a geometria do painel (coordenadas relativas à janela do Studio).
   * Guardada para reenvio: o host só passa a aceitar depois do boot do JS, e o
   * painel pode ter sido medido antes disso.
   */
  setBounds(x: number, y: number, width: number, height: number): void {
    this._bounds = { x, y, width, height }
    this.send({ type: 'bounds', x, y, width, height })
  }

  /** Envia uma mensagem pelo canal. No-op sem host rodando. */
  send(message: IdeMessage): void {
    if (!this._child?.stdin?.writable) return
    this._child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  /**
   * Reinicia o host numa fase (ou na mesma, sem argumento). É a troca de fase do
   * preview nativo: o iframe recarregava com `?level=`, aqui o processo sobe de
   * novo com a query — mesmo caminho de boot, sem inventar um comando novo.
   */
  restart(launchQuery?: string): void {
    const previous = this._lastOptions
    if (!previous) return
    this.start({ ...previous, launchQuery: launchQuery ?? previous.launchQuery })
  }

  /** Opções do último `start` — base do {@link restart}. */
  private _lastOptions: NativePreviewOptions | null = null

  /** Encerra o host. Idempotente — e é o que evita janela órfã no Stop. */
  stop(): void {
    const child = this._child
    this._child = null
    this._buffer = ''
    if (!child || child.exitCode !== null) return
    child.kill()
  }

  /** Separa as linhas do canal dos logs comuns do host. */
  private _readStdout(chunk: Buffer, options: NativePreviewOptions): void {
    this._buffer += chunk.toString()
    const lines = this._buffer.split('\n')
    this._buffer = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith(IDE_PREFIX)) {
        if (line) options.onLog?.(line)
        continue
      }
      let message: IdeMessage
      try {
        message = JSON.parse(line.slice(IDE_PREFIX.length)) as IdeMessage
      } catch {
        continue // linha truncada/ruído: ignora, não derruba o preview
      }
      // O `ack` é o sinal de que o JS do host já está de pé: só aí a geometria
      // medida antes do boot tem a quem chegar.
      if (message.type === 'ack' && this._bounds) {
        const { x, y, width, height } = this._bounds
        this.send({ type: 'bounds', x, y, width, height })
      }
      options.onMessage?.(message)
    }
  }
}
