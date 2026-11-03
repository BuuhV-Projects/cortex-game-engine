---
title: "Claude review comenta com o token do runner: a troca pelo token do Claude App dá 401 em pull_request_target"
author: Buuh
date: 2026-11-03
branch: claude/review-github-token
id: l-821878a7
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/claude-review.yml"
---

## Decided
O passo de revisão passa github_token: ${{ github.token }} à claude-code-action. Sem isso, a action troca o OIDC pelo token do Claude GitHub App, e essa troca dá "401 Invalid OIDC token" em pull_request_target, mesmo com o App instalado. A federação (WIF) que paga a revisão segue igual. Comentários saem como github-actions[bot].

## Tried and ruled out
Instalar o Claude GitHub App no repo: o 401 continua. A regra de federação no Console não mostra nenhum evento, porque o job cai antes de chegar nela.
Trocar o evento para pull_request: tiraria a garantia de que o PR não edita o próprio revisor.

## Watch out
O workflow roda a versão da main: mudança nele só vale depois do merge, e o próprio PR não tem review (merge manual).

In the code: .github/workflows/claude-review.yml (passo "Revisão"), TDR-0012.
