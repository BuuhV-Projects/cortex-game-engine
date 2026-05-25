import { FileTree } from './FileTree'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { BottomPanel } from './BottomPanel'
import { ProjectManager } from './ProjectManager'
import { Chat } from './Chat'
import { Resizer } from './Resizer'

const sidebar = document.getElementById('sidebar') as HTMLElement
const editorContainer = document.getElementById('editor-container') as HTMLElement
const previewContainer = document.getElementById('preview-container') as HTMLElement
const consoleContainer = document.getElementById('console-container') as HTMLElement
const chatContainer = document.getElementById('chat-container') as HTMLElement

const fileTree = new FileTree(sidebar)
const editor = new Editor(editorContainer)
const preview = new Preview(previewContainer)
const bottomPanel = new BottomPanel(consoleContainer)
const projectManager = new ProjectManager(sidebar)
const chat = new Chat(chatContainer)

// FileTree.init() reconstrói o shell da sidebar; ProjectManager.init() prepend o botão depois
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
