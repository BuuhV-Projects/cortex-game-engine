# SPEC-0706 - Host nativo no PR só quando o diff toca o que ele valida

**Data:** 2026-11-07
**Status:** aceito

Ajusta o pulo do job `native-host` do `pr.yml` (TDR-0008).

## Contexto

O job `changes` ligava o host nativo para qualquer arquivo fora de `docs/`, `graft/`,
`.claude/` e `*.md`. Um PR só de Studio (`electron/renderer/...` + teste, como o PR 74)
pagava os ~10 min do runner Windows sem tocar em nada que o job compila ou testa.

## Decisão

A regra vira lista de **inclusão**: o host nativo roda quando o diff toca algo que o
build/teste do host consome:

- `native/` — fonte C++, Rust, shims JS, scripts de bundle e export-toolchain;
- `src/` — o engine, que o `bundle.mjs` empacota no host;
- `package.json` / `yarn.lock` da raiz — de onde o bundle resolve o `three` e o resto;
- `.github/actions/build-native-host/` e `.github/workflows/pr.yml` — o próprio gate.

Fora disso o job é pulado por `if` (continua valendo: job pulado conta como verde no
check obrigatório; filtro `paths` no `on:` deixaria o check pendente). No disparo manual
(`workflow_dispatch`, sem base) o host roda sempre, como antes.

## Consequências

- PR de Studio, testes, templates ou docs não espera mais o runner Windows.
- Arquivo novo que o build nativo passe a consumir fora dessa lista precisa entrar no
  padrão do `changes`, senão uma quebra só aparece no `release.yml` pós-merge.
