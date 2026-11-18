# SPEC-0739 - Auto-merge do PR (repo privado)

**Data:** 2026-11-14
**Status:** aceito

## Contexto

TDR-0015: com o repo privado no plano Free, o ruleset e o auto-merge nativo deixam de valer. Este workflow
faz o merge quando o PR cumpre o mesmo gate que o ruleset impunha. Porte do `auto-merge` do `ddd00-game`.

## Decisão

### Disparo

`.github/workflows/auto-merge.yml`:
- `workflow_run` do `PR checks` (`completed`): avalia os PRs daquele head.
- `workflow_dispatch` com `pr`: o `claude-review.yml` dispara depois de publicar a nota, e o próprio auto-merge
  dispara para cada PR dependente depois de um merge.
- Um grupo de concorrência por PR. Só roda a versão da `main`; o checkout é só de `.github/`, nada do PR roda.

### Condições (todas no head do PR)

`.github/scripts/auto-merge.mjs`, função `evaluate`:

| Condição | Regra |
|---|---|
| Estado | aberto, não rascunho, não de fork |
| Base | `main`; PR empilhado espera a base entrar |
| Em dia | head sem commit faltando da `main` (`compare main...head`, `behind_by` = 0), como o ruleset exigia: o PR empilhado redirecionado, ou qualquer PR depois de outro merge, é atualizado e passa por CI e nota de novo |
| Checks | `Detectar mudanças`, `Regras do repo` e `Tests (Vitest)` em `success`; `Host nativo (Windows) + cortex_host_tests` em `success` ou `skipped` (o job só roda quando o PR toca o nativo) |
| Review | nota mais recente do `github-actions[bot]` no head, lida de `**Claude review: N/5**`, igual a 5 |
| Pedido de mudança | ninguém com CHANGES_REQUESTED em aberto: vale a revisão mais recente de cada pessoa que não é só comentário; aprovação ou dismiss depois libera |
| Conversas | nenhuma aberta (página cheia = não dá para confirmar = não mergeia) |

### Merge

1. Lista os PRs que miram a branch (pilha, TDR-0014) antes do merge.
2. Aprova o head se o bot ainda não aprovou esse commit (`APPROVE` preso ao `commit_id`; aprovação humana não conta
   para isso).
3. Mergeia com `gh pr merge --merge --match-head-commit <sha>` usando o **token do App** (`MERGE_TOKEN`): o
   push resultante dispara o `release.yml`.
4. Redireciona cada dependente para a `main`, apaga a branch e dispara o auto-merge de cada dependente. Cada redirecionamento é
   tentado à parte: se algum falha, os que conseguiram são disparados, a branch fica (apagá-la fecharia o PR que
   ainda aponta para ela) e o job lança. Um re-run redireciona o que faltou.

Falha fechada: qualquer erro de consulta lança e nada é mergeado.

### Pré-requisito do repo

A aprovação (passo 2) sai com o `GITHUB_TOKEN`, como a do `claude-review.yml`: exige "Allow GitHub Actions to create
and approve pull requests" ligado em Settings → Actions → General (`can_approve_pull_request_reviews: true` em
`repos/<repo>/actions/permissions/workflow`). Conferido ligado em 2026-11-18. Desligado, o passo de aprovar lança e o PR não é
mergeado (falha fechada).

## Consequências

- O `claude-review.yml` ganha o job `merge-dispatch` (depois do `review`), o único com `actions: write`: o job
  que roda o agente sobre o conteúdo do PR fica sem essa permissão, e uma falha no disparo não deixa a revisão
  vermelha.
- Testes em `tests/scripts/autoMerge.test.ts` e `tests/scripts/autoMergeStack.test.ts`.
