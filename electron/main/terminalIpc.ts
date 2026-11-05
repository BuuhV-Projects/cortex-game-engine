/**
 * Terminal embutido — roda um comando one-shot no projeto (ADR-0012).
 * stdout/stderr vão para o canal 'terminal:output'; conclusão via
 * 'terminal:done' com { code }. SPEC-0693.
 */
import { ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { envForSpawn, sendToRenderer, validatePath } from './shared.js'
import { killProcessTree } from './projectRunner.js'

// Processo do terminal embutido (independente do Play — permite rodar
// `yarn install` enquanto o Play continua ativo). ADR-0012.
let terminalProcess: ChildProcess | null = null

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:run', async (_event, projectDir: unknown, command: unknown) => {
    // Erros síncronos (validação) viram rejeição da Promise; o renderer já pega
    // no catch e libera o input. Para erros assíncronos (spawn error, cwd
    // inválido) garantimos que 'terminal:done' SEMPRE dispara — sem isso o
    // input do terminal trava esperando um done que nunca chega.
    const safeDir = validatePath(projectDir)
    if (typeof command !== 'string' || command.trim() === '') {
      throw new Error('command deve ser uma string não vazia')
    }

    if (terminalProcess) {
      killProcessTree(terminalProcess)
      terminalProcess = null
    }

    let done = false
    const emitDone = (code: number): void => {
      if (done) return
      done = true
      terminalProcess = null
      sendToRenderer('terminal:done', { code })
    }

    const child = spawn(command, [], {
      cwd: safeDir,
      shell: true,
      env: envForSpawn(safeDir),
    })

    terminalProcess = child

    const forwardOutput = (data: Buffer): void => {
      sendToRenderer('terminal:output', data.toString())
    }

    child.stdout?.on('data', forwardOutput)
    child.stderr?.on('data', forwardOutput)

    child.on('close', (code) => emitDone(code ?? -1))
    child.on('error', (err) => {
      sendToRenderer('terminal:output', `\nErro: ${err.message}\n`)
      emitDone(-1)
    })
  })

  // Mata o comando do terminal em execução, se houver
  ipcMain.handle('terminal:stop', async () => {
    if (terminalProcess) {
      killProcessTree(terminalProcess)
      terminalProcess = null
      sendToRenderer('terminal:done', { code: -1 })
    }
  })
}

/** `before-quit`: mata o comando do terminal à força. */
export function killTerminalForQuit(): void {
  if (terminalProcess?.pid) {
    try {
      killProcessTree(terminalProcess, 'SIGKILL')
    } catch {
      /* best-effort no shutdown */
    }
  }
  terminalProcess = null
}
