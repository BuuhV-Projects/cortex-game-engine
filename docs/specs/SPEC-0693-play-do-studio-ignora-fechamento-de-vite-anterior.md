# SPEC-0693 - Play do Studio ignora o fechamento de um vite anterior

**Data:** 2026-11-05
**Status:** aceito

## Contexto

Em `yarn electron:dev`, ao abrir um projeto o Console do Studio imprimia
"■ Projeto parado." e **só depois** "VITE v7 ready … Local: http://localhost:5174/".
O servidor subia, mas o Preview ficava no estado "parado" (placeholder de falha,
botão em Play), e o botão Stop deixava de matar o vite.

Causa, no handler `run:start` do processo main:

1. Se já existe um `runningProcess`, ele é morto (`taskkill /T /F`) e um vite
   novo é spawnado.
2. O evento `close` do vite **antigo** chega de forma assíncrona, depois do novo
   já estar rodando. O handler fazia `runningProcess = null` e enviava
   `project:stopped` ao renderer **sem checar de qual processo o evento veio**.
3. No renderer, `BottomPanel` imprimia "Projeto parado." e `Preview.handleStopped`
   marcava `running = false`, zerava a URL e trocava o palco pelo placeholder.
   Quando o "Local:" do vite novo chegava, o Preview já achava que o projeto
   estava parado.
4. Pior: o `runningProcess` novo ficava **órfão** (zerado pelo `close` do
   antigo). `run:stop` não tinha mais o que matar e só o `killPort` do próximo
   Play limpava a porta.

O segundo `run:start` com um vite ainda vivo acontece sobretudo em dev: o
electron-vite recarrega o renderer, o `Preview` nasce com `running = false`, o
`FileTree` restaura o projeto e dispara `project-open`, e o `toggle()` chama
`runProject` enquanto o vite do carregamento anterior continua vivo no main. Em
build empacotado o renderer não recarrega, por isso o sintoma aparecia "só em
dev" — mas o mesmo bug afeta qualquer Play disparado com o anterior vivo.

## Decisão

### 1. Guarda de identidade no ciclo de vida do vite (`ProjectRunner`)

O main passa a tratar o processo do Play numa classe `ProjectRunner`
(`electron/main/projectRunner.ts`), com o processo corrente como estado único:

- `start(projectDir)`: mata o corrente (se houver), libera a porta e spawna o
  vite novo. Os listeners de `stdout`/`stderr`/`close` do filho **comparam o
  filho com o corrente** antes de agir: saída ou fechamento de um processo que
  **não é mais o corrente** é ignorada — nada de "Projeto parado." falso, nada
  de log velho no Console do Play novo, e o corrente nunca é zerado por um
  processo anterior.
- `stop()`: mata o corrente, emite `project:stopped` na hora (o `close` pode
  atrasar/não disparar após kill) e libera a porta.
- `killForQuit()`: usado no `before-quit` — mata sem avisar o renderer e libera
  a porta.

As dependências (spawn, envio ao renderer, kill de árvore, liberação de porta,
leitura da porta do `vite.config.ts`) são injetadas, o que torna a corrida
testável com filhos falsos (`tests/electron/projectRunner.test.ts`).

### 2. Divisão do `electron/main.ts` (regra das 500 linhas)

O `main.ts` tinha 2094 linhas. Tocar nele exige refatorar na mesma mudança
(SPEC-0668), então o arquivo foi dividido **por responsabilidade** em
`electron/main/`, sem mudar canal IPC, comportamento ou mensagens:

| Módulo | Conteúdo |
| --- | --- |
| `shared.ts` | `validatePath`, `envForSpawn`, `ensureGitignoreEntry`, `resourceBase`, referência à janela principal (`sendToRenderer`) e projeto ativo |
| `window.ts` | splash + `createWindow` (hardening, `window:*`, `devtools:toggle`, `app:is-dev`) |
| `fsIpc.ts` | `fs:*` (listar, ler, escrever, mover, apagar, criar, watcher) |
| `vendorTypeModules.ts` | a lista `VENDOR_TYPE_MODULES` |
| `engineVendor.ts` | `vendorEngine`, `fs:createProject`, `engine:revendor`, `engine:readTypes`, doc da API do engine |
| `exportIpc.ts` | `export:native`, `shell:openPath` |
| `projectConfigIpc.ts` | `cortex.json` (`project:readConfig/writeConfig/importIcon`), `dialog:openImage`, pacotes de textura |
| `installerIpc.ts` | `installer:check/setup` (Tauri) |
| `prefsDialogsIpc.ts` | `prefs:*`, `dialog:confirm/error/info/openDirectory` |
| `projectRunner.ts` | Play (`run:start/stop`) — item 1 |
| `terminalIpc.ts` | terminal embutido (`terminal:run/stop`) |
| `characterRigIpc.ts` | `characterRig:run/stop` |
| `chatStore.ts` | histórico do chat, session id do SDK, imagens coladas |
| `agentIpc.ts` | `project:setActive`, `ai:*` |
| `appMenu.ts` | menu nativo + `menu:rebuild` |

`main.ts` fica com o bootstrap: identidade de dados, instância única, higiene de
cache, registro dos módulos (no import, como antes — os testes dependem disso) e
ciclo de vida (`whenReady`, `before-quit`, `window-all-closed`).

## Consequências

- O estado do Play no renderer passa a refletir só o processo corrente: o
  Console mostra "Projeto parado." apenas quando o Play de fato parou, e Stop
  sempre mata o vite que está rodando.
- Um reload do renderer em dev continua disparando um segundo `run:start`
  (comportamento do `Preview`, fora desta spec); agora ele só troca o vite,
  sem efeito colateral visível além do restart do dev server.
- Quem procura um handler IPC do main abre o módulo da área em
  `electron/main/` em vez de um arquivo de 2 mil linhas. Testes que lêem o
  texto do `main.ts` (`vendorTypeModules.test.ts`, `appIdentity.test.ts`)
  apontam para os módulos novos.
- Os testes que importam `electron/main.ts` inteiro (`electron-main.test.ts`,
  `singleInstance`, `userDataPath`) continuam válidos: o grafo é o mesmo, só
  espalhado em arquivos.
