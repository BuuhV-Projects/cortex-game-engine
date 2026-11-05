/**
 * Handlers IPC — character-auto-rig (SPEC-0349): roda o `prepare-character.sh`
 * do jogo depois que o painel salva os marcadores. SPEC-0693.
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { envForSpawn, validatePath } from './shared.js'
import { killProcessTree } from './projectRunner.js'

/** Processo do auto-rig em andamento (um por vez, separado do terminal). */
let characterRigProcess: ChildProcess | null = null

/** Config aceita em `--config`: só `tools/characters/<nome>.json` (sem subir de pasta). */
const CHARACTER_CONFIG_REL = /^tools\/characters\/[A-Za-z0-9._-]+\.json$/

// Ação do painel → flag do script (lista fechada: nada do renderer vira argumento livre).
const CHARACTER_RIG_FLAGS: Record<string, string[]> = { generate: [], approve: ['--approve'], revert: ['--revert'] }

/**
 * `bash` que roda o script. No Windows é o do **Git**: o `bash.exe` do System32
 * é o WSL, que não enxerga `D:/…` do mesmo jeito. Procura nas instalações
 * comuns e ao lado do `git` do PATH; `null` = sem Git Bash.
 */
function resolveScriptBash(): string | null {
  if (process.platform !== 'win32') return 'bash'
  const env = process.env
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs') : undefined]
  const candidates = roots.filter((r): r is string => !!r).map((r) => join(r, 'Git', 'bin', 'bash.exe'))
  try {
    const where = spawnSync('where', ['git'], { encoding: 'utf-8', windowsHide: true })
    for (const line of (where.stdout ?? '').split(/\r?\n/)) {
      const gitExe = line.trim()
      // <git>/cmd/git.exe ou <git>/bin/git.exe → <git>/bin/bash.exe
      if (gitExe) candidates.push(join(gitExe, '..', '..', 'bin', 'bash.exe'))
    }
  } catch {
    /* sem `where`/git no PATH: fica com as instalações comuns */
  }
  return candidates.find((c) => existsSync(c)) ?? null
}

export function registerCharacterRigIpc(): void {
  /**
   * Roda `bash tools/prepare-character.sh --config <configRel>` com cwd = projeto.
   * A saída vai por `characterRig:output`; resolve com `{ code }` (código de
   * saída do script; 2 = infraestrutura, inclusive sem bash/script).
   */
  ipcMain.handle('characterRig:run', async (event, projectDir: unknown, configRel: unknown, action: unknown = 'generate') => {
    const safeDir = validatePath(projectDir)
    if (typeof configRel !== 'string' || !CHARACTER_CONFIG_REL.test(configRel)) {
      throw new Error('configRel deve ser tools/characters/<nome>.json')
    }
    if (typeof action !== 'string' || !Object.hasOwn(CHARACTER_RIG_FLAGS, action)) {
      throw new Error('action deve ser generate, approve ou revert')
    }
    const send = (text: string): void => {
      if (!event.sender.isDestroyed()) event.sender.send('characterRig:output', text)
    }
    if (!existsSync(join(safeDir, 'tools', 'prepare-character.sh'))) {
      send('tools/prepare-character.sh não existe neste projeto.\n')
      return { code: 2 }
    }
    const bash = resolveScriptBash()
    if (!bash) {
      send('Git Bash não encontrado (Program Files\\Git\\bin\\bash.exe). Instale o Git for Windows.\n')
      return { code: 2 }
    }
    if (characterRigProcess) {
      killProcessTree(characterRigProcess)
      characterRigProcess = null
    }
    return await new Promise<{ code: number }>((resolvePromise) => {
      const child = spawn(bash, ['tools/prepare-character.sh', '--config', configRel, ...CHARACTER_RIG_FLAGS[action]], {
        cwd: safeDir,
        env: envForSpawn(safeDir),
        windowsHide: true,
      })
      characterRigProcess = child
      const forward = (d: Buffer): void => send(d.toString())
      child.stdout?.on('data', forward)
      child.stderr?.on('data', forward)
      let settled = false
      const finish = (code: number): void => {
        if (settled) return
        settled = true
        if (characterRigProcess === child) characterRigProcess = null
        resolvePromise({ code })
      }
      // Morto pelo Parar (sinal/taskkill) = sem código → trata como infraestrutura.
      child.on('close', (code) => finish(code ?? 2))
      child.on('error', (err) => {
        send(`\nErro: ${err.message}\n`)
        finish(2)
      })
    })
  })

  /** Mata o auto-rig em andamento (botão Parar / painel fechado). */
  ipcMain.handle('characterRig:stop', () => {
    if (!characterRigProcess) return
    killProcessTree(characterRigProcess)
    characterRigProcess = null
  })
}

/** `before-quit`: mata o auto-rig à força. */
export function killCharacterRigForQuit(): void {
  if (characterRigProcess?.pid) {
    try {
      killProcessTree(characterRigProcess, 'SIGKILL')
    } catch {
      /* best-effort no shutdown */
    }
  }
  characterRigProcess = null
}
