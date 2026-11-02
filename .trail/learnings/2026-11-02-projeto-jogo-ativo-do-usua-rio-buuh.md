---
title: Projeto-jogo ativo do usuário (plataforma 2.5D) que consome o engine vendorizado
author: Buuh
date: 2026-11-02
id: l-44c3c9d8
scope: repo
status: active
touches:
  - dist-engine/index.js
  - dist-engine/index.dev.js
  - electron/main.ts
  - "electron/main.ts#vendorEngine"
---

## Decided
O usuário tem um jogo ativo em `D:\jogos\dream-island-wonder` — plataforma 2.5D
de ilhas flutuantes + pontes (estilo Mario Wonder/Rayman), feito com o
`cortex-game-engine`. Ele serve de **caso real** pra validar features do engine.

**Re-vendor após mudar a API do engine:** o jogo importa de
`./vendor/cortex-game-engine/` (alias do Vite). Depois de `yarn build:engine`,
copiar pro projeto: `dist-engine/index.js` → `vendor/.../index.js`,
`dist-engine/index.dev.js` → `vendor/.../index.dev.js`, e os `.d.ts` que mudaram
de `dist/src/<sub>/<Mod>.d.ts` → `vendor/.../<sub>/<Mod>.d.ts` (replica o
`vendorEngine` do `electron/main.ts`). Mudança só de **editor** (dev bundle) = só
`index.dev.js`. Avisar pra **reiniciar o vite/Play** do IDE (e o IDE em si quando
muda código do agente/editor — só recarregar bundle não basta pra `electron/`).

Sistema de collider 2D evoluiu muito a partir desse projeto (ver ADRs
0045/0047/0048/0049): collider como propriedade do objeto (autorável no editor,
acoplado), formas box/circle/capsule, e heightfield com ferramenta de desenho.
Relacionado: chat-ia-scene-building.

_From Claude Code's memory of this repo, last updated Jun 7._
