import { FileTree } from './FileTree'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { BottomPanel } from './BottomPanel'
import { ProjectManager } from './ProjectManager'
import { Chat } from './Chat'
import { Launcher } from './Launcher'
import { Resizer } from './Resizer'
import { Shell } from './Shell'
import { applyTheme } from './theme'
import { initI18n } from './i18n'
import { showWelcomeModal } from './Welcome'

// Aplica o tema (CSS vars + Monaco) antes de inicializar componentes.
applyTheme()

// i18n é assíncrono (IPC pra ler preferências). Resolvemos antes de
// construir os componentes pra evitar re-render em pt depois do en.
const { welcomed } = await initI18n()
if (!welcomed) {
  await showWelcomeModal()
}

const sidebar = document.getElementById('sidebar') as HTMLElement
const editorContainer = document.getElementById('editor-container') as HTMLElement
const previewContainer = document.getElementById('preview-container') as HTMLElement
const consoleContainer = document.getElementById('console-container') as HTMLElement
const chatContainer = document.getElementById('chat-container') as HTMLElement
const menubarContainer = document.getElementById('menubar') as HTMLElement
const toolbarContainer = document.getElementById('toolbar') as HTMLElement

// Casca nova (redesign / Layout A): menubar + toolbar acima dos docks.
const shell = new Shell(menubarContainer, toolbarContainer)

const fileTree = new FileTree(sidebar)
const editor = new Editor(editorContainer)
const preview = new Preview(previewContainer)
const bottomPanel = new BottomPanel(consoleContainer)
const projectManager = new ProjectManager(sidebar)
const chat = new Chat(chatContainer)

// Tela inicial (logo + criar/abrir + recentes). Construída ANTES de fileTree.init()
// pra o listener de `project-open` já pegar a restauração do último projeto (se
// houver, a tela some na hora; senão fica visível no boot).
new Launcher()

// FileTree.init() reconstrói o shell da sidebar; ProjectManager.init() prepend o botão depois
shell.init()
fileTree.init()
editor.init()
preview.init()
bottomPanel.init()
projectManager.init()
chat.init()

// Resizers entre as colunas do grid. As larguras iniciais batem com o
// grid-template-columns definido em styles.css.
const app = document.getElementById('app') as HTMLElement
const rightTarget = { columnIndex: 4, width: 320 }
const chatTarget = { columnIndex: 6, width: 320 }
const resizer = new Resizer(app, [rightTarget, chatTarget])
resizer.attach(document.getElementById('resizer-right') as HTMLElement, rightTarget)
resizer.attach(document.getElementById('resizer-chat') as HTMLElement, chatTarget)

// Resize vertical entre preview e console/terminal — ajusta a altura do
// #console-container (que é flex-shrink:0 com height fixa).
const bottomHandle = document.getElementById('resizer-bottom') as HTMLElement
const consoleEl = consoleContainer
const MIN_BOTTOM = 80
const MAX_BOTTOM_RATIO = 0.85
let bottomDragStartY = 0
let bottomDragStartHeight = 0
bottomHandle.addEventListener('mousedown', (e) => {
  bottomDragStartY = e.clientY
  bottomDragStartHeight = consoleEl.getBoundingClientRect().height
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  const onMove = (ev: MouseEvent): void => {
    const panelHeight = (consoleEl.parentElement as HTMLElement).getBoundingClientRect().height
    const delta = bottomDragStartY - ev.clientY
    const next = Math.min(
      Math.max(bottomDragStartHeight + delta, MIN_BOTTOM),
      panelHeight * MAX_BOTTOM_RATIO,
    )
    consoleEl.style.height = `${next}px`
  }
  const onUp = (): void => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
})

// Editor vazio (sem arquivo/imagem aberto) → o jogo (#right-panel) toma o espaço
// do editor. Quando um arquivo/imagem/markdown abre, o editor volta ao 1fr.
document.addEventListener('editor-empty-change', (e) => {
  const { empty } = (e as CustomEvent<{ empty: boolean }>).detail
  resizer.editorCollapsed = empty
  resizer.applyColumns()
})
// Estado inicial: nada aberto no editor, então o jogo já começa expandido.
resizer.editorCollapsed = true
resizer.applyColumns()

const COLLAPSED_CHAT_WIDTH = 32
let chatWidthBeforeCollapse = chatTarget.width
document.addEventListener('chat-collapsed-change', (e) => {
  const { collapsed } = (e as CustomEvent<{ collapsed: boolean }>).detail
  if (collapsed) {
    chatWidthBeforeCollapse = chatTarget.width
    chatTarget.width = COLLAPSED_CHAT_WIDTH
  } else {
    chatTarget.width = chatWidthBeforeCollapse
  }
  resizer.applyColumns()
})

// Ao criar um novo projeto, FileTree recarrega apontando para o path criado
document.addEventListener('project-open', (e) => {
  const { path } = (e as CustomEvent<{ path: string }>).detail
  void fileTree.openProject(path)
})

// Fechar projeto: limpa a árvore (os demais componentes têm seu próprio listener).
document.addEventListener('project-close', () => fileTree.closeProject())

// Painéis do editor (ADR-0056): ao aparecerem, alarga a coluna direita uma vez
// pra caber jogo + hierarquia/inspector (250px) sem ficar apertado.
document.addEventListener('editor-panels-visible', () => {
  if (rightTarget.width < 560) {
    rightTarget.width = 560
    resizer.applyColumns()
  }
})

// Menu nativo "Projeto > Gerar instalador..." (ADR-0024). O BottomPanel
// escuta o evento DOM e dispara `yarn tauri:build` (release) ou
// `yarn tauri:build:debug` (com DevTools embutido) no projeto ativo.
window.electronAPI.onMenuBuildInstaller((payload) => {
  document.dispatchEvent(
    new CustomEvent<{ debug: boolean }>('build-installer-requested', {
      detail: { debug: payload.debug },
    }),
  )
})

// Menu nativo "Projeto > Fechar projeto" → volta pra tela inicial.
window.electronAPI.onMenuCloseProject(() => {
  document.dispatchEvent(new CustomEvent('project-close'))
})

// Menu nativo "Idioma > English | Português" (ADR-0025). Importa setLocale
// dinamicamente pra evitar ciclo de dependência com Welcome.ts (que
// também usa i18n).
window.electronAPI.onMenuChangeLocale((locale) => {
  void import('./i18n').then(({ setLocale }) => setLocale(locale))
})
