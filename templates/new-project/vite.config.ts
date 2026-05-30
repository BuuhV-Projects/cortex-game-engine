import { defineConfig } from 'vite'
import { resolve } from 'path'

// Algumas configurações abaixo existem para cooperar com Tauri (ADR-0024):
// - clearScreen:false evita Vite limpar o terminal e esconder logs do Rust.
// - server.strictPort: Tauri liga em devUrl fixo (5173), então não pode pular.
// - server.watch.ignored: evita re-bundle ao recompilar a casca Rust.
export default defineConfig({
  root: '.',
  clearScreen: false,
  resolve: {
    alias: {
      // O IDE vendoriza o engine em ./vendor/cortex-game-engine ao criar o projeto.
      // O alias deixa o código fonte usar `import { ... } from 'cortex-game-engine'`
      // sem precisar de npm install.
      'cortex-game-engine': resolve(__dirname, 'vendor/cortex-game-engine/index.js'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
