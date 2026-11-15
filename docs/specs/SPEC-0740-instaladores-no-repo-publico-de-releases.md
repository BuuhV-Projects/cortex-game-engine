# SPEC-0740 - Instaladores no repo público de releases

**Data:** 2026-11-14
**Status:** aceito

## Contexto

TDR-0015: o repo do engine fica privado e os instaladores continuam públicos num repo só de releases.

## Decisão

- Repo: `BuuhV-Projects/cortex-studio-releases` (público, só README e releases). Nome em `env.RELEASES_REPO`
  no topo do `release.yml`.
- O job `release` expõe as notas do semantic-release (`new_release_notes`).
- O job `build`, depois de anexar os instaladores à release do engine, gera um token do App restrito ao repo
  público (`create-github-app-token` com `owner` + `repositories`) e cria ou atualiza nele a release com a
  mesma tag, o mesmo nome e as notas, anexando `dist-app/*.exe`, `*.dmg` e `*.AppImage`. As três máquinas da
  matriz anexam à mesma release.
- Links de download: `https://github.com/BuuhV-Projects/cortex-studio-releases/releases/latest`.

## Pré-requisitos (manuais, do dono)

1. Criar o repo público `BuuhV-Projects/cortex-studio-releases`.
2. Instalar o App `cortex-ci-release` nele com permissão de escrita em Contents.

Sem isso o passo falha e o job de build fica vermelho; a release do engine e os instaladores anexados a ela
já terão saído.

## Consequências

- A release do engine continua existindo (privada), com o CHANGELOG e os mesmos assets.
- O repo público não tem código: as tags lá apontam para o commit inicial dele, não para o engine.
