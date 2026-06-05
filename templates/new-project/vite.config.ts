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
// - server.strictPort: Tauri (devUrl) e o Play da IDE ligam na porta fixa 5174,
//   então o Vite não pode pular pra outra se estiver ocupada.
// - server.watch.ignored: evita re-bundle ao recompilar a casca Rust.
export default defineConfig(({ mode }) => ({
  root: '.',
  clearScreen: false,
  plugins: [copyAssets()],
  resolve: {
    alias: {
      // O IDE vendoriza o engine em ./vendor/cortex-game-engine ao criar o projeto.
      // O alias deixa o código usar `import { ... } from 'cortex-game-engine'` sem
      // npm install. Em DEV usa `index.dev.js` (inclui e liga o modo editor
      // automaticamente); no BUILD de produção usa `index.js` (runtime, sem editor)
      // — assim o editor não pesa no jogo final. Ver ADR-0042.
      'cortex-game-engine': resolve(
        __dirname,
        mode === 'development'
          ? 'vendor/cortex-game-engine/index.dev.js'
          : 'vendor/cortex-game-engine/index.js',
      ),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}))
