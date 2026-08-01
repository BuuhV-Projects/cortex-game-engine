# 0175 - Capacidades da Steam no runtime (conquistas, stats, overlay) e publicação

**Data:** 2026-07-31
**Status:** aceito

Implementa o que a [ADR-0174](../adrs/ADR-0174-appid-da-steam-como-dado-de-projeto.md)
decidiu: com o app id virando dado de projeto, as capacidades da Steam deixam de
morar só no C++ e passam a ter contrato no JS. Esta spec descreve **o que o jogo
pode chamar**, **como o dado atravessa a fronteira nativa** e **como o build sobe
para a Steam**.

## Contexto

`native/src/core/steam.cpp` só fazia o ciclo de vida da API (init / callbacks /
shutdown). Nenhuma capacidade era acessível ao jogo: sem conquistas, sem stats,
sem overlay, sem nome do jogador. Um título publicável na Steam precisa das
conquistas no mínimo — é expectativa de loja, aparece no perfil do jogador e na
página do app.

Do lado da publicação, `native/steam/app_build.vdf` era um template com
`YOUR_APP_ID` / `YOUR_DEPOT_ID` e um `ContentRoot` relativo cravado, editado à mão
antes de cada upload. Nenhum upload real foi exercitado.

## Decisão

### 1. Fronteira nativa: globais `__cortexSteam*`

Novo shim `native/src/shims/steam_api.cpp` (registrado como os demais em
`native/src/shims/`), seguindo o padrão dos shims existentes: funções globais com
prefixo `__cortex`, tipos primitivos na fronteira, nada de objetos complexos.

| Global | Retorno | Papel |
| --- | --- | --- |
| `__cortexSteamAvailable()` | `boolean` | `SteamAPI_Init` deu certo e as interfaces estão vivas |
| `__cortexSteamAppId()` | `number` | app id efetivo (`0` = sem Steam) |
| `__cortexSteamSetAchievement(id)` | `boolean` | `SetAchievement` |
| `__cortexSteamClearAchievement(id)` | `boolean` | `ClearAchievement` (dev/reset) |
| `__cortexSteamGetAchievement(id)` | `boolean` | já desbloqueada? |
| `__cortexSteamSetIntStat(name, v)` | `boolean` | `SetStat` (int) |
| `__cortexSteamSetFloatStat(name, v)` | `boolean` | `SetStat` (float) |
| `__cortexSteamGetIntStat(name)` | `number` | `GetStat` (int); `0` se falhar |
| `__cortexSteamGetFloatStat(name)` | `number` | `GetStat` (float); `0` se falhar |
| `__cortexSteamStoreStats()` | `boolean` | `StoreStats` — envia ao servidor |
| `__cortexSteamPlayerName()` | `string` | `GetPersonaName`; `''` sem Steam |
| `__cortexSteamPlayerId()` | `string` | SteamID64 como texto (não cabe em `number`); `''` sem Steam |
| `__cortexSteamLanguage()` | `string` | `GetCurrentGameLanguage` (ex.: `brazilian`); `''` sem Steam |
| `__cortexSteamOverlayActive()` | `boolean` | overlay aberto agora? |
| `__cortexSteamOpenOverlay(page)` | `boolean` | `ActivateGameOverlay` |

Notas de contrato:

- **`RequestCurrentStats` não é chamado.** O SDK 1.65 marca a função como não mais
  necessária (`isteamuserstats.h:92`): o cliente Steam sincroniza stats e
  conquistas **antes** do processo do jogo começar. Os getters funcionam já no
  primeiro frame.
- **Toda função é no-op segura sem Steam.** Sem `CORTEX_STEAM`, sem cliente Steam
  rodando ou com `SteamUserStats()` nulo, cada função devolve o valor neutro
  (`false` / `0` / `''`) em vez de lançar. Um jogo com conquistas roda igual no
  export PC puro.
- **`SteamID64` viaja como string.** Não cabe em `double` sem perda.
- **O estado do overlay é lido por polling**, não por callback na fronteira. O
  host mantém um `bool` atualizado pelo callback `GameOverlayActivated_t` (já
  bombeado pelo `RunCallbacks` que roda por frame) e o JS consulta quando quiser.
  Evita agendar chamadas JS a partir de callback nativo — a fronteira continua
  unidirecional, como no resto do host.

### 2. Fachada do engine: `src/core/steamworks.ts`

Objeto único `Steam`, exportado por `src/index-runtime.ts` e registrado em
`VENDOR_TYPE_MODULES` (`electron/main.ts`) para o Monaco resolver o tipo.

```ts
Steam.isAvailable(): boolean
Steam.appId(): number
Steam.unlockAchievement(id: string): boolean
Steam.clearAchievement(id: string): boolean
Steam.hasAchievement(id: string): boolean
Steam.setIntStat(name: string, value: number): boolean
Steam.setFloatStat(name: string, value: number): boolean
Steam.getIntStat(name: string): number
Steam.getFloatStat(name: string): number
Steam.storeStats(): boolean
Steam.player(): SteamPlayer | null      // { name, id }
Steam.language(): string
Steam.isOverlayActive(): boolean
Steam.openOverlay(page?: SteamOverlayPage): boolean
```

- **No Studio e no browser as globais não existem** — a fachada detecta e vira
  no-op, logando por `debug('steam', …)`. Autorar conquistas no Studio nunca
  quebra; elas simplesmente não disparam fora do export Steam.
- `SteamOverlayPage` é uma união de literais (`'friends' | 'community' |
  'players' | 'settings' | 'achievements' | 'stats'`) — o SDK aceita strings
  fixas, e a união evita string mágica na chamada.
- **`unlockAchievement` não persiste sozinha.** `SetAchievement` só marca em
  memória; `storeStats()` é o que envia (e é o que faz o *toast* aparecer). A
  fachada **não** chama `storeStats` a cada unlock de propósito — desbloquear
  cinco conquistas num fim de fase deve custar um envio, não cinco. A receita
  documentada é: desbloqueia o que precisar, `storeStats()` uma vez no fim.

### 3. Steam Cloud via Auto-Cloud (sem código)

Os saves já vão para uma pasta por-usuário do SO: `user_storage.cpp` chama
`SDL_GetPrefPath(<id do jogo>, "saves")`, que no Windows resolve para
`%APPDATA%\<id>\saves\`. Isso é exatamente o que o **Steam Auto-Cloud** consome,
então não há código a escrever — a configuração é no painel do Steamworks
(*Steam Cloud → Auto-Cloud*):

| Campo | Valor |
| --- | --- |
| Root Path | `WinAppDataRoaming` |
| Subdirectory | `<id do jogo>/saves` |
| Pattern | `*` |

`<id do jogo>` é o `id` do `cortex.json` (ADR-0126), não o nome de exibição.
Preferimos Auto-Cloud a `ISteamRemoteStorage` porque a API exigiria reescrever o
caminho de escrita do host — que hoje é único e serve também PC puro e console
(onde vira XGameSave). Auto-Cloud mantém um só backend de save.

### 4. Publicação: `native/scripts/steam-upload.mjs`

Substitui a edição manual do `.vdf`. O script gera o `app_build.vdf` a partir do
export e chama o `steamcmd`:

```
node native/scripts/steam-upload.mjs <distDir> --depot <id> [--branch <nome>]
                                     [--desc <texto>] [--dry-run]
```

- O **app id sai do `cortex.json` do próprio `distDir`** — o mesmo que o host vai
  usar em runtime. Não há como subir um build para um app diferente do que ele se
  diz ser.
- O `.vdf` é gerado em pasta temporária com `ContentRoot` **absoluto** (o
  relativo do template era frágil a partir de qualquer cwd).
- `--dry-run` gera e imprime o `.vdf` sem chamar o `steamcmd` — é como se valida o
  fluxo sem credencial de parceiro.
- Sem `--branch`, o build sobe **sem** ser publicado em nenhum branch (`setlive`
  vazio): publicar continua sendo ato deliberado no painel.
- O `steamcmd` **não é vendorizado** — é baixado pelo usuário (vem em
  `sdk/tools/ContentBuilder/`). O script erra com mensagem acionável se não o
  achar no `PATH` ou em `--steamcmd <caminho>`.

### 5. SDK 1.65

`native/third_party/steamworks` sobe de **v1.64** (11/mar/2026) para **v1.65**
(23/jul/2026). Só `public/` e `redistributable_bin/` são vendorizados — os
exemplos (`steamworksexample/`, `glmgr/`) e as ferramentas (`tools/`, que incluem
o ContentBuilder de dezenas de MB) ficam fora do repo. A 1.65 remove
`IsRunningOnSteamDeck()` em favor de `IsRunningOnSteamHardware()`; não usávamos
nenhuma das duas, então a troca não quebra nada.

## Consequências

- **Um jogo do Studio pode ter conquistas** sem tocar em C++ — preenche o app id,
  cadastra as conquistas no painel do Steamworks e chama `Steam.unlockAchievement`.
- **Os ids de conquista não são validados em build.** Um typo em
  `unlockAchievement('WORLD_l_DONE')` devolve `false` em runtime e não desbloqueia
  nada. Mitigação recomendada ao jogo: declarar os ids como `const` num módulo só,
  como o teste4 já faz com chaves de save.
- **O overlay depende do backend gráfico.** O overlay da Steam faz hook em
  D3D12/Vulkan; o host renderiza por wgpu → D3D12, então deve funcionar, mas isso
  **ainda não foi verificado com o cliente Steam real** — está fora do que esta
  mudança valida. `isOverlayActive()` devolve o estado que a Steam reportar; se o
  overlay não abrir, devolve `false` sempre e o jogo segue.
- **Auto-Cloud é configuração de painel**, então não há teste automatizado
  cobrindo-a. O que o repo garante é o caminho de escrita (já coberto pelos testes
  do `user_storage`).
- **Conquistas não são retroativas.** Quem já jogou antes do cadastro só
  desbloqueia ao repetir o gatilho — a menos que o jogo faça um *sweep* no save
  ao iniciar. Fica a critério de cada jogo.
