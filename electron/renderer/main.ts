import { FileTree } from './FileTree'
import { Editor } from './Editor'
import { Preview } from './Preview'
import { BottomPanel } from './BottomPanel'
import { ProjectManager } from './ProjectManager'

const sidebar = document.getElementById('sidebar') as HTMLElement
const editorContainer = document.getElementById('editor-container') as HTMLElement
const previewContainer = document.getElementById('preview-container') as HTMLElement
const consoleContainer = document.getElementById('console-container') as HTMLElement

const fileTree = new FileTree(sidebar)
const editor = new Editor(editorContainer)
const preview = new Preview(previewContainer)
const bottomPanel = new BottomPanel(consoleContainer)
const projectManager = new ProjectManager(sidebar)

// FileTree.init() reconstrói o shell da sidebar; ProjectManager.init() prepend o botão depois
fileTree.init()
editor.init()
preview.init()
bottomPanel.init()
projectManager.init()

// Ao criar um novo projeto, FileTree recarrega apontando para o path criado
document.addEventListener('project-open', (e) => {
  const { path } = (e as CustomEvent<{ path: string }>).detail
  void fileTree.openProject(path)
})
