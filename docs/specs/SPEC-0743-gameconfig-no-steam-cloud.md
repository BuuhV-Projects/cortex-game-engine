# SPEC-0743 - `GameConfig` no Steam Cloud

**Data:** 2026-11-18
**Status:** implementado
**ADR:** ADR-0744

## Contexto

Rodando pela Steam, o jogo quer que o `config.ini` e o `save.ini` fiquem na nuvem da Steam, sincronizados, e não na
pasta do jogo. A decisão de usar a API de Remote Storage (e não o Auto-Cloud) está no ADR-0744.

## Decisão

### Host nativo

`native/src/core/steam_cloud.{h,cpp}` (no-op sem `CORTEX_STEAM`, como o resto da Steam):

| Função | Faz | Sem Steam |
| --- | --- | --- |
| `steamCloudAvailable()` | Steam inicializada e `SteamRemoteStorage()` vivo | `false` |
| `steamCloudRead(name, &out)` | `FileExists` + `GetFileSize` + `FileRead`; `false` se ausente ou leitura curta | `false` |
| `steamCloudWrite(name, data)` | `FileWrite` (síncrono, no cache local da Steam) | `false` |
| `steamCloudDelete(name)` | `FileDelete` (apaga local e na nuvem) | `false` |

O nome passa pelo mesmo filtro do `__cortexWriteBaseFile`: sem `/`, `\`, `:` nem `..` (só arquivo na raiz do espaço do
app). Nome vazio depois do filtro é recusado.

`native/src/shims/steam_api.cpp` publica:

- `__cortexSteamCloudAvailable()` → `boolean`
- `__cortexSteamCloudRead(name)` → `string | null` (`null` = ausente ou sem Steam)
- `__cortexSteamCloudWrite(name, text)` → `boolean`
- `__cortexSteamCloudDelete(name)` → `boolean`

### Fachada TS

`src/core/steamCloud.ts` exporta `SteamCloud` com `isAvailable()`, `read(name)`, `write(name, text)` e
`remove(name)`, no-op seguro sem a ponte (`false`/`null`), exportado pelo `index-runtime`.

### `GameConfig`

- `load(file)`: com `SteamCloud.isAvailable()`, lê `SteamCloud.read(file)`. Achou: é a config (o arquivo ao lado do exe
  e o overlay do `localStorage` não entram). Não achou: segue o caminho de antes (`fetch` do arquivo), que vira a
  semente da nuvem.
- `save()`: com a nuvem disponível, grava por `SteamCloud.write(file, text)`. Se falhar, loga (`debug('config', …)`) e
  cai no caminho de antes (`__cortexWriteBaseFile`, ou `localStorage` em dev).
- Sem a nuvem, o comportamento é o da SPEC-0124, sem mudança.

### Fluxo pela Steam

1. A Steam baixa os arquivos da nuvem para `<Steam>/userdata/<conta>/<appid>/remote/` antes de abrir o jogo (ou mostra o
   conflito, se duas máquinas divergiram).
2. O jogo lê e grava por `GameConfig`, que vai ao Remote Storage.
3. Ao fechar o jogo, a Steam sobe o que mudou.

### Painel do Steamworks (fora do código)

No app: **Steam Cloud → ligar**, com a cota de bytes e de arquivos por usuário (os `.ini` somam poucos KB; 1 MB e 10
arquivos sobram).

## Testes

- `tests/core/steamCloud.test.ts`: a fachada com e sem a ponte.
- `tests/i18n/GameConfigCloud.test.ts`: `load` pela nuvem, semente do arquivo quando a nuvem não tem, `save` na nuvem
  sem tocar no `__cortexWriteBaseFile`, e a queda para o arquivo quando a gravação na nuvem falha.

## Consequências

Ver ADR-0744. O mapa do host nativo (`docs/cortex-native/architecture.md`) e o da engine registram a ponte nova.
