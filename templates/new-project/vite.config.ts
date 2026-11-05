import { defineConfig, type Plugin } from 'vite'
import { resolve, sep } from 'path'
import { cpSync, existsSync } from 'node:fs'
// Plugin (dev) que grava as edições do editor (F2) em assets/scene-data.json.
// Vendorizado pelo IDE; pareia com o write-back do editor. Ver ADR.
import { createSceneSavePlugin, createAssetListPlugin } from './vendor/cortex-game-engine/vite/sceneSavePlugin.js'

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

/**
 * Pastas de ferramenta DESTA raiz (SPEC-0696): `.claude/` guarda as worktrees do
 * projeto — cópias inteiras do jogo, cada uma com seu `index.html` — e `.cortex` e
 * `.cortex-cache` guardam capturas e cache. Sem isto o vite da raiz varre e observa todas as cópias:
 * o 1º Play com cache frio passou de 3 s para mais de 4 min no DDD 00.
 *
 * Caminho ABSOLUTO resolvido daqui, nunca o glob `**\/.claude/**`: uma worktree mora
 * dentro de `.claude/worktrees/`, e o glob faria o vite DELA ignorar os próprios
 * arquivos. Assim cada raiz (main, worktree ou o build do exe) cuida só de si.
 */
const TOOL_DIRS = ['.claude', '.cortex', '.cortex-cache'].map((d) => resolve(__dirname, d))
const samePath = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p)
function isToolPath(path: string): boolean {
  const abs = samePath(resolve(path))
  return TOOL_DIRS.some((dir) => abs === samePath(dir) || abs.startsWith(samePath(dir) + sep))
}

// Algumas configurações abaixo existem para cooperar com Tauri (ADR-0024):
// - clearScreen:false evita Vite limpar o terminal e esconder logs do Rust.
// - server.strictPort: Tauri (devUrl) e o Play da IDE ligam na porta fixa 5174,
//   então o Vite não pode pular pra outra se estiver ocupada.
// - server.watch.ignored: evita re-bundle ao recompilar a casca Rust e não observa
//   as pastas de ferramenta (isToolPath, acima).
// - optimizeDeps.entries: o pré-bundle só parte do index.html DESTA raiz. O padrão
//   do vite é todo `.html` do projeto — incluindo os das worktrees em `.claude/`.
export default defineConfig(({ mode }) => ({
  root: '.',
  clearScreen: false,
  plugins: [copyAssets(), createSceneSavePlugin(), createAssetListPlugin()],
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
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', isToolPath],
    },
  },
}))
