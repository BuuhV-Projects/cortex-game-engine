# 0011 - Revisão de PR pelo Claude Code no lugar do Greptile

**Data:** 2026-11-03
**Status:** aceito

## Contexto

O TDR-0008 pôs a aprovação exigida pelo ruleset da `main` nas mãos do Greptile:
o `greptile-approve.yml` aprovava quando o Greptile dava Confidence Score 5/5. O
usuário desativou o Greptile (custo alto para um projeto pessoal) e o repo precisa
de outro revisor que comente no diff e dê uma nota, sem perder o auto-merge.

O usuário tem crédito da API da Anthropic (US$ 300 que expiram se não forem
usados), com uma regra de Workload Identity Federation (WIF) já criada para o
GitHub, e usa o trail (TDR-0009) como mapa de código e memória das sessões.

## Decisão

Usar a action oficial **`anthropics/claude-code-action@v1`** (Claude Code dentro
do GitHub Actions) num workflow próprio, `claude-review.yml` (SPEC-0669):

- Roda em `pull_request_target`, então o prompt, as ferramentas liberadas e o gate
  de aprovação vêm sempre da `main`: um PR não consegue editar o próprio revisor.
  O head do PR entra num subdiretório (`pr-head/`), padrão recomendado em
  `docs/security.md` da action; nenhum código do PR é executado.
- Autentica na API por **WIF**: o OIDC do GitHub (`id-token: write`) é trocado por
  um token da Anthropic usando a regra de federação, a organização, a service
  account e o workspace (IDs no workflow; não são segredo). Nenhum secret no repo.
  Comenta como `claude[bot]` pelo Claude GitHub App.
- O mapa vem do trail: o job roda `trail build` no head e o Claude usa
  `trail ask`/`callers`/`check` para entender o impacto da mudança.
- A nota sai por `--json-schema` (`structured_output`), não por marcador de texto.
  O passo final, com o `GITHUB_TOKEN`, grava um review com o resumo e aprova só
  com 5/5 no commit que ainda é o head, como o gate do TDR-0008 fazia.

Alternativas:

1. **Agente próprio** (script com o Agent SDK + webhook/app). Mais controle, mas
   reescreve o que a action já faz: checagem de permissão do autor, restauração da
   config do Claude da base, MCP de comentário inline. Fica se a action limitar.
2. **Runner self-hosted na máquina do usuário** (pedido inicial, "agente local").
   O repo é público: um PR pode editar qualquer workflow para `runs-on: self-hosted`
   e rodar código na máquina. O GitHub recomenda não usar runner self-hosted em
   repo público, e minutos do `ubuntu-latest` não custam aqui (TDR-0008).
3. **Code Review gerenciado da Anthropic.** Sem controle do prompt nem do gate de
   nota, e sem o trail.
4. **API key em secret.** Mesmo crédito, mas é um segredo de longa duração para
   guardar e girar; o WIF emite token curto por run.
5. **Token da assinatura** (`claude setup-token`). Usa a cota da assinatura e
   deixaria o crédito da API expirar; o token é pessoal e de longa duração.

## Consequências

- Custo de revisão sai do crédito da API. Acabou o crédito ou a regra de
  federação mudou, a revisão falha fechada: sem nota, sem aprovação, merge manual
  pelo bypass de admin. Para voltar à assinatura, trocar os quatro IDs por
  `claude_code_oauth_token`.
- A regra de federação precisa aceitar o `sub` do OIDC de `pull_request_target`
  deste repo; se ela foi criada só para `push`, a troca de token falha.
- O Claude só tem ferramentas de leitura, `trail`, `gh pr diff/view` e o MCP de
  comentário inline. Sem `gh api`: com ele o bot poderia aprovar o próprio PR.
- Prompt injection no diff pode inflar a nota. Só roda em PR do próprio repo
  (quem tem escrita), e a nota 5/5 não pula os checks obrigatórios.
- O `greptile-approve.yml` foi removido nesta mudança: o Claude review é a única
  fonte da aprovação do ruleset.
- **Regra do usuário: acabou o crédito da API, volta para o runner self-hosted**
  (alternativa 2, com o token da assinatura). Como o repo é público, a troca vem
  com proteção: runner com label exclusivo (`claude-review`) usado só por este
  workflow, "Require approval for all external contributors" ligado em
  Settings → Actions, e o job continua em `pull_request_target`, só para PR do
  próprio repo.
- Um PR que cria ou muda o `claude-review.yml` não é revisado pela versão nova
  (o `pull_request_target` lê a `main`); vale a partir do merge.

## Backlog de pendências

- Usuário: instalar o Claude GitHub App no repo (https://github.com/apps/claude) e
  conferir que a regra WIF aceita `pull_request_target` deste repo.
- Validar no primeiro PR depois do merge (nota, comentários inline, aprovação) e
  no primeiro PR do Dependabot (workflow disparado por ele pode receber token só
  de leitura e não aprovar).
- Quando o crédito acabar: migrar para self-hosted conforme a regra acima.
