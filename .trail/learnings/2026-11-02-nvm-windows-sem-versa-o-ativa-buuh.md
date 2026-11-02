---
title: "Nvm-windows sem versão ativa quebra `node`/`yarn` no shell"
author: Buuh
date: 2026-11-02
id: l-f411e6e8
scope: repo
status: active
touches:
  - "tests/editor/multiSelect.test.ts#node"
  - "tests/render/RenderServer.test.ts#node"
---

## Decided
Em 2026-10-28 `node`/`yarn` respondiam "No active Node.js version is configured" (nvm-windows, shims em
`%LOCALAPPDATA%/Author Software/nvm/.nodejs`). Versões instaladas em `.../nvm/installs/` (v20.18.1, v22.23.4).
Sem mexer na config global (`nvm use` troca o symlink do sistema):

- Node: `"/c/Users/buuhb/AppData/Local/Author Software/nvm/installs/v22.23.4/node.exe"`
- Yarn (mesmo formato v1 dos lockfiles): `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 <node.exe> <install>/node_modules/corepack/dist/corepack.js yarn@1.22.22 <args>`
  (deixei um wrapper `y.sh` no scratchpad da sessão; recriar se precisar).

Relacionado: regra-sempre-yarn, projeto-gem-hopper.

_From Claude Code's memory of this repo, last updated Oct 28._
