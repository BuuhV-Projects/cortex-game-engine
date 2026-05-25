import { defineConfig } from 'electron-vite'
// vite-plugin-monaco-editor expõe a função factory em .default.default quando importado via ESM
// (o export default do pacote é o módulo inteiro, não a factory diretamente)
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'
import { resolve } from 'path'

const monacoEditorPlugin = monacoEditorPluginModule.default

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
    plugins: [
      monacoEditorPlugin({
        // customDistPath é necessário no Windows: o plugin usa path.join(root, outDir, ...)
        // mas quando ambos são caminhos absolutos o join concatena em vez de substituir.
        // Usando customDistPath recebemos outDir já resolvido e construímos o path correto.
        customDistPath: (_root: string, buildOutDir: string, _base: string) =>
          resolve(buildOutDir, 'monacoeditorwork'),
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/renderer/index.html')
        }
      }
    }
  }
})
