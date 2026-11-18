# 0015 - Repo privado: instaladores num repo público e auto-merge próprio

**Data:** 2026-11-14
**Status:** aceito

## Contexto

O repositório do engine vai ficar privado, mas os instaladores do Studio precisam continuar baixáveis por
qualquer pessoa. Release de repo privado é privada: o asset devolve 404 sem login com acesso ao repo.

Além disso, num repo privado do plano Free do GitHub o ruleset "Protecao do main" deixa de ser aplicado e o
auto-merge nativo some. É o mesmo cenário do `ddd00-game`, que resolveu com um workflow de auto-merge próprio
(SPEC-0078/0094/0098/0102/0126/0235 de lá).

## Decisão

1. **Instaladores num repo público só de releases** (`BuuhV-Projects/cortex-studio-releases`, SPEC-0740). O
   `release.yml` continua cortando a versão no repo do engine (semantic-release, CHANGELOG, tag) e, no build,
   cria a mesma release no repo público com as notas da versão e anexa os instaladores. O token é o do GitHub
   App `cortex-ci-release` (TDR-0006), restrito a esse repo.
2. **Auto-merge próprio** (`.github/workflows/auto-merge.yml`, SPEC-0739), portado do `ddd00-game`: mergeia
   quando os checks obrigatórios estão verdes, o Claude review deu 5/5 e todas as conversas estão resolvidas,
   tudo no head. Mantém a pilha de PRs (TDR-0014): só mergeia na `main` e redireciona os dependentes.
3. **O merge sai com o token do App**, não com o `GITHUB_TOKEN`: merge feito pelo `GITHUB_TOKEN` não dispara o
   `push` na `main`, e é no push que o `release.yml` roda.

### Alternativas consideradas

- **Download pelo Cloudflare (R2/Pages).** Funciona e tira o download do GitHub, mas a página de versões, a URL
  "latest" e as notas viram manutenção própria. Rejeitado por ora.
- **Assinar um plano pago do GitHub** para manter ruleset e auto-merge nativo em repo privado. Resolve o
  auto-merge, mas não o download público. Fica a critério do dono; este TDR não depende disso.
- **Mergear com o `GITHUB_TOKEN`, como o ddd00.** Lá não há release no push; aqui pararia o semantic-release.

## Consequências

- Sem plano pago, o GitHub não impede merge manual fora das condições: o gate passa a ser o workflow.
- O `strict_required_status_checks_policy` (branch atualizada com a `main`) não é reproduzido, igual ao ddd00.
- Repo privado no Free tem cota de minutos de Actions (Windows conta em dobro): o host nativo em
  `windows-latest` do `pr.yml` e do release consome a cota.
- O repo público precisa existir e o App precisa estar instalado nele antes da primeira release.
- Os links de download (site, README) apontam para o repo público.
