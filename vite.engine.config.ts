import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

/**
 * Copia o transcoder Basis (WASM) do three pra `dist-engine/basis/` — o
 * `KTX2Loader` do browser (Studio/web) o carrega em runtime pra texturas KTX2
 * (ADR-0108). O `setTranscoderPath` do engine aponta pra cá (via vendor). No
 * host nativo isto NÃO é usado (transcoder C++). Roda no closeBundle deste
 * config (o 1º; emptyOutDir só aqui) — os configs seguintes não apagam `basis/`.
 */
function copyBasisTranscoder() {
  return {
    name: 'cortex-copy-basis-transcoder',
    closeBundle() {
      const src = resolve(__dirname, 'node_modules/three/examples/jsm/libs/basis')
      const dst = resolve(__dirname, 'dist-engine/basis')
      mkdirSync(dst, { recursive: true })
      for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
        copyFileSync(resolve(src, f), resolve(dst, f))
      }
    },
  }
}

/**
 * Build do engine em library mode, gerando um bundle único ESM com `three`
 * embutido. Este bundle é o que o IDE vendoriza dentro de cada projeto criado,
 * permitindo que o projeto rode sem `npm install` (Vite resolve `cortex-game-engine`
 * via alias apontando para o arquivo vendored).
 *
 * AI/CLI ficam fora (ver src/index-runtime.ts).
 */
export default defineConfig({
  plugins: [copyBasisTranscoder()],
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

