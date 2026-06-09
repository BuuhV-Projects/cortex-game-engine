import { FileTree } from './FileTree'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { BottomPanel } from './BottomPanel'
import { ProjectManager } from './ProjectManager'
import { Chat } from './Chat'
import { Launcher } from './Launcher'
import { Shell } from './Shell'
import { LeftDock } from './LeftDock'
import { EditorPanels } from './EditorPanels'
import { AssetInspector } from './AssetInspector'
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

const leftDockEl = document.getElementById('left-dock') as HTMLElement
const editorContainer = document.getElementById('editor-container') as HTMLElement
const previewContainer = document.getElementById('preview-container') as HTMLElement
const consoleContainer = document.getElementById('console-container') as HTMLElement
const inspectorContainer = document.getElementById('inspector-container') as HTMLElement
const chatContainer = document.getElementById('chat-container') as HTMLElement
const menubarContainer = document.getElementById('menubar') as HTMLElement
const toolbarContainer = document.getElementById('toolbar') as HTMLElement

// Casca (menubar + toolbar) e dock esquerdo (abas Hierarquia/Projeto). O LeftDock
// monta os panes ANTES dos componentes que vivem dentro deles.
const shell = new Shell(menubarContainer, toolbarContainer)
const leftDock = new LeftDock(leftDockEl)
shell.init()
leftDock.init()

// FileTree → aba Projeto; EditorPanels → aba Hierarquia (outliner) + dock Inspector.
const fileTree = new FileTree(leftDock.filesPane)
const editorPanels = new EditorPanels(leftDock.hierarchyPane, inspectorContainer)
// Painel "Asset · GLB" — overlay no dock direito quando um .glb está aberto.
const assetInspector = new AssetInspector(inspectorContainer)
const editor = new Editor(editorContainer)
const preview = new Preview(previewContainer)
const bottomPanel = new BottomPanel(consoleContainer)
const projectManager = new ProjectManager(document.body)
const chat = new Chat(chatContainer)

// Tela inicial (logo + criar/abrir + recentes). Construída ANTES de fileTree.init()
// pra o listener de `project-open` já pegar a restauração do último projeto.
new Launcher()

fileTree.init()
editorPanels.init()
assetInspector.init()
editor.init()
preview.init()
bottomPanel.init()
projectManager.init()
chat.init()

// ── Resizers (flex) entre os docks ───────────────────────────────────────────
// `sign`: +1 quando o alvo está à ESQUERDA do handle (arrastar p/ direita alarga);
// -1 quando está à DIREITA (arrastar p/ esquerda alarga).
function colResizer(handle: HTMLElement, target: HTMLElement, sign: 1 | -1, min = 170, max = 680): void {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = target.getBoundingClientRect().width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent): void => {
      const w = Math.min(max, Math.max(min, startW + sign * (ev.clientX - startX)))
      target.style.flex = `0 0 ${w}px`
      target.style.width = `${w}px`
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
}
colResizer(document.getElementById('resizer-left') as HTMLElement, leftDockEl, 1)
colResizer(document.getElementById('resizer-inspector') as HTMLElement, inspectorContainer, -1)
colResizer(document.getElementById('resizer-chat') as HTMLElement, chatContainer, -1)

// Resize vertical entre viewport/editor e console — ajusta a altura do #console-container.
const bottomHandle = document.getElementById('resizer-bottom') as HTMLElement
const consoleEl = consoleContainer
const MIN_BOTTOM = 80
const MAX_BOTTOM_RATIO = 0.85
bottomHandle.addEventListener('mousedown', (e) => {
  const startY = e.clientY
  const startHeight = consoleEl.getBoundingClientRect().height
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  const onMove = (ev: MouseEvent): void => {
    const panelHeight = (consoleEl.parentElement as HTMLElement).getBoundingClientRect().height
    const next = Math.min(Math.max(startHeight + (startY - ev.clientY), MIN_BOTTOM), panelHeight * MAX_BOTTOM_RATIO)
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

// Editor vazio (sem arquivo aberto) → esconde o pane do Monaco; o viewport toma o
// centro. Ao abrir um arquivo, o editor reaparece dividindo o centro com o viewport.
// Centro = um doc por vez (estilo aba, Layout A): cena (viewport) OU arquivo
// (editor de código / preview de glb·imagem·markdown). O dock direito some no
// editor de CÓDIGO (não há o que inspecionar da cena); em GLB mostra o Asset.
const resizerInspector = document.getElementById('resizer-inspector') as HTMLElement
const applyDoc = (kind: 'scene' | 'code' | 'glb' | 'preview'): void => {
  const onScene = kind === 'scene'
  previewContainer.style.display = onScene ? '' : 'none'
  editorContainer.style.display = onScene ? 'none' : ''
  const hideInspector = kind === 'code'
  inspectorContainer.style.display = hideInspector ? 'none' : ''
  resizerInspector.style.display = hideInspector ? 'none' : ''
}
document.addEventListener('editor-doc-change', (e) => {
  applyDoc((e as CustomEvent<{ kind: 'scene' | 'code' | 'glb' | 'preview' }>).detail.kind)
})
applyDoc('scene') // boot: cena ativa

// Chat recolhido → vira um trilho fino (rail).
document.addEventListener('chat-collapsed-change', (e) => {
  const { collapsed } = (e as CustomEvent<{ collapsed: boolean }>).detail
  const w = collapsed ? 46 : 320
  chatContainer.style.flex = `0 0 ${w}px`
  chatContainer.style.width = `${w}px`
})

// Ao criar/abrir um projeto, FileTree recarrega apontando para o path.
document.addEventListener('project-open', (e) => {
  const { path } = (e as CustomEvent<{ path: string }>).detail
  void fileTree.openProject(path)
})

// Fechar projeto: limpa a árvore (os demais componentes têm seu próprio listener).
document.addEventListener('project-close', () => fileTree.closeProject())

// Menu nativo "Projeto > Gerar instalador..." (ADR-0024) — também disparado pela
// menubar custom. O BottomPanel escuta `build-installer-requested`.
window.electronAPI.onMenuBuildInstaller((payload) => {
  document.dispatchEvent(
    new CustomEvent<{ debug: boolean }>('build-installer-requested', { detail: { debug: payload.debug } }),
  )
})

// Menu nativo "Projeto > Fechar projeto" → volta pra tela inicial.
window.electronAPI.onMenuCloseProject(() => {
  document.dispatchEvent(new CustomEvent('project-close'))
})

// Menu nativo "Idioma > English | Português" (ADR-0025).
window.electronAPI.onMenuChangeLocale((locale) => {
  void import('./i18n').then(({ setLocale }) => setLocale(locale))
})
