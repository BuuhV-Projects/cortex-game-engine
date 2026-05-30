# cortex-web

Website institucional do **cortex-game-engine** (IDE + engine).

Workspace independente do repo da IDE — `yarn install` aqui dentro,
`yarn dev` aqui dentro. Não compartilha `node_modules` com a raiz.

## Stack

- **Vite** (dev server + bundler).
- **Tailwind CSS v4** via plugin oficial `@tailwindcss/vite` (sem
  `tailwind.config.js`/`postcss.config.js` — tokens no próprio CSS via
  `@theme { ... }`).
- **TypeScript** (modo `noEmit`, só pra checagem).
- Sem framework JS por enquanto. Se a landing crescer pra ter
  interatividade rica, vale trocar pra Svelte ou Astro.

## Rodar

```bash
cd web
yarn install
yarn dev          # http://localhost:5174
yarn build        # gera dist/
yarn preview      # serve dist/ pra inspeção
```

## Estrutura

```
web/
├── index.html        Hero + 3 cards + footer (Tailwind inline)
├── src/
│   ├── main.ts       entry vazio (placeholder pra interatividade futura)
│   └── style.css     @import 'tailwindcss' + tokens custom
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Deploy

Não decidido ainda. Como o build é estático (HTML+CSS+JS em `dist/`),
qualquer hosting de estático serve: Netlify, Vercel, Cloudflare Pages,
GitHub Pages, S3+CloudFront. Vira ADR/TDR quando definir.
