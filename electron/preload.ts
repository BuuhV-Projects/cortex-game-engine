import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Sistema de arquivos
  readDir: (dirPath: string) =>
    ipcRenderer.invoke('fs:readDir', dirPath),

  watchProject: (projectDir: string) =>
    ipcRenderer.invoke('fs:watchProject', projectDir),

  revendorEngine: (projectDir: string) =>
    ipcRenderer.invoke('engine:revendor', projectDir),

  /** Export CortexNative (ADR-0101): gera dist-native/ do projeto. `debug` = HUD de métricas no bundle. */
  exportNative: (projectDir: string, mode = 'pc', debug = false, outDir?: string, editor = false) =>
    ipcRenderer.invoke('export:native', projectDir, mode, debug, outDir, editor) as Promise<{
      ok: boolean
      output: string
      distDir?: string
    }>,

  /**
   * Progresso do export (marcadores de etapa do script). Retorna uma função
   * de cancelamento — chame ao fechar o modal pra não acumular listeners
   * entre exports sucessivos.
   */
  onExportProgress: (callback: (step: string) => void): (() => void) => {
    const handler = (_event: unknown, step: string): void => callback(step)
    ipcRenderer.on('export:progress', handler)
    return () => ipcRenderer.removeListener('export:progress', handler)
  },

  // Pacotes de textura (SPEC-0641): assets/packages/<id>/ a partir do cortex.json.
  listPackages: (projectDir: string) => ipcRenderer.invoke('packages:list', projectDir),
  syncPackages: (projectDir: string) => ipcRenderer.invoke('packages:sync', projectDir),
  addPackage: (projectDir: string, id: string, version: string) =>
    ipcRenderer.invoke('packages:add', projectDir, id, version),
  removePackage: (projectDir: string, id: string) => ipcRenderer.invoke('packages:remove', projectDir, id),
  onPackagesProgress: (callback: (msg: { id: string; stage: string; error?: string }) => void): (() => void) => {
    const handler = (_event: unknown, msg: { id: string; stage: string; error?: string }): void => callback(msg)
    ipcRenderer.on('packages:progress', handler)
    return () => ipcRenderer.removeListener('packages:progress', handler)
  },

  /**
   * Auto-rig de personagem (SPEC-0349): roda `bash tools/prepare-character.sh
   * --config <configRel>` no projeto; resolve com o código de saída do script.
   */
  characterRigRun: (projectDir: string, configRel: string, action: 'generate' | 'approve' | 'revert' = 'generate') =>
    ipcRenderer.invoke('characterRig:run', projectDir, configRel, action) as Promise<{ code: number }>,

  /** Grava o assado da aba Animações no jogo: GLB (base64) + JSON do skin, com backup (SPEC-0704). */
  characterRigWriteBake: (projectDir: string, glbRel: string, jsonRel: string, glbBase64: string, jsonText: string) =>
    ipcRenderer.invoke('characterRig:writeBake', projectDir, glbRel, jsonRel, glbBase64, jsonText) as Promise<void>,

  /** Mata o auto-rig em andamento. */
  characterRigStop: () => ipcRenderer.invoke('characterRig:stop') as Promise<void>,

  /** Blender do auto-rig do Studio (SPEC-0724): caminho e origem, ou `null`. */
  characterRigBlenderInfo: () =>
    ipcRenderer.invoke('characterRig:blenderInfo') as Promise<{ path: string; source: string } | null>,

  /** Escolhe o Blender do auto-rig e grava na preferência do Studio; `null` se cancelou. */
  characterRigPickBlender: () =>
    ipcRenderer.invoke('characterRig:pickBlender') as Promise<{ path: string; source: string } | null>,

  /** Ponte local do auto-rig (SPEC-0746): comandos vindos do main e a resposta de cada um. */
  onRigRemote: (callback: (msg: { id: number; cmd: string; args: Record<string, unknown> }) => void): (() => void) => {
    const handler = (_event: unknown, msg: { id: number; cmd: string; args: Record<string, unknown> }) => callback(msg)
    ipcRenderer.on('rigRemote:command', handler)
    return () => ipcRenderer.removeListener('rigRemote:command', handler)
  },
  rigRemoteReply: (id: number, reply: { ok: boolean; result?: unknown; error?: string }) => ipcRenderer.send('rigRemote:reply', id, reply),

  /** Saída (stdout+stderr) do auto-rig. Retorna a função que remove o listener. */
  onCharacterRigOutput: (callback: (text: string) => void): (() => void) => {
    const handler = (_event: unknown, text: string): void => callback(text)
    ipcRenderer.on('characterRig:output', handler)
    return () => ipcRenderer.removeListener('characterRig:output', handler)
  },

  /** Abre uma pasta no explorador do SO (ex.: dist-native após o export). */
  openPath: (target: string) => ipcRenderer.invoke('shell:openPath', target),

  /**
   * Identidade do jogo (ADR-0126/0174): lê `cortex.json` resolvido
   * (id/name/icon + `steamAppId`, `null` se o jogo não publica na Steam).
   */
  readProjectConfig: (projectDir: string) =>
    ipcRenderer.invoke('project:readConfig', projectDir) as Promise<{
      engine: string
      id: string
      name: string
      icon: string | null
      steamAppId: number | null
    }>,

  /** Grava nome/ícone/app id da Steam no `cortex.json` (preserva `id`/`engine`). */
  writeProjectConfig: (
    projectDir: string,
    patch: { name?: string; icon?: string; steamAppId?: string },
  ) =>
    ipcRenderer.invoke('project:writeConfig', projectDir, patch) as Promise<{
      ok: boolean
      id: string
      name: string
      icon: string | null
      steamAppId: number | null
    }>,

  /** Diálogo pra escolher um PNG (ícone do jogo). Retorna o caminho ou null. */
  openImageDialog: () => ipcRenderer.invoke('dialog:openImage') as Promise<string | null>,

  /** Copia o PNG escolhido pra `branding/icon.png` do projeto; devolve o relativo. */
  importProjectIcon: (projectDir: string, sourcePath: string) =>
    ipcRenderer.invoke('project:importIcon', projectDir, sourcePath) as Promise<{ icon: string }>,

  /** `true` em dev (electron:dev); `false` no build empacotado. */
  isDev: ipcRenderer.sendSync('app:is-dev') as boolean,
  toggleDevTools: () => ipcRenderer.invoke('devtools:toggle'),

  listProjectFiles: (projectDir: string) =>
    ipcRenderer.invoke('fs:listProjectFiles', projectDir),

  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),

  readFileBase64: (filePath: string) =>
    ipcRenderer.invoke('fs:readFileBase64', filePath),

  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  createProject: (targetDir: string, name: string) =>
    ipcRenderer.invoke('fs:createProject', targetDir, name),

  createFile: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:createFile', dirPath, name),

  createDir: (dirPath: string, name: string) =>
    ipcRenderer.invoke('fs:createDir', dirPath, name),

  move: (src: string, dest: string) =>
    ipcRenderer.invoke('fs:move', src, dest),

  deletePath: (targetPath: string) =>
    ipcRenderer.invoke('fs:delete', targetPath),

  // Diálogo nativo de seleção de pasta
  selectDirectory: () =>
    ipcRenderer.invoke('dialog:openDirectory'),

  // Confirmação/erro nativos (showMessageBox/showErrorBox). Use SEMPRE estes
  // no lugar de window.confirm/alert — os diálogos síncronos do Chromium
  // quebram o foco do renderer no Electron (input para de aceitar teclado).
  confirmDialog: (message: string): Promise<boolean> =>
    ipcRenderer.invoke('dialog:confirm', message),
  errorDialog: (title: string, message: string) =>
    ipcRenderer.invoke('dialog:error', title, message),
  infoDialog: (message: string) =>
    ipcRenderer.invoke('dialog:info', message),

  // Types do engine para alimentar o Monaco
  readEngineTypes: () =>
    ipcRenderer.invoke('engine:readTypes'),

  // Execução de projeto
  runProject: (projectDir: string) =>
    ipcRenderer.invoke('run:start', projectDir),

  stopProject: () =>
    ipcRenderer.invoke('run:stop'),

  // Terminal embutido (ADR-0012)
  runTerminalCommand: (projectDir: string, command: string) =>
    ipcRenderer.invoke('terminal:run', projectDir, command),

  stopTerminalCommand: () =>
    ipcRenderer.invoke('terminal:stop'),

  // Projeto ativo no main: menu "Projeto" + pacotes do cortex.json (SPEC-0693)
  setActiveProject: (projectDir: string | null) =>
    ipcRenderer.invoke('project:setActive', projectDir),

  // Eventos do main → renderer. Cada chamada adiciona um listener ao canal;
  // múltiplos componentes (Preview, BottomPanel, etc.) podem se inscrever
  // ao mesmo evento. Os componentes só chamam onX uma vez no init, então
  // acumular listeners ao longo da sessão não é problema.
  onLog: (callback: (line: string) => void) => {
    ipcRenderer.on('log', (_event, line: string) => callback(line))
  },
  onProjectFilesChanged: (callback: () => void) => {
    ipcRenderer.on('project:files-changed', () => callback())
  },

  onProjectStopped: (callback: () => void) => {
    ipcRenderer.on('project:stopped', () => callback())
  },

  onTerminalOutput: (callback: (text: string) => void) => {
    ipcRenderer.on('terminal:output', (_event, text: string) => callback(text))
  },

  onTerminalDone: (callback: (exitCode: number) => void) => {
    ipcRenderer.on('terminal:done', (_event, payload: { code: number }) => callback(payload.code))
  },

  // Item "Projeto > Gerar instalador (debug?)..." do Menu nativo (ADR-0024)
  onMenuBuildInstaller: (callback: (payload: { debug: boolean }) => void) => {
    ipcRenderer.on('menu:build-installer', (_event, payload: { debug: boolean }) =>
      callback(payload),
    )
  },

  // Item "Projeto > Fechar projeto" do Menu nativo
  onMenuCloseProject: (callback: () => void) => {
    ipcRenderer.on('menu:close-project', () => callback())
  },

  // Item "Idioma > EN | PT" do Menu nativo (ADR-0025)
  onMenuChangeLocale: (callback: (locale: 'en' | 'pt') => void) => {
    ipcRenderer.on('menu:change-locale', (_event, locale: 'en' | 'pt') => callback(locale))
  },

  // Setup de Tauri em projetos pré-existentes (ADR-0024)
  installerCheck: (projectDir: string) =>
    ipcRenderer.invoke('installer:check', projectDir),
  installerSetup: (projectDir: string) =>
    ipcRenderer.invoke('installer:setup', projectDir),

  // Preferências persistentes (ADR-0025 — i18n)
  prefsGet: () => ipcRenderer.invoke('prefs:get'),
  prefsSet: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke('prefs:set', patch),
  menuRebuild: (locale: 'en' | 'pt') =>
    ipcRenderer.invoke('menu:rebuild', locale),

  // Controles da janela frameless (redesign / Layout A)
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
})
