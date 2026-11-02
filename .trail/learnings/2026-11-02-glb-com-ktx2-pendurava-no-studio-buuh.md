---
title: GLB com KTX2 pendurava no Studio (Vite dev)
author: Buuh
date: 2026-11-02
id: l-72177ba2
scope: repo
status: active
touches:
  - electron/main.ts
  - "src/core/AssetLoader.ts#AssetLoader.loadGLTF"
  - "src/core/loadKtx2.ts#transcoderDirectory"
---

## Decided
03/10/2026: fase 2 do crash-racer ficava "0/120 objetos · 13 modelos carregando" até o timeout de 120 s no Studio. Causa: o Vite dev reescreve `new URL('./basis/', import.meta.url)` SEM a barra final → KTX2Loader pedia `basisbasis_transcoder.js` → fallback SPA devolvia index.html (200) → worker quebra calado → `loadGLTF` nunca resolve (sem erro no console). Corrigido na SPEC-0292 (`transcoderDirectory`), commit 682a15e2 na branch `fix/ktx2-transcoder-path`; jogo re-vendorizado na branch `fix/revendor-ktx2-studio`.

**Why:** a fase 2 foi o primeiro conteúdo com KTX2 rodado no Studio; o host nativo usa transcoder C++ e não tinha o problema.

## Watch out
carga pendurada sem erro no Studio → olhe `performance.getEntriesByType('resource')` atrás de 200 com content-type text/html (fallback do Vite). Jogo no Studio usa o `vendor/`; correção da engine só vale depois de re-vendorizar. Ver export-usa-src-nao-vendor.

GOTCHA do re-vendor: o Studio copia `dist-engine/` do CHECKOUT PRINCIPAL (D:/@buuhvprojects/js-game-engine, electron/main.ts ~684) para o `vendor/` do jogo ao abrir/Play — sobrescreveu minha cópia feita da worktree. Correção da engine só "gruda" no Studio depois de mesclar na main E rodar `yarn build:engine` no checkout principal. Mescla
…

_From Claude Code's memory of this repo, last updated Oct 3._
