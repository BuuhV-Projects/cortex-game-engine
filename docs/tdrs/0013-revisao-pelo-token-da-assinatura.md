# 0013 - Claude review autentica pelo token da assinatura

**Data:** 2026-11-04
**Status:** aceito

## Contexto

O TDR-0011 pôs o Claude review na API da Anthropic por Workload Identity Federation
(WIF), para gastar o crédito da API antes de ele vencer. Desde 2026-11-03 ~14:20 a
revisão falha em todo PR: o Claude Code inicia e devolve `is_error` em ~320 ms, com
1 turno, custo US$ 0 e nenhum token usado, e a action aborta com "`--json-schema` was
provided but Claude did not return structured_output". A API recusa já a primeira
chamada: é o caso previsto no TDR-0011 ("acabou o crédito ou a regra de federação
mudou, a revisão falha fechada"). Sem nota, nenhum PR da engine entra.

O TDR-0011 também registrou a regra para esse caso: voltar ao token da assinatura num
runner self-hosted na máquina do usuário. O `ddd00-game` já revisa com o token da
assinatura (secret `CLAUDE_CODE_OAUTH_TOKEN`) no `ubuntu-latest`.

## Decisão

O passo `Revisão` do `claude-review.yml` passa
`claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` no lugar dos quatro
IDs da federação, e o job deixa de pedir `id-token: write`. Continua no
`ubuntu-latest`. O token é exclusivo deste repo (`claude setup-token` gerado só para
ele, 2026-11-04), não o mesmo do `ddd00-game`: revogar um não derruba o outro. O resto do
workflow (gatilho, `pr-head/`, ferramentas, nota e gate) não muda.

Alternativas:

1. **Runner self-hosted com o token da assinatura** (a regra do TDR-0011). Mantém o
   token fora dos runners do GitHub, mas a revisão só roda com a máquina do usuário
   ligada e exige instalar e registrar o runner. O usuário escolheu o `ubuntu-latest`
   (2026-11-04).
2. **Repor o crédito da API e manter o WIF.** Volta a cobrar crédito por revisão;
   o usuário prefere a cota da assinatura, como no jogo.
3. **API key em secret.** Mesmo custo da alternativa 2, com um segredo de longa
   duração.

## Consequências

- A revisão gasta da cota da assinatura do usuário, não de crédito da API.
- O token é de longa duração, mas exclusivo deste repo: em caso de dúvida o usuário
  revoga só ele. Ele chega só ao job do `pull_request_target`,
  que só roda em PR do próprio repo (o `if` do job barra fork). Nenhum código do PR é
  executado e o Claude só tem ferramentas de leitura, então o diff não consegue ler o
  secret por execução. Se o token vazar ou vencer, o usuário revoga,
  gera outro (`claude setup-token`) e regrava o secret.
- Este PR é revisado pelo workflow da `main` (o `pull_request_target`), que ainda é o
  quebrado: entra por merge manual (bypass de admin). Os PRs seguintes voltam a ter
  nota.
- A regra do runner self-hosted do TDR-0011 deixa de valer.
