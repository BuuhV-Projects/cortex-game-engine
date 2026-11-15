/**
 * Projeto ativo do Studio (`project:setActive`, SPEC-0693): guarda a pasta aberta, instala em segundo
 * plano os pacotes declarados no `cortex.json` e reconstrói o menu "Projeto". Era parte do IPC do Chat IA
 * até o ADR-0736.
 */
import { ipcMain, Menu } from 'electron'
import { syncOnOpen } from '../packages/ipc.js'
import { setCurrentProjectDir, validatePath } from './shared.js'
import { packageCacheDir } from './projectConfigIpc.js'
import { buildAppMenu } from './appMenu.js'

export function registerProjectIpc(): void {
  ipcMain.handle('project:setActive', async (event, projectDir: unknown) => {
    if (projectDir === null || projectDir === undefined) {
      setCurrentProjectDir(null)
    } else {
      const dir = validatePath(projectDir)
      setCurrentProjectDir(dir)
      // Pacote declarado no cortex.json e ainda não instalado → instala em segundo plano.
      void syncOnOpen(event.sender, dir, packageCacheDir()).catch(() => {})
    }
    // O menu "Projeto" só faz sentido com projeto aberto — reconstrói pra mostrar/ocultar.
    Menu.setApplicationMenu(buildAppMenu())
  })
}
