import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'electron/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/renderer/index.html')
        }
      }
    }
  }
})
