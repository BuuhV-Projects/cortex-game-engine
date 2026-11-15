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
- O job `build` (matriz Windows/macOS/Linux), depois de anexar os instaladores à release do engine, guarda
  `dist-app/*.exe`, `*.dmg` e `*.AppImage` como artefato do workflow (`installers-<os>`, 1 dia).
- O job `publish-public` (depois do `build`; roda mesmo se uma máquina falhar, só não se o workflow for cancelado)
  baixa os artefatos, gera um token novo do App para o repo público e cria nele, uma vez só, a release com a mesma
  tag, o nome `TS Cortex Studio <versão>`, `make_latest` e todos os instaladores. Um único job escreve no repo
  público: não há corrida de criação entre as máquinas.
- As notas são as do semantic-release sem os links do repo privado (`.github/scripts/public-notes.mjs`): o link de
  commit some (com o hash) e os de comparação, issue e PR viram só o texto. Teste em
  `tests/scripts/publicNotes.test.ts`.
- Links de download: `https://github.com/BuuhV-Projects/cortex-studio-releases/releases/latest`.

## Pré-requisitos (manuais, do dono)

1. Criar o repo público `BuuhV-Projects/cortex-studio-releases`.
2. Instalar o App `cortex-ci-release` nele com permissão de escrita em Contents.

Sem isso a conferência do job `release` falha antes do semantic-release: o push na `main` fica vermelho e nenhuma
release do engine sai até os dois existirem. Hoje os dois existem.

## Consequências

- A release do engine continua existindo (privada), com o CHANGELOG e os mesmos assets.
- O repo público não tem código: as tags lá apontam para o commit inicial dele, não para o engine.
