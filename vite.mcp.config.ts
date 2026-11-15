import { defineConfig } from 'vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Build do servidor MCP `cortex` e do `cortex-setup` (SPEC-0737/0738): bundles ESM para Node, com as
 * dependências DENTRO (`ssr.noExternal`), porque rodam com o exe do Studio em modo Node a partir de
 * `resources/mcp/`, onde não há `node_modules`. O `electron-builder` copia `out/mcp/` para lá.
 */
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  define: {
    __CORTEX_ENGINE_VERSION__: JSON.stringify(pkg.version),
    __CORTEX_MCP_ENTRY__: 'true',
  },
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: true,
    outDir: 'out/mcp',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: false,
    minify: false,
    rollupOptions: {
      input: {
        'cortex-mcp': resolve(__dirname, 'mcp/server.ts'),
        'cortex-setup': resolve(__dirname, 'mcp/setup/cli.ts'),
      },
      output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
    },
  },
})
