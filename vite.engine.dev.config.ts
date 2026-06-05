import { defineConfig } from 'vite'
import { resolve } from 'path'

/**
 * Build do bundle de **desenvolvimento** do engine (`index.dev.js`): runtime +
 * modo editor. Igual ao vite.engine.config.ts, mas com entry `src/index-dev.ts`
 * e saída `index.dev.js`. Self-contained (three embutido), usado pela IDE só em
 * `mode=development` no projeto; o build de produção usa `index.js`. Ver ADR-0042.
 *
 * `emptyOutDir: false` pra NÃO apagar o `index.js` gerado pelo build de runtime
 * (os dois escrevem em dist-engine/, rodados em sequência).
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  build: {
    outDir: 'dist-engine',
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/index-dev.ts'),
      formats: ['es'],
      fileName: () => 'index.dev.js',
    },
    rollupOptions: {
      external: [],
    },
  },
})
