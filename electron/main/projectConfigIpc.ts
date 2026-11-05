/**
 * Handlers IPC — identidade do jogo no cortex.json (ADR-0126), ícone do jogo e
 * pacotes de textura (ADR-0640). SPEC-0693.
 */
import { app, dialog, ipcMain } from 'electron'
import { join, basename } from 'path'
import { readFile, writeFile, cp, mkdir } from 'fs/promises'
import { registerPackageIpc, defaultPackageCacheDir } from '../packages/ipc.js'
import { getMainWindow, validatePath } from './shared.js'

const asTrimmed = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

/**
 * Tira o BOM (U+FEFF) do início. Um `cortex.json` salvo por editor do Windows
 * começa com ele e `JSON.parse` lança — o que aqui viraria "config perdida em
 * silêncio", já que o catch cai no fallback do slug. Espelha o mesmo tratamento
 * em `native/scripts/game-config.mjs`.
 */
const stripBom = (text: string): string => text.replace(/^﻿/, '')

/**
 * App id da Steam normalizado (ADR-0174) — número positivo ou `null`. Espelha o
 * `steamAppIdOf` de `native/scripts/game-config.mjs`: aceita `480` e `"480"`,
 * porque o campo é digitado por humano e o id entre aspas é o erro provável.
 */
const asSteamAppId = (v: unknown): number | null => {
  const text = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  // 0 é o sentinela de "não declarado" no host — nunca é um id válido.
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/** Lê o cortex.json do projeto (objeto vazio se ausente/inválido). */
async function readCortexJson(dir: string): Promise<Record<string, unknown>> {
  try {
    const raw = JSON.parse(stripBom(await readFile(join(dir, 'cortex.json'), 'utf-8')))
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  } catch {
    // sem cortex.json / inválido — resolve pelo slug
  }
  return {}
}

/** Cache dos pacotes de textura (ADR-0640 / SPEC-0641). */
export const packageCacheDir = (): string =>
  defaultPackageCacheDir(process.env.LOCALAPPDATA ?? app.getPath('userData'))

export function registerProjectConfigIpc(): void {
  /**
   * Lê e RESOLVE a identidade do jogo (Configurações do jogo no Studio). Espelha
   * `native/scripts/game-config.mjs`: `id` (slug estável, chave de saves) e `name`
   * (exibição) caem no nome da pasta quando ausentes — compat com projetos antigos
   * que só têm `{ engine }`.
   */
  ipcMain.handle('project:readConfig', async (_event, projectDir: unknown) => {
    const dir = validatePath(projectDir)
    const cfg = await readCortexJson(dir)
    const slug = basename(dir)
    const id = asTrimmed(cfg.id) ?? slug
    const name = asTrimmed(cfg.name) ?? id
    return {
      engine: 'cortex-game-engine',
      ...cfg,
      id,
      name,
      icon: asTrimmed(cfg.icon) ?? null,
      steamAppId: asSteamAppId(cfg.steamAppId),
    }
  })

  /**
   * Grava a identidade editável (name/icon/steamAppId) preservando o resto do
   * cortex.json. `id` e `engine` NÃO são editáveis por aqui — `id` é estável
   * (saves) e mexer nele órfãos os saves. `name` vazio volta pro `id`;
   * `steamAppId` vazio/ inválido REMOVE o campo (jogo que não vai pra Steam).
   */
  ipcMain.handle('project:writeConfig', async (_event, projectDir: unknown, patch: unknown) => {
    const dir = validatePath(projectDir)
    const p = (patch ?? {}) as { name?: unknown; icon?: unknown; steamAppId?: unknown }
    // recria do zero se o arquivo sumiu/corrompeu
    const cfg = await readCortexJson(dir)
    const slug = basename(dir)
    const id = asTrimmed(cfg.id) ?? slug
    const next: Record<string, unknown> = {
      engine: 'cortex-game-engine',
      ...cfg,
      id,
      name: asTrimmed(p.name) ?? id,
    }
    const icon = asTrimmed(p.icon)
    if (icon) next.icon = icon
    else delete next.icon
    // Gravado como NÚMERO (não string): é o que o host lê no runtime e o que o
    // export propaga pro cortex.json do build.
    const steamAppId = asSteamAppId(p.steamAppId)
    if (steamAppId !== null) next.steamAppId = steamAppId
    else delete next.steamAppId
    await writeFile(join(dir, 'cortex.json'), JSON.stringify(next, null, 2) + '\n', 'utf-8')
    return { ok: true, id, name: next.name, icon: icon ?? null, steamAppId }
  })

  // Pacotes de textura (ADR-0640 / SPEC-0641): instalar/listar/remover em assets/packages/.
  registerPackageIpc(ipcMain, { validatePath, cacheDir: packageCacheDir })

  /** Diálogo pra escolher um PNG (ícone do jogo). Retorna o caminho ou null. */
  ipcMain.handle('dialog:openImage', async () => {
    const opts = {
      properties: ['openFile' as const],
      filters: [{ name: 'PNG', extensions: ['png'] }],
    }
    const win = getMainWindow()
    const result = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  /**
   * Importa o PNG escolhido pra DENTRO do projeto (`branding/icon.png`) e devolve
   * o caminho relativo — o `icon` do cortex.json fica relativo ao projeto (não um
   * caminho absoluto que quebra se o projeto mudar de lugar). O export lê daí.
   */
  ipcMain.handle('project:importIcon', async (_event, projectDir: unknown, sourcePath: unknown) => {
    const dir = validatePath(projectDir)
    const src = validatePath(sourcePath)
    const rel = join('branding', 'icon.png')
    const dest = join(dir, rel)
    await mkdir(join(dir, 'branding'), { recursive: true })
    await cp(src, dest)
    return { icon: rel.replace(/\\/g, '/') }
  })
}
