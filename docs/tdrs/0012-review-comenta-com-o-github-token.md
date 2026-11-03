# 0012 - Claude review comenta com o GITHUB_TOKEN, não pelo Claude GitHub App

**Data:** 2026-11-03
**Status:** aceito

## Contexto

O TDR-0011 pôs o Claude review para comentar como `claude[bot]`, pelo Claude GitHub
App. Sem `github_token`, a `claude-code-action@v1` troca o OIDC do GitHub por um
token do App antes de qualquer coisa. Em `pull_request_target` essa troca devolve
`401 Unauthorized - Invalid OIDC token` em todo PR, também com o App instalado no
repo (03/11, PR #40 e os PRs do Dependabot). A regra de federação da API nem chega a
ser chamada: o Console não mostra nenhum evento de autenticação para ela.

## Decisão

O passo `Revisão` passa `github_token: ${{ github.token }}`. A action usa o token do
runner (`contents: read`, `pull-requests: write`) para ler o PR e comentar no diff, e
não troca nada pelo token do App. A federação (WIF) segue pagando a revisão com o
crédito da API, como no TDR-0011.

Alternativas:

1. **Manter o Claude GitHub App** e investigar a troca. A troca é interna da action
   e não tem configuração no workflow; o `pull_request_target` é o que garante que um
   PR não edita o próprio revisor (TDR-0011), então não dá para trocar de evento.
2. **Token de um GitHub App próprio** (`actions/create-github-app-token`). Comenta com
   nome próprio, mas pede um App novo e uma chave privada em secret, para um ganho só
   cosmético.

## Consequências

- Os comentários e o review saem como `github-actions[bot]`, a mesma conta que já
  gravava a nota e a aprovação.
- O Claude GitHub App deixa de ser pré-requisito.
- Comentário do `github-actions[bot]` não dispara outro workflow (regra do
  `GITHUB_TOKEN`); hoje nada depende disso.
- O workflow roda a versão da `main`: esta mudança vale a partir do merge, e o próprio
  PR dela não tem review (merge manual pelo bypass de admin).
