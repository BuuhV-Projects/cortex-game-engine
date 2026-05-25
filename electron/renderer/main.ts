import { FileTree } from './FileTree'
import { Editor } from './Editor'
import { Preview } from './Preview'

const sidebar = document.getElementById('sidebar') as HTMLElement
const editorContainer = document.getElementById('editor-container') as HTMLElement
const previewContainer = document.getElementById('preview-container') as HTMLElement
const consoleContainer = document.getElementById('console-container') as HTMLElement

const fileTree = new FileTree(sidebar)
const editor = new Editor(editorContainer)
const preview = new Preview(previewContainer, consoleContainer)

fileTree.init()
editor.init()
preview.init()
