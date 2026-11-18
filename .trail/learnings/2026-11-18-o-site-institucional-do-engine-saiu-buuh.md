---
title: "O site institucional do engine saiu do repo (web/) para um repo proprio, publicado em tscortexstudio.com"
author: Buuh
date: 2026-11-18
branch: chore/mover-site-para-repo-proprio
cost: { minutes: 52, tokens: 416053 }
id: l-2b33511b
scope: repo
status: active
src: agent
touches:
  - package.json
---

## Decided
A pasta `web/` (o site `cortex-web`: landing + docs en/pt do engine, Vite + Tailwind v4 + TS)
saiu do repo da engine para um repositorio proprio: **BuuhV-Projects/tscortexstudio-website**,
publicado no Cloudflare Pages (conta pessoal buuhvprojects) no dominio **tscortexstudio.com**.
A home/docs continua sendo o site do engine; jogos entram como paginas MPA em `/games/<slug>/`
(primeiro: `/games/ddd-porthollow/`). Removido no PR #105, junto dos scripts raiz que apontavam
pra pasta.

## Watch out
- Ao mover o site, o build quebrou no destino por falta de `@types/node` (o `tsc --noEmit` do
  script `build` acusa `Cannot find module 'path'` e `__dirname`). No repo antigo havia @types/node
  no node_modules fora do package.json; numa instalacao limpa some. Adicionado pinado no novo repo.
- Se procurar `build:web`/`dev:web` no package.json raiz: foram removidos (apontavam pra `web/`).
- Deploy no Pages usa o token `CLOUDFLARE_BUUHVPROJECTS_CLI_TOKEN` do ~/.claude/.env; o classifier
  do modo automatico bloqueia o Claude de ler esse .env, entao o deploy.sh e rodado pelo usuario.
- O alias por-deploy `<hash>.tscortexstudio.pages.dev` (dois niveis) da erro de TLS em alguns
  clientes Windows; validar sempre pelo host canonico `tscortexstudio.pages.dev`.

In the code:
- repo novo: github.com/BuuhV-Projects/tscortexstudio-website (F:\dev-jogos\tscortexstudio-website)
- projeto Cloudflare Pages: `tscortexstudio` (account 8c806cb278c0c49b773d2987ee0e5c84)
- PR da remocao: BuuhV-Projects/cortex-game-engine#105
