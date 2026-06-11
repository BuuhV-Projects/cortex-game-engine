import { defineConfig } from 'vite'
import { resolve } from 'path'

/**
 * Build do **chunk separado do Rapier** (`dist-engine/rapier.js`; TDR-0002). Empacota
 * `@dimforge/rapier3d-compat` (com o WASM inline em base64) num único ESM com export
 * default. O bundle base do engine o carrega via dynamic import remapeado pra
 * `./rapier.js` (ver `external`/`output.paths` em vite.engine.config.ts), então o
 * Rapier só baixa quando um jogo realmente usa física — projetos sem física não
 * pagam os ~2 MB. O vendoring copia este arquivo ao lado do index.js.
 */
export default defineConfig({
  build: {
    outDir: 'dist-engine',
    emptyOutDir: false, // não apaga o index.js já gerado
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/physics/rapierEntry.ts'),
      formats: ['es'],
      fileName: () => 'rapier.js',
    },
  },
})
