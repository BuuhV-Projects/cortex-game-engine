import { ElectronAPI } from "./renderer/types"


declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}