import { defineConfig } from 'vite'
import { resolve } from 'path'

/**
 * Build do engine em library mode, gerando um bundle único ESM com `three`
 * embutido. Este bundle é o que o IDE vendoriza dentro de cada projeto criado,
 * permitindo que o projeto rode sem `npm install` (Vite resolve `cortex-game-engine`
 * via alias apontando para o arquivo vendored).
 *
 * AI/CLI ficam fora (ver src/index-runtime.ts).
 */
export default defineConfig({
  resolve: {
    // Redireciona `three` (bare) para o build `three/webgpu`, que é um superset
    // (todo o Three.Core + WebGPURenderer + node materials). Assim o renderer,
    // o core e os addons (que importam `three` internamente) usam UMA única
    // instância do three — sem isso haveria duas cópias e `instanceof` quebraria
    // (dual-instance). Só casa o specifier exato `three`, não `three/examples/*`.
    // Ver ADR-0032.
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  build: {
    outDir: 'dist-engine',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/index-runtime.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // Rapier (WASM ~2 MB) NÃO entra no bundle base: é `external` e o dynamic
      // import é remapeado pra `./rapier.js` (chunk separado, vendorizado ao lado),
      // carregado sob demanda só quando há física (TDR-0002). `three` segue embutido.
      external: ['@dimforge/rapier3d-compat'],
      output: {
        paths: { '@dimforge/rapier3d-compat': './rapier.js' },
      },
    },
  },
})

