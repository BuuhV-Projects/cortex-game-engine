# SPEC-0740 - Instaladores no repo público de releases

**Data:** 2026-11-14
**Status:** aceito

## Contexto

TDR-0015: o repo do engine fica privado e os instaladores continuam públicos num repo só de releases.

## Decisão

- Repo: `BuuhV-Projects/cortex-studio-releases` (público, só README e releases). Nome em `env.RELEASES_REPO`
  no topo do `release.yml`.
- O job `release`, antes do semantic-release, gera um token do App restrito ao repo público
  (`create-github-app-token` com `owner` + `repositories`) e lê o repo com ele (`gh api repos/...`). Faltando o
  repo ou a instalação do App, o job para ali e nenhuma release do engine sai.
- Com release nova, o mesmo job cria a release no repo público, uma vez, com a mesma tag, o nome
  `TS Cortex Studio <versão>`, as notas do semantic-release e `make_latest`. O passo tem `continue-on-error`: a tag
  do engine já saiu, e uma falha nele não pode pular o `build` (um re-run não refaz a release).
- O job `build`, depois de anexar os instaladores à release do engine, gera um token novo (o do `release` pode ter
  expirado durante o build) e anexa `dist-app/*.exe`, `*.dmg` e `*.AppImage` à release pública que já existe. As
  três máquinas da matriz só anexam: nenhuma cria a release, então não há corrida de criação. Se a criação do job
  `release` falhou, o `build` a cria com o mesmo nome e as mesmas notas (as saídas `version` e `notes` do `release`). Nesse caso raro as três máquinas podem tentar criar a mesma
  release ao mesmo tempo; o `softprops/action-gh-release` trata a criação que já existe como atualização.
- Links de download: `https://github.com/BuuhV-Projects/cortex-studio-releases/releases/latest`.

## Pré-requisitos (manuais, do dono)

1. Criar o repo público `BuuhV-Projects/cortex-studio-releases`.
2. Instalar o App `cortex-ci-release` nele com permissão de escrita em Contents.

Sem isso a conferência do job `release` falha antes do semantic-release: o push na `main` fica vermelho e nenhuma
release do engine sai até os dois existirem. Hoje os dois existem.

## Consequências

- A release do engine continua existindo (privada), com o CHANGELOG e os mesmos assets.
- O repo público não tem código: as tags lá apontam para o commit inicial dele, não para o engine.
