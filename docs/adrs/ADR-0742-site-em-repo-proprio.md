# ADR 0742 - Site institucional em repositório próprio

**Data:** 2026-11-18
**Status:** aceito

## Contexto

O site institucional do engine (`web/`, pacote `cortex-web`) vivia dentro deste repo como
uma pasta independente: `node_modules` e `yarn.lock` próprios, fora dos workspaces, com os
scripts `build:web` e `dev:web` da raiz fazendo `cd web && ...`. O site passou a ter outro
papel: além da home e da documentação do engine, ele hospeda as páginas dos jogos
(`/games/<slug>/`), publicadas no Cloudflare Pages em `tscortexstudio.com`. Isso dá a ele
um ritmo de mudança próprio, que não tem relação com o do engine.

As alternativas eram estas:

1. **Manter `web/` aqui** e publicar a partir deste repo. Toda mudança de texto ou de
   página de jogo passaria pelo CI pesado do engine (testes, build nativo, revisor) e
   ocuparia a fila de PRs do engine. O Dependabot também seguiria varrendo a pasta.
2. **Virar workspace do yarn** na raiz. Isso acoplaria as dependências do site às do
   engine e Studio, sem ganho: o site não importa nada do engine.
3. **Repositório próprio** (`BuuhV-Projects/tscortexstudio-website`), com deploy próprio.

## Decisão

Opção 3. O site foi movido para `BuuhV-Projects/tscortexstudio-website` e este repo deixa
de tê-lo:

- sai a pasta `web/` e saem os scripts `build:web` e `dev:web` do `package.json`;
- sai o `/web` dos diretórios do npm no `.github/dependabot.yml` (TDR-0010);
- a linha do `web/` no mapa do `README.md` passa a apontar para o repo novo;
- o ADR-0025 ganha uma nota: a parte do site (i18n da landing e das docs) agora vive no
  repo novo.

## Consequências

- O CI e os PRs do engine deixam de receber as mudanças do site, e o site publica sem
  depender do engine.
- Uma mudança que mexa nos dois (por exemplo, a doc de uma API nova) vira dois PRs, um em
  cada repo.
- O histórico de `web/` até a extração fica neste repo. A partir daí ele continua no repo
  novo.
