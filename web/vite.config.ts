import { defineConfig } from 'vite'
import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'

// Tailwind v4 entrega o plugin Vite oficial — sem postcss.config nem
// tailwind.config separados. Tokens custom ficam no próprio CSS via
// `@theme { ... }` (ver src/style.css).
//
// Multi-page: cada HTML na raiz vira uma entry. `index.html` é a landing,
// `docs.html` é o visualizador de documentação. URLs ficam `/` e `/docs.html`.
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        docs: resolve(__dirname, 'docs.html'),
      },
    },
  },
  server: {
    port: 5174,
    strictPort: false,
  },
})
