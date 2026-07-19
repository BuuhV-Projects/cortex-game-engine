# 0127 - Ícone + identidade embutidos no launcher.exe do export

**Data:** 2026-07-19
**Status:** aceito

## Contexto

A ADR-0126 deu ao jogo um nome de exibição e um exe fixo (`launcher.exe`), mas o
exe ainda saía com o **ícone e a identidade padrão do host** (`cortex_host.exe`):
no Explorer aparecia o ícone genérico, e as Propriedades/Gerenciador de Tarefas
não mostravam o nome do jogo. Faltava o passo de **marca** no export: pegar o
ícone-fonte do jogo e cravá-lo no executável.

Requisito do usuário: registrar **um** ícone (PNG) e o export deriva o resto.

## Decisão

Novo passo no export (`native/scripts/embed-icon.mjs`, chamado pelo
`export-game.mjs`): quando o `cortex.json` declara `icon` (PNG-fonte relativo ao
projeto), o export

1. deriva um `.ico` **multi-tamanho** do PNG com **png-to-ico** (redimensiona pros
   tamanhos padrão do Windows — 16/32/48/256), e
2. embute no `launcher.exe` — ícone + `ProductName`/`FileDescription` (= nome de
   exibição) + `file-version`/`product-version` — com **rcedit**.

Regras:

- **Best-effort:** falha (PNG inválido, libs ausentes) **não derruba** o export —
  loga o motivo e o exe fica com o ícone/identidade padrão do host.
- **`file-version` é obrigatório:** sem o `VS_FIXEDFILEINFO`, o rcedit grava a
  string table de um jeito que o Windows **não lê** (medido — `ProductName`
  voltava vazio). Default `1.0.0.0` até o Studio expor versionamento do jogo.
- As libs (**png-to-ico 2.1.8**, **rcedit 4.0.1**) vivem no **toolchain de
  export** (`native/export-toolchain`, TDR-0003), não no runtime do jogo. Ambas
  pinadas. O `embed-icon.mjs` resolve o toolchain nos dois layouts (dev:
  `../export-toolchain/node_modules`; empacotado: `../../node_modules`).

## Consequências

- O `launcher.exe` sai com o ícone do jogo e o nome nas Propriedades/Gerenciador
  de Tarefas, sem o usuário mexer em nada além de apontar um PNG.
- **Windows-only** (rcedit é um .exe; png-to-ico é JS puro sobre pngjs). Combina
  com o export ser Windows-only (TDR-0003). Fora do Windows o passo é pulado.
- `rcedit@4.0.1` está marcado como *deprecated* no npm (sem novas features), mas
  é a ferramenta comprovada de gravar recurso de versão legível pelo Windows —
  o resedit (JS puro) gravava um version resource que o `FileVersionInfo` do
  Windows **não** lia (medido). Se o rcedit sumir do registro, trocar por resedit
  exige resolver isso.
- **Pendências:** os logos do **console (GDK)** ainda são placeholder sólido — o
  `icon` vai alimentá-los numa fase futura (console é M3/M4, não shippável). O
  **atalho na área de trabalho** com esse ícone virá com o instalador (o
  `installer.nsi` já aponta o `DisplayIcon`/atalho pro `launcher.exe`, que agora
  tem o ícone embutido). A **UI** no Studio pra escolher o PNG é a próxima fase.
- Versionamento do jogo fixo em `1.0.0.0` — quando o Studio expuser versão, ela
  passa a alimentar `file-version`/`product-version` aqui.
