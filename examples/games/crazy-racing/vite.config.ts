import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      // O IDE vendoriza o engine em ./vendor/cortex-game-engine ao criar o projeto.
      // O alias deixa o código fonte usar `import { ... } from 'cortex-game-engine'`
      // sem precisar de npm install.
      'cortex-game-engine': resolve(__dirname, 'vendor/cortex-game-engine/index.js'),
    },
  },
})
