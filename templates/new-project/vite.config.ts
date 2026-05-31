import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'path'
import { cpSync, existsSync } from 'node:fs'

/**
 * Plugin inline que copia `./assets/` recursivamente pra `dist/assets/`
 * no fim do build. Necessário porque o código do jogo referencia
 * assets via string em runtime (`loader.loadAudio('assets/x.mp3')`,
 * `loader.loadGLTF('assets/forest/Tree_1.gltf')`) — o Vite só processa
 * imports estáticos, então `assets/` não é copiado sozinho. No `dev`,
 * Vite serve direto da raiz do projeto, então `assets/` já é acessível
 * sem cópia. No `tauri:build`, o `dist/` é o que vai pro `.exe`.
 */
function copyAssets(): Plugin {
  return {
    name: 'cortex-copy-assets',
    apply: 'build',
    closeBundle() {
      const src = resolve(__dirname, 'assets')
      const dst = resolve(__dirname, 'dist/assets')
      if (!existsSync(src)) return
      cpSync(src, dst, { recursive: true })
    },
  }
}

// Algumas configurações abaixo existem para cooperar com Tauri (ADR-0024):
// - clearScreen:false evita Vite limpar o terminal e esconder logs do Rust.
// - server.strictPort: Tauri liga em devUrl fixo (5173), então não pode pular.
// - server.watch.ignored: evita re-bundle ao recompilar a casca Rust.
export default defineConfig({
  root: '.',
  clearScreen: false,
  plugins: [copyAssets()],
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
