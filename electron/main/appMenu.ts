/**
 * Menu nativo da aplicação (localizado, ADR-0025). SPEC-0693.
 */
import { app, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { getCurrentProjectDir, sendToRenderer } from './shared.js'

/**
 * Strings do menu nativo localizadas. Carregadas no boot via `prefs:get`
 * e usadas em `buildAppMenu()`. Quando o usuário troca de idioma no
 * renderer, ele dispara `menu:rebuild` via IPC e o menu é reconstruído.
 */
const MENU_STRINGS = {
  en: {
    project: 'Project',
    close_project: 'Close project',
    generate_installer: 'Generate installer...',
    generate_installer_debug: 'Generate installer (debug)...',
    language: 'Language',
  },
  pt: {
    project: 'Projeto',
    close_project: 'Fechar projeto',
    generate_installer: 'Gerar instalador...',
    generate_installer_debug: 'Gerar instalador (debug)...',
    language: 'Idioma',
  },
} as const

export type MenuLocale = 'en' | 'pt'

let currentMenuLocale: MenuLocale = 'en'

/** Define o idioma do menu (sem reconstruí-lo). */
export function setMenuLocale(locale: MenuLocale): void {
  currentMenuLocale = locale
}

/**
 * Monta o Menu principal.
 *
 * - Em **release** (`app.isPackaged === true`) só fica visível o submenu
 *   "Project" (Generate installer + Language). Os defaults do Electron
 *   (File/Edit/View/Window) somem — não fazem sentido pro usuário final
 *   da IDE final e "vazam" comportamento de browser (Reload, DevTools).
 * - Em **dev** (`yarn electron:dev`), os defaults voltam — DevTools,
 *   Reload e Cut/Copy/Paste continuam acessíveis pra debug.
 * - macOS sempre mantém o `appMenu` (com Quit/About) porque sem ele o
 *   Cmd+Q não funciona.
 */
export function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const s = MENU_STRINGS[currentMenuLocale]

  const projectMenu: MenuItemConstructorOptions = {
    label: s.project,
    submenu: [
      {
        label: s.close_project,
        click: (): void => {
          sendToRenderer('menu:close-project')
        },
      },
      { type: 'separator' },
      {
        label: s.generate_installer,
        accelerator: isMac ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
        click: (): void => {
          sendToRenderer('menu:build-installer', { debug: false })
        },
      },
      {
        label: s.generate_installer_debug,
        accelerator: isMac ? 'Cmd+Shift+D' : 'Ctrl+Shift+D',
        click: (): void => {
          sendToRenderer('menu:build-installer', { debug: true })
        },
      },
      { type: 'separator' },
      {
        label: s.language,
        submenu: [
          {
            label: 'English',
            type: 'radio',
            checked: currentMenuLocale === 'en',
            click: (): void => {
              sendToRenderer('menu:change-locale', 'en')
            },
          },
          {
            label: 'Português',
            type: 'radio',
            checked: currentMenuLocale === 'pt',
            click: (): void => {
              sendToRenderer('menu:change-locale', 'pt')
            },
          },
        ],
      },
    ],
  }

  // O menu "Projeto" só aparece com um projeto aberto (na tela inicial não há o que fazer).
  const projectMenus = getCurrentProjectDir() ? [projectMenu] : []
  const template: MenuItemConstructorOptions[] = app.isPackaged
    ? [...(isMac ? [{ role: 'appMenu' as const }] : []), ...projectMenus]
    : [
        ...(isMac ? [{ role: 'appMenu' as const }] : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        ...projectMenus,
        { role: 'windowMenu' },
      ]

  return Menu.buildFromTemplate(template)
}

export function registerMenuIpc(): void {
  // Renderer chama isso quando o usuário troca de idioma no Welcome ou
  // nas configurações — assim o menu nativo acompanha sem reload.
  ipcMain.handle('menu:rebuild', async (_event, locale: unknown) => {
    if (locale === 'en' || locale === 'pt') {
      currentMenuLocale = locale
      Menu.setApplicationMenu(buildAppMenu())
    }
  })
}
