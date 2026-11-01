# SPEC-0654 - Gate de PR: regras do repo, nativo condicional e aprovação pelo Greptile

**Data:** 2026-11-01
**Status:** aceito

Decisão e alternativas no [TDR-0008](../tdrs/0008-validacao-leve-local-pesada-no-pr.md).

## Contexto

Ver TDR-0008: o pre-commit rodava a suíte inteira, regras do CLAUDE.md não eram
checadas e a aprovação exigida pelo ruleset travava o auto-merge.

## Decisão

### Local: `.husky/pre-commit`

`yarn -s vitest related --run <staged>` com os `.ts/.tsx/.js/.mjs` staged
(adicionados/modificados). Sem arquivo desses, não roda nada.

### PR: `.github/workflows/pr.yml`

| Job | Quando | O que faz |
|---|---|---|
| `changes` | sempre | `native=true` se algum arquivo do diff não for `docs/`, `graft/`, `.claude/` ou `*.md`. `workflow_dispatch` = sempre `true`. |
| `Tests (Vitest)` | sempre | typecheck do engine (`tsc -p tsconfig.engine.json --noEmit`) + `yarn test`. |
| `Regras do repo` | sempre | `node .github/scripts/pr-rules.mjs <base> <head>`. |
| `Host nativo (Windows) + cortex_host_tests` | `native == true` | igual ao TDR-0005; pulado conta como verde. |

`pr-rules.mjs` olha só o diff `base...head`:

- **erro:** `package-lock.json` adicionado/modificado.
- **erro:** arquivo de código (ts, tsx, js, mjs, cjs, c, cc, cpp, h, hpp, py,
  sh, ps1, rs) adicionado/modificado com mais de 500 linhas e fora de
  `docs/pendencias-refatoracao.md`. Isentos: `third_party/`, `vendor/`,
  `patched/`, `docs/cortex-game-engine/api/`.
- **erro:** linha adicionada com `console.log(` em `src/**` (fora de `src/cli/`
  e `src/core/debug.ts`), ignorando linhas de comentário.
- **aviso:** código em `src/`, `electron/` ou `native/` mudou sem nenhum arquivo
  em `docs/specs/`, `docs/adrs/` ou `docs/tdrs/` no diff.

Saída em anotações do GitHub (`::error file=…::`); sai com 1 se houver erro.

### Aprovação: `.github/workflows/greptile-approve.yml`

Disparo: `check_run` `completed`. Roda só se o check é `Greptile Review`, do app
`greptile-apps`, com conclusão `success`. Para cada PR do evento:

1. o head do PR é o `head_sha` do check e o PR não vem de fork;
2. a **última edição** do corpo do PR é do `greptile-apps` (GraphQL
   `pullRequest.editor`) — o autor não pode ter editado depois da revisão;
3. o corpo tem **exatamente um** `<!-- greptile_confidence_score:N -->` e N = 5
   (um marcador plantado antes da revisão vira dois);
4. o `github-actions[bot]` ainda não aprovou esse commit.

O diff é lido com `-z` e `core.quotePath=false` (caminho com acento ou aspas
não escapa), e `+++` só conta como cabeçalho antes do primeiro `@@` do arquivo.

Cumpridos os quatro, publica review `APPROVE` no commit. Qualquer outra situação
só registra o motivo no log. Permissões: `pull-requests: write`, nada mais; sem
checkout.

### Configuração do repositório (fora do git)

- Actions: `can_approve_pull_request_reviews = true`.
- Ruleset "Protecao do main": `dismiss_stale_reviews_on_push = true` e
  `Regras do repo` entre os checks obrigatórios.

## Consequências

- Com 5/5 + CI verde, o auto-merge da sessão mergeia sem admin.
- PR com nota abaixo de 5 fica sem aprovação até o Greptile revisar de novo.
- Teste das regras em `tests/scripts/prRules.test.ts`. O gate de aprovação só
  roda da `main` (limitação do `check_run`); é validado no primeiro PR após o merge.
