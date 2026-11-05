/**
 * Handlers IPC — preferências do usuário (i18n etc — ADR-0025) e diálogos
 * nativos. SPEC-0693.
 */
import { app, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { getMainWindow } from './shared.js'

/**
 * Path do arquivo de preferências: `<userData>/preferences.json`.
 * Vive fora de qualquer projeto, é compartilhado entre execuções da IDE.
 */
function prefsPath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

export interface Preferences {
  locale?: 'en' | 'pt'
  welcomed?: boolean
}

/** Lê as preferências persistidas (objeto vazio sem arquivo/inválido). */
export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await readFile(prefsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Preferences
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function registerPrefsDialogsIpc(): void {
  ipcMain.handle('prefs:get', async (): Promise<Preferences> => loadPreferences())

  ipcMain.handle('prefs:set', async (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') return
    let current: Preferences = {}
    try {
      const raw = await readFile(prefsPath(), 'utf-8')
      current = JSON.parse(raw) as Preferences
    } catch {
      /* arquivo novo */
    }
    const next = { ...current, ...(patch as Preferences) }
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(prefsPath(), JSON.stringify(next, null, 2), 'utf-8')
    return next
  })

  // Confirmação nativa via dialog.showMessageBox. O renderer NÃO deve usar
  // window.confirm/alert: os diálogos síncronos do Chromium quebram o foco do
  // renderer no Electron (inputs param de aceitar teclado até re-focar a janela
  // — era o "input travado" após limpar o histórico do chat). Retorna true se
  // o usuário confirmar.
  ipcMain.handle('dialog:confirm', async (_event, message: unknown) => {
    if (typeof message !== 'string' || message === '') return false
    const opts = {
      type: 'question' as const,
      buttons: ['OK', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
      message,
    }
    const win = getMainWindow()
    const result = await (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
    return result.response === 0
  })

  // Aviso de erro nativo (substitui window.alert no renderer — mesmo motivo
  // do dialog:confirm acima).
  ipcMain.handle('dialog:error', (_event, title: unknown, message: unknown) => {
    if (typeof message !== 'string') return
    dialog.showErrorBox(typeof title === 'string' && title !== '' ? title : 'Erro', message)
  })

  // Aviso informativo nativo (substitui window.alert para mensagens não-erro).
  ipcMain.handle('dialog:info', async (_event, message: unknown) => {
    if (typeof message !== 'string' || message === '') return
    const opts = { type: 'info' as const, buttons: ['OK'], message }
    const win = getMainWindow()
    await (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
  })

  // Abre um diálogo nativo de seleção de pasta. Retorna o path absoluto ou null
  // se o usuário cancelar. Modal à janela principal quando ela existe.
  ipcMain.handle('dialog:openDirectory', async () => {
    const win = getMainWindow()
    const result = await (win
      ? dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : dialog.showOpenDialog({ properties: ['openDirectory'] }))
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
