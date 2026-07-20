# SPEC-0128 - UI "Configurações do jogo" no Studio (nome + ícone)

**Data:** 2026-07-19
**Status:** aceito

## Contexto

As ADRs 0126/0127 puseram a identidade do jogo (`name`/`icon`) no `cortex.json`
e fizeram export/host/instalador consumirem — mas não havia **onde o usuário
registrar** isso no Studio. O `cortex.json` só era escrito na criação do projeto
(`fs:createProject`) e nunca lido. Faltava a ponta de UI.

## Decisão

Um item **"Configurações do jogo…"** no topo do menu **Projeto**
(`Shell.ts`) abre o **`ProjectSettingsModal`** (molde do `ExportProgressModal`:
`<dialog>.showModal()`, DOM à mão, i18n via `t()`), com:

- **Nome do jogo** — texto, pré-preenchido com o `name` resolvido.
- **Ícone** — preview + "Escolher PNG…" (diálogo de arquivo) + "Remover". O PNG
  escolhido é **copiado pra dentro do projeto** em `branding/icon.png` (o `icon`
  do cortex.json fica relativo — não um caminho absoluto que quebra se o projeto
  mudar de lugar).
- **Nota**: o atalho na área de trabalho virá com o instalador, com o mesmo
  ícone.

Suporte novo:

- IPC `project:readConfig` / `project:writeConfig` (identidade resolvida; `id` e
  `engine` preservados — `id` **não** é editável, é a chave de saves).
- IPC `dialog:openImage` (escolhe PNG) + `project:importIcon` (copia pro
  projeto, devolve o relativo).
- `fs:createProject` passa a gravar `id` + `name` já na criação.
- i18n `gameSettings.*` (pt/en) + `menu.game_settings`.

Ao salvar, dispara `project-config-saved` no `document` pra Studio reagir (ex.:
rótulo do projeto).

## Consequências

- O usuário registra nome + ícone uma vez, no Studio; o resto do pipeline
  (export → launcher.exe, host → título/saves, instalador → atalhos) já consome
  (ADR-0126/0127).
- O `id` não aparece na UI de propósito — renomear o display nunca mexe nos
  saves. Se um dia precisar renomear o `id`, será um fluxo à parte (migra saves).
- `branding/icon.png` entra no projeto (versionável). Remover o ícone só desfaz a
  referência no cortex.json; o arquivo fica (limpeza manual) — simples e sem
  risco de apagar algo do usuário.
- A UI foi validada isolada (harness estático + screenshot headless) contra o CSS
  real do Studio antes de integrar.
- **Pendências herdadas**: versionamento do jogo (hoje `1.0.0.0` fixo no
  SPEC-0127) e logos do console derivados do ícone — quando entrarem, ganham
  campos aqui.
