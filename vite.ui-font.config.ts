import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Fixture de fonte de arquivo por widget (SPEC-0716) no browser (backend DOM).
 * É o mesmo projeto que o `export-game.mjs` exporta pro host nativo.
 */
export default defineConfig({
  root: 'native/fixtures/ui-font',
  resolve: {
    alias: { 'cortex-game-engine': fileURLToPath(new URL('./src/index-runtime.ts', import.meta.url)) },
  },
});
