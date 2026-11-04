# SPEC-0669 - Revisão de PR pelo Claude (claude-review.yml)

**Data:** 2026-11-03
**Status:** aceito

## Contexto

Substituto do Greptile como revisor e gate de nota do PR. A escolha da ferramenta
e as alternativas estão no TDR-0011.

## Decisão

Workflow `.github/workflows/claude-review.yml`:

- **Gatilho:** `pull_request_target` (`opened`, `synchronize`, `reopened`,
  `ready_for_review`) na `main`. Pula draft e PR de fork. Push novo cancela a
  revisão anterior do mesmo PR.
- **Checkout:** `main` na raiz (a action exige um repo git ali e restaura dela o
  `.claude/` e o `CLAUDE.md`); head do PR em `pr-head/` com histórico completo,
  sem credencial persistida.
- **Contexto:**
  - `trail build pr-head` gera o mapa do head;
  - os comentários inline que já existem no PR vão para `review-context/comments.json`,
    para o Claude não repetir o que já foi apontado.
- **Revisão:** `claude-code-action@v1`, autenticada pelo token da assinatura (secret
  `CLAUDE_CODE_OAUTH_TOKEN`, TDR-0013; era WIF com crédito da API, TDR-0011). Ferramentas
  liberadas: `Read`, `Glob`, `Grep`, `Bash(trail:*)`, `Bash(gh pr diff:*)`,
  `Bash(gh pr view:*)` e o MCP `create_inline_comment`. Hooks desligados
  (`disableAllHooks`). O prompt pede, em pt-br:
  - bugs de correção, segurança e regressão no diff, com impacto medido por
    `trail callers`/`ask`;
  - as regras do `CLAUDE.md` (spec antes do código, 500 linhas, 20 testes, yarn,
    `debug()`, física no `level.json`, `VENDOR_TYPE_MODULES`, doc gerada);
  - `trail check pr-head`, para conflito com learnings;
  - um comentário inline por problema, no arquivo/linha do head, sem repetir
    comentário já existente.
- **Nota:** `--json-schema` com `score` (1–5) e `summary`:
  - 5 = pode mergear, nada a corrigir;
  - 4 = só detalhes;
  - 3 ou menos = há problema real.
- **Gate:** passo final com o `GITHUB_TOKEN` (`github-actions[bot]`):
  - se o head mudou desde a revisão, não faz nada;
  - senão grava um review com o resumo e a nota: `APPROVE` com 5, `COMMENT` abaixo
    disso.

  O ruleset descarta a aprovação a cada push (TDR-0008), então cada commit precisa
  da própria nota.

## Consequências

- Requer o secret `CLAUDE_CODE_OAUTH_TOKEN` no repo; sem ele (ou com o token
  vencido) o job falha e não há aprovação. A action comenta com o `GITHUB_TOKEN`
  (`github-actions[bot]`), não pelo Claude GitHub App (TDR-0012).
- A resposta às threads segue a regra do CLAUDE.md (o Auto-fix da sessão trata os
  comentários do `github-actions[bot]` como os de qualquer revisor).
- O Greptile foi desativado e o `greptile-approve.yml` removido: esta é a única
  fonte da aprovação do ruleset.
- PR do Dependabot é revisado também (`allowed_bots`).
