# 0126 - Identidade do jogo (nome + ícone) data-driven no cortex.json

**Data:** 2026-07-19
**Status:** aceito

## Contexto

O export nativo (ADR-0101) nomeava o executável a partir do **nome da pasta** do
projeto: `D:\jogos\teste4` → `teste4.exe`. Isso tinha três problemas:

1. O nome do arquivo do jogo era o slug de desenvolvimento (`teste4`), não um
   nome de produto ("Cute Obstacle Rush"). Aparecia assim no Explorer, no título
   da janela (na verdade, o título estava até `cortex-native (M0)` cravado) e
   seria assim em "Meus Programas".
2. Não havia lugar para o usuário **registrar** o nome do jogo — nem um campo, nem
   UI. O `cortex.json` existia só com `{ engine }` (write-only, nunca lido).
3. O mesmo nome precisa servir **PC e console** (GDK `DefaultDisplayName`), sem
   duplicação.

Além disso, o host nativo derivava a **pasta de saves** do usuário do basename do
exe (`teste4.exe` → `<appdata>/teste4/saves/`). Fixar o exe (item da Decisão)
faria todos os jogos exportados colidirem os saves na mesma pasta.

## Decisão

**O `cortex.json` passa a carregar a identidade do jogo**, lida por todo o
pipeline (fonte única):

```json
{
  "engine": "cortex-game-engine",
  "id": "teste4",
  "name": "Cute Obstacle Rush",
  "icon": "branding/icon.png"
}
```

- **`id`** — slug **estável** (= nome da pasta na criação). Chaveia os **saves**.
  Nunca muda, mesmo que o usuário renomeie o `name` — renomear a exibição não
  pode orfanar saves nem colidir entre jogos.
- **`name`** — nome de **exibição**. Título da janela, "Meus Programas",
  `DefaultDisplayName` do console. Editável.
- **`icon`** — PNG-fonte único (fase do ícone: deriva `.ico` do launcher e logos
  do console). Fica **fora** do runtime (uso só de export).

**O executável exportado é FIXO: `launcher.exe`** (não mais `<pasta>.exe`). O
nome do jogo é dado de exibição, desacoplado do nome do arquivo.

Resolução com fallback (compat com projetos antigos que só têm `{ engine }`):
`id = cortex.id ?? slug-da-pasta`; `name = cortex.name ?? id`. Implementada em
dois lugares que se espelham (mesmas regras, testadas):
- `native/scripts/game-config.mjs` (`readGameConfig`) — export + Studio.
- `native/src/core/game_config.cpp` (`loadGameConfig`) — runtime do host, com um
  extrator mínimo de string do JSON plano (sem dependência de lib JSON).

Consumidores:
- **Export** (`export-game.mjs`): copia um `cortex.json` **resolvido** (id/name
  garantidos) pro `dist-native/`; nomeia o exe `launcher.exe`; passa `name` como
  `DefaultDisplayName` ao GDK.
- **Host nativo** (`main.cpp`): lê `cortex.json` ao lado do exe → `id` nomeia a
  pasta de saves, `name` vira o título da janela (`SDL_SetWindowTitle`).
- **Instalador** (`make-installer.mjs`/`installer.nsi`): `name` nos rótulos
  (atalho, Adicionar/Remover), `id` na pasta de instalação e chave de
  desinstalação (estável), exe = `launcher.exe`.
- **Studio**: IPC `project:readConfig`/`project:writeConfig` + uma UI
  "Configurações do jogo" (nome + ícone) — o `id` não é editável.

## Consequências

- O nome do jogo é registrado UMA vez e serve PC + console + saves + instalador.
- **Saves preservados** na transição: um projeto exportado antes como
  `teste4.exe` tinha saves em `.../teste4/`; agora o host lê `id: "teste4"` do
  cortex.json resolvido → mesma pasta. Sem `id` (fallback), cai no basename —
  que em dev (`host.exe <dir>`) ainda é `teste4`.
- **Trap fechada:** o exe fixo só é correto porque o host parou de chavear saves
  pelo nome do exe. As duas mudanças (fixar exe + host ler `id`) são atômicas —
  nunca entram separadas.
- O host ganha uma leitura de arquivo no boot (cortex.json, alguns bytes) — custo
  desprezível; sem lib JSON nova (extrator de campo string dedicado, testado
  compilando isolado com MSVC).
- Projetos antigos continuam funcionando sem migração (fallback pro slug); ao
  abrir as Configurações do jogo no Studio e salvar, ganham `id`/`name`
  explícitos.
- Pendências desta linha em ADRs próprios: **ícone** (PNG → `.ico` embutido no
  launcher + logos do console) e a **UI** no Studio.
