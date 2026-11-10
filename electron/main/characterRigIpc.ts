/**
 * Handlers IPC — character-auto-rig (SPEC-0349): roda o `prepare-character.sh`
 * do jogo depois que o painel salva os marcadores. SPEC-0693. Sem o script, a
 * config com `work` e `skinned.publish` usa o pipeline do Studio (SPEC-0724).
 */
import { app, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { envForSpawn, getMainWindow, validatePath } from './shared.js'
import { killProcessTree } from './projectRunner.js'
import { writeBakePair } from './characterRigBakeWrite.js'
import { loadPreferences, savePreferences } from './prefsDialogsIpc.js'
import { runAutoRig, trackChild, type AutoRigAction } from './autoRig/autoRigRunner.js'
import { locateBlender, type BlenderLocation } from './autoRig/blenderLocate.js'

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

/** `native/scripts/autorig` do Studio (no app empacotado, em `resources/`, pelo `extraResources`). */
function autoRigScriptsDir(): string {
  const appPath = app.getAppPath()
  const base = appPath.endsWith('.asar') ? process.resourcesPath : appPath
  return join(base, 'native', 'scripts', 'autorig')
}

function listDirs(path: string): string[] {
  try {
    return readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory())
  } catch {
    return []
  }
}

/** O Blender do auto-rig: preferência do Studio, `BLENDER_PATH`, instalações comuns (SPEC-0724). */
async function currentBlender(): Promise<BlenderLocation | null> {
  const prefs = await loadPreferences()
  return locateBlender({ preference: prefs.blenderPath, env: process.env, platform: process.platform, exists: existsSync, listDirs })
}

/** Pipeline do Studio: roda a ação e resolve com o código de saída (SPEC-0724). */
async function runBuiltin(projectDir: string, configRel: string, action: AutoRigAction, send: (text: string) => void): Promise<{ code: number }> {
  const blender = await currentBlender()
  const code = await runAutoRig({
    projectDir,
    configRel,
    action,
    blender: blender?.path ?? null,
    scriptsDir: autoRigScriptsDir(),
    send,
    onChild: (child, active) => {
      characterRigProcess = trackChild(characterRigProcess, child, active)
    },
  })
  return { code }
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
    if (characterRigProcess) {
      killProcessTree(characterRigProcess)
      characterRigProcess = null
    }
    // sem o script do projeto: o pipeline do Studio (config sem `work`/`skinned.publish` sai com 64, SPEC-0724)
    if (!existsSync(join(safeDir, 'tools', 'prepare-character.sh'))) return runBuiltin(safeDir, configRel, action as AutoRigAction, send)
    const bash = resolveScriptBash()
    if (!bash) {
      send('Git Bash não encontrado (Program Files\\Git\\bin\\bash.exe). Instale o Git for Windows.\n')
      return { code: 2 }
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

  /**
   * Grava o assado da aba Animações (SPEC-0704): GLB + JSON do skin juntos, com backup, só dentro do
   * projeto. Lança com a mensagem se não gravou.
   */
  ipcMain.handle('characterRig:writeBake', (_event, projectDir: unknown, glbRel: unknown, jsonRel: unknown, glbBase64: unknown, jsonText: unknown) => {
    const safeDir = validatePath(projectDir)
    if (typeof glbRel !== 'string' || typeof jsonRel !== 'string' || typeof glbBase64 !== 'string' || typeof jsonText !== 'string') {
      throw new Error('characterRig:writeBake: argumentos inválidos')
    }
    writeBakePair(safeDir, glbRel, jsonRel, Buffer.from(glbBase64, 'base64'), jsonText)
  })

  /** Blender em uso pelo auto-rig do Studio: caminho e de onde veio (`null` = não achado). */
  ipcMain.handle('characterRig:blenderInfo', async () => currentBlender())

  /** Escolhe o executável do Blender e grava na preferência do Studio; `null` se cancelou. */
  ipcMain.handle('characterRig:pickBlender', async () => {
    const win = getMainWindow()
    const opts = {
      title: 'Blender',
      properties: ['openFile' as const],
      filters: process.platform === 'win32' ? [{ name: 'Blender', extensions: ['exe'] }] : [],
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const path = res.canceled ? null : (res.filePaths[0] ?? null)
    if (!path) return null
    await savePreferences({ blenderPath: path })
    return currentBlender()
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
