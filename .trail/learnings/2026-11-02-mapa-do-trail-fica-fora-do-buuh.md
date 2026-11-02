---
title: "Mapa do trail fica fora do git; CI gera e checa, hook de commit atualiza local"
author: Buuh
date: 2026-11-02
branch: chore/trail-pipeline
id: l-09449fc8
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/pr.yml"
  - ".husky/pre-commit"
  - docs/tdrs/0009-trail-no-pr-e-no-pre-commit.md
---

## Decided
O mapa de código do trail NÃO é versionado. Cada máquina e o CI geram o seu: o pre-commit roda `trail build` incremental (~3,5 s) e o job `Trail` do PR roda `trail build` + `trail check --base origin/main`, que sai com exit 1 quando o diff conflita com um learning. O dev não precisa atualizar o mapa à mão; o que ele commita são só os learnings.

## Tried and ruled out
Versionar o mapa e reprovar o PR com `trail build --check`: o `.graph/wiring.json` (~8,6 MB) é reescrito a cada commit de código, e todo PR paralelo conflitaria nele, travando o auto-merge. Versionar só os cards `.md` não basta: o `--check` responde "NO GRAPH" sem o `.graph/`.

## Watch out
- Sem mapa no checkout, `trail build --check` sempre falha. Ele não serve para o CI enquanto o mapa estiver no gitignore.
- No Windows, `npm install -g @trailhq/trail-code` quebra no `tree-sitter-kotlin` com o VS Build Tools 18: o node-gyp 11.5 do npm não reconhece o VS 2026. Instale `node-gyp@12.4.0` e aponte `npm_config_node_gyp` para o `bin/node-gyp.js` dele.
- O progresso do `trail build` vai para o stderr; o hook precisa de `>/dev/null 2>&1`.

In the code:
- `.github/workflows/pr.yml`: job `trail`, `TRAIL_VERSION: '0.28.1'` (avisa quando sai versão nova)
- `.husky/pre-commit`: `trail build` só quando `command -v trail` encontra o binário; falha só avisa
- TDR-0009 e SPEC-0657
