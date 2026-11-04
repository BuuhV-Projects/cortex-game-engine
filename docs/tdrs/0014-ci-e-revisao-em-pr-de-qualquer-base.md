# 0014 - CI e Claude review em PR de qualquer base

**Data:** 2026-11-04
**Status:** aceito

## Contexto

O `pr.yml` (TDR-0005) e o `claude-review.yml` (TDR-0011) só disparavam em PR com base
`main` (`branches: [main]`). Um PR empilhado, com base na branch de outro PR (ex.:
`perf/fase3-integracao` sobre `perf/teto-de-subpassos`), ficava sem CI e sem nota até o
de baixo entrar. Os PRs #46 e #47 passaram dias assim, e a revisão deles teve de ser feita
à mão.

O merge na `main` tem três travas que valem também para a pilha:

- o ruleset da `main` exige a branch em dia (`strict_required_status_checks_policy`) e
  descarta a aprovação a cada push;
- ação feita com o `GITHUB_TOKEN` (push, merge, troca de base) não dispara workflow;
- o `release.yml` roda no `push` da `main`, e um merge pelo `GITHUB_TOKEN` não o dispara.

## Decisão

- `pr.yml` e `claude-review.yml` disparam em PR para **qualquer base**. O `trail check` e o
  prompt do revisor comparam com a base real do PR (`github.base_ref`), não com a `main`.
- O merge continua **só na `main` e em ordem de pilha**. Fora da `main` não há ruleset: o
  auto-merge nativo, se ligado num PR empilhado, mergearia na hora. A regra fica no
  `CLAUDE.md`: auto-merge só com a base `main`. Quando o PR de baixo entra e a branch dele é
  apagada, o GitHub redireciona o de cima para a `main`. A sessão atualiza a branch, espera
  CI e o 5/5 do head novo e liga o auto-merge, como em qualquer PR.

Alternativas:

1. **Mergear o PR empilhado na base dele assim que tiver 5/5.** O merge pelo
   `GITHUB_TOKEN` não dispara CI nem revisão no PR de baixo, que fica com o head novo sem
   checks e trava no ruleset. Recusada.
2. **Workflow que atualiza e mergeia a pilha sozinho.** Esbarra nas mesmas travas: o push
   de atualização e o merge pelo `GITHUB_TOKEN` não disparam CI, revisão nem release. Só
   funciona com um token que dispare workflows (GitHub App ou PAT em secret), o que é uma
   credencial nova a decidir com o usuário. Fica como próximo passo, se a pilha manual
   cansar.
3. **Manter o filtro e revisar o empilhado à mão.** É o que motivou esta mudança.

## Consequências

- PR empilhado ganha CI e nota desde o primeiro push. A nota vale para o diff contra a base
  dele. Depois do redirecionamento, o push de atualização gera CI e nota novos contra a
  `main`, e é essa nota que o ruleset cobra.
- `pull_request_target` roda o `claude-review.yml` da branch de **base**. No PR empilhado,
  é o arquivo da branch do PR de baixo. Só quem tem escrita no repo altera essa branch, e
  quem tem escrita já alcança os secrets por qualquer workflow de `push`. A aprovação dada
  ali não chega à `main`: o push de atualização exigido pelo ruleset a descarta.
- Mais minutos de runner, um ciclo de CI e revisão por push de PR empilhado.
- A revisão gasta cota da assinatura também no empilhado (TDR-0013).
