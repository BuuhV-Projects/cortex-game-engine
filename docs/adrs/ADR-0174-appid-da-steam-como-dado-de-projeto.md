# 0174 - App ID da Steam é dado do projeto, não constante de compilação

**Data:** 2026-07-31
**Status:** aceito

## Contexto

A integração com a Steam existe desde o M1 do host nativo: `native/src/core/steam.cpp`
faz `SteamAPI_RestartAppIfNecessary` + `SteamAPI_Init` no boot, `RunCallbacks` por
frame e `Shutdown` no fim, e o `export-game.mjs --steam` monta o `dist-native/`
com a `steam_api64.dll`. O que faltava não era a fundação — era o **caminho pelo
qual um jogo declara QUAL app ele é**.

Hoje o app id entra como **constante de compilação**:

```cmake
set(CORTEX_STEAM_APPID "" CACHE STRING "App id da Steam (vazio = 480/Spacewar)")
target_compile_definitions(cortex_host PRIVATE CORTEX_STEAM_APPID=${CORTEX_STEAM_APPID})
```

e o `steam.cpp` cai em `#define CORTEX_STEAM_APPID 480` quando ninguém define. Isso
tem três consequências ruins, e a primeira é fatal para o produto:

1. **Publicar exige recompilar o host C++.** O Studio distribui um host
   pré-buildado (TDR-0003); o usuário do Studio não tem CMake, Ninja, clang-cl nem
   o Steamworks SDK. Do jeito que está, "informar o meu app id" significa montar o
   ambiente de build C++ do engine — o que na prática torna o export Steam
   inacessível para quem só usa o Studio.
2. **Um host por jogo.** Sendo constante de compilação, dois jogos diferentes
   precisariam de dois `build-steam/` distintos. O host é deliberadamente genérico
   (o `id`/`name` do jogo já vêm do `cortex.json` em runtime, ADR-0126) — o app id
   ser a única exceção quebra essa propriedade.
3. **Falha silenciosa e cara.** Sem `-DCORTEX_STEAM_APPID`, o build cai no 480
   (Spacewar) **sem avisar**. O export sai, sobe pelo SteamPipe e só quebra na mão
   do jogador — conquistas e cloud indo para o app errado.

### Onde a Steam quer o app id?

Vale registrar porque a pergunta aparece sempre. **A Steam não define um lugar
canônico onde o jogo guarda o próprio app id em produção.** O SDK 1.65 diz:

- `steam_appid.txt` ao lado do exe é explicitamente **de desenvolvimento** — o
  header (`steam_api.h:114`) descreve o arquivo como "present in your game's
  directory (for development)". A Valve orienta **removê-lo do release**: se ele
  for junto, **sobrepõe** o app id que o cliente Steam informa, o que permite
  publicar com o id errado sem perceber e faz o jogo rodar fora da Steam.
- **Em produção o app id vem do cliente Steam**, injetado no ambiente do processo
  quando ele lança o jogo. `SteamAPI_Init()` o descobre sozinho.
- A **única** função que precisa do número literal vindo de dentro do jogo é
  `SteamAPI_RestartAppIfNecessary(unOwnAppID)` (`steam_api.h:119`), que roda
  *antes* do init justamente para relançar via Steam quem abriu o `.exe` direto.

Ou seja: a escolha nunca foi "arquivo da Steam vs arquivo nosso". É **código vs
dado** — e hoje está em código.

### Alternativas pesadas

- **Manter em compile-time e documentar.** Zero trabalho, mas mantém o export
  Steam fora do alcance do usuário do Studio. Descartada: derrota o propósito de
  ter um Studio.
- **Arquivo `steam_appid.txt` como fonte de verdade do projeto.** Reaproveita um
  arquivo que a Steam já entende. Descartada: é um arquivo de dev que *não pode*
  ir no release, então o dado sumiria exatamente no build que importa; e um
  arquivo de uma linha solto no projeto é invisível para quem edita pelo Studio.
- **Variável de ambiente no export.** Não persiste com o projeto; some entre
  máquinas e não aparece na UI.
- **Campo no `cortex.json` do projeto** (escolhida) — mesmo arquivo que já carrega
  `id`, `name` e `icon`, já editável por modal no Studio, já copiado resolvido
  para o `dist-native/` pelo export, e `readGameConfig` já preserva campos
  desconhecidos.

## Decisão

**O app id da Steam passa a ser um campo do `cortex.json` do projeto
(`steamAppId`), editável nas Configurações do jogo do Studio, e o export
`--steam` FALHA quando ele não está declarado.**

1. **Autoria (Studio).** O modal "Configurações do jogo"
   (`electron/renderer/ProjectSettingsModal.ts`) ganha o campo **Steam App ID**,
   ao lado de nome e ícone. Aceita apenas dígitos; vazio significa "este projeto
   não publica na Steam" e é um estado válido — o campo não é obrigatório para
   quem exporta só para PC.

2. **Validação (export).** `export-game.mjs --steam` lê `steamAppId` do
   `cortex.json` do projeto e **aborta com erro acionável** se estiver ausente,
   vazio ou não numérico. Falhar cedo, no export, é o ponto certo: é a última
   fronteira antes do artefato que vai para o SteamPipe. Sem `--steam` o campo é
   ignorado.

3. **Runtime (host).** `core::GameConfig` ganha `steamAppId`, lido do
   `cortex.json` ao lado do exe pelo `loadGameConfig` já existente. O
   `initSteam()` recebe o valor e o repassa ao `RestartAppIfNecessary`. O
   `#define CORTEX_STEAM_APPID` e a opção de CMake **saem** — não há mais app id
   em código.

4. **`steam_appid.txt` continua sendo só de dev.** O CMake segue copiando o
   arquivo (480) ao lado do `cortex_host.exe` do `build-steam/`, para rodar o host
   fora da Steam durante o desenvolvimento. O **release não o leva** — como já era
   e como a Valve orienta.

5. **Sem app id, o jogo roda.** Se o `cortex.json` do build não declarar
   `steamAppId` (projeto antigo, export PC), o host pula a Steam e segue — nunca
   deixa de abrir por causa disso. O portão está no export, não no runtime.

Como decorrência, as **capacidades** da Steam também deixam de ser privilégio do
C++: o host expõe conquistas, stats, overlay e dados do jogador ao JS por globais
`__cortexSteam*`, consumidas por uma fachada TS do engine. O contrato dessas
funções, o comportamento do Auto-Cloud e o fluxo de upload SteamPipe estão na
**SPEC-0175**.

## Consequências

- **O export Steam vira acessível pelo Studio.** Preencher um campo passa a ser
  suficiente; ninguém precisa de toolchain C++ para publicar. Era o gargalo real.
- **Um host serve todos os jogos**, como já acontecia com `id`/`name`. O
  `build-steam/` volta a ser genérico e cacheável.
- **O 480 silencioso morre.** Ou o projeto declara um app id, ou o export
  `--steam` não produz artefato. Continua possível *testar* com 480 — mas
  explicitamente, digitando 480 no campo.
- **Quebra de compatibilidade no build**: `-DCORTEX_STEAM_APPID` deixa de existir.
  Quem tiver um `build-steam/` configurado precisa reconfigurar o CMake. O
  `-DCORTEX_STEAM=ON` (que decide se linka o SDK) permanece — a *presença* do
  Steamworks ainda é decisão de compilação, só o *número* virou dado.
- **O app id fica visível no `cortex.json` do jogo distribuído.** É informação
  pública (aparece na URL da loja); não há segredo exposto.
- **Não cobre o Steam DRM wrapper.** Se um dia embrulharmos o exe com o DRM da
  Valve, o `RestartAppIfNecessary` vira desnecessário (`steam_api.h:117`) e este
  campo passa a servir só ao SteamPipe e ao init em dev.
