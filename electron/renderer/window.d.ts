// Ambient — aumenta a interface global `Window` com a API exposta pelo
// preload. Inclui-se automaticamente em todos os arquivos do renderer pelo
// `tsconfig.json` deste mesmo diretório (sem necessidade de import explícito).
import type { ElectronAPI } from './types'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
