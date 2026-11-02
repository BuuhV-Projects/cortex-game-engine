---
title: "Pendente: migrar pra Git LFS, numa branch à parte, os binários pré-existentes fora da…"
author: Buuh
date: 2026-11-02
id: l-19a231a7
scope: repo
status: active
touches:
  - electron/renderer/public/logo.png
---

## Decided
O usuário pediu (2026-06-27) pra, **numa branch separada**, migrar pro Git LFS os
binários **pré-existentes** que estão commitados crus (fora das regras de `.gitattributes`):
- `kits/backgrounds-base/assets/*.jpg` (backgrounds dos kits, ~1500 arquivos)
- `electron/renderer/public/logo.png` e afins

São antigos (não desta sessão); os assets novos (vegetação/estradas/texturas em
`templates/new-project/assets/`) já estão em LFS corretamente. Fazer com
`git lfs migrate import --include="..."` numa branch dedicada (reescreve histórico →
não fazer na branch de trabalho). Relacionado: revendor-plataform-25d.

_From Claude Code's memory of this repo, last updated Jun 28._
