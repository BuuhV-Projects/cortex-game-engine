import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      // O IDE vendoriza o engine em ./vendor/js-game-engine ao criar o projeto.
      // O alias deixa o código fonte usar `import { ... } from 'js-game-engine'`
      // sem precisar de npm install.
      'js-game-engine': resolve(__dirname, 'vendor/js-game-engine/index.js'),
    },
  },
})
