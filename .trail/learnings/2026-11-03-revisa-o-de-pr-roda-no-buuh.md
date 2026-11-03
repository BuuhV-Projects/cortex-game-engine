---
title: "Revisão de PR roda no crédito da API; quando o crédito acabar, volta para runner self-hosted"
author: Buuh
date: 2026-11-03
branch: claude/local-code-review-agent-acf683
cost: { minutes: 11, tokens: 79390 }
id: l-eeb0fd77
scope: repo
status: active
src: agent
touches:
  - docs/tdrs/0011-revisao-de-pr-pelo-claude-code.md
  - docs/specs/SPEC-0669-revisao-de-pr-pelo-claude.md
  - ".github/workflows/claude-review.yml"
  - docs/tdrs/0008-validacao-leve-local-pesada-no-pr.md
  - ".github/workflows/pr.yml"
  - CLAUDE.md
  - ".github/DEPENDABOT.md"
  - docs/tdrs/0010-dependabot-atualiza-dependencias.md
  - docs/specs/SPEC-0654-gate-de-pr-regras-e-aprovacao-greptile.md
---

## Decided
A revisão de PR (substituto do Greptile, desativado em 03/11/2026) roda na action oficial do Claude Code num runner do GitHub, pagando com o crédito da API da Anthropic via federação de identidade (sem secret). Regra do usuário: quando esse crédito expirar, a revisão volta para um runner self-hosted na máquina dele, com o token da assinatura.

## Tried and ruled out
Começar no self-hosted: o repo é público, e um PR pode editar qualquer workflow para rodar no runner da máquina do usuário. Só vale com label exclusivo para o workflow de revisão e com "Require approval for all external contributors" ligado.
Liberar `gh api` para o Claude: com ele o bot poderia aprovar o próprio PR e pular o gate da nota.

## Watch out
A regra de federação precisa aceitar o OIDC de `pull_request_target`; se foi criada só para `push`, a troca de token falha e nenhum PR é aprovado.

In the code: .github/workflows/claude-review.yml, docs/tdrs/0011-revisao-de-pr-pelo-claude-code.md, SPEC-0669.
