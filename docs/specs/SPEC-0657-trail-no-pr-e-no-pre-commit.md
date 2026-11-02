# SPEC-0657 - Trail no PR e no pre-commit

**Data:** 2026-11-02
**Status:** aceito

Decisão e alternativas no [TDR-0009](../tdrs/0009-trail-no-pr-e-no-pre-commit.md).

## Contexto

Ver TDR-0009: todo PR deve passar pelo trail e o mapa local deve ficar fresco.

## Decisão

### PR: job `Trail` em `.github/workflows/pr.yml`

1. Checkout com histórico completo (o `trail check` precisa do `origin/main`).
2. `yarn global add @trailhq/trail-code@$TRAIL_VERSION` (pinado no `env`).
3. Se `yarn info @trailhq/trail-code version` for diferente do pinado:
   `::warning::` com a versão nova. Não reprova.
4. `trail build` — gera o mapa do zero; falha = job vermelho.
5. `trail check --base origin/main` — exit 1 se o diff conflita com um learning.

### Local: `.husky/pre-commit`

Antes dos testes relacionados (SPEC-0654): se `trail` está no PATH, roda
`trail build` (incremental). Erro vira aviso; o commit segue. Sem trail
instalado, pula em silêncio.

## Consequências

Mapa (`.trail/cache/`) continua fora do git; nada é commitado de volta pelo CI.
