# ADR-0744 - `GameConfig` no Steam Cloud pela API de Remote Storage

**Data:** 2026-11-18
**Status:** aceito
**Spec:** SPEC-0743

## Contexto

O `GameConfig` (SPEC-0124) grava os `.ini` do jogo (o `config.ini` e, nos jogos que usam, o `save.ini`) ao lado do exe
pelo `__cortexWriteBaseFile`. Num jogo vendido pela Steam isso tem três problemas: o save não acompanha o jogador para
outro PC, duas contas Steam na mesma máquina dividem o mesmo save, e a pasta de instalação pode não ser gravável. O jogo
precisa que, rodando pela Steam, esses arquivos fiquem na nuvem da Steam e não existam na pasta do jogo.

## Alternativas

1. **Auto-Cloud.** Sem código: no painel do Steamworks declara-se uma pasta raiz e um padrão de arquivo, e a Steam copia
   os arquivos ao abrir e ao fechar o jogo. Só que os arquivos continuam numa pasta do disco (a do jogo, ou uma que o
   host teria de passar a usar), a regra de pasta é por sistema operacional e mora fora do repositório, e o jogo não
   sabe se a Steam está cuidando deles.
2. **Mudar os `.ini` para a pasta do usuário (`SDL_GetPrefPath`) + Auto-Cloud dessa pasta.** Tira os arquivos da pasta
   do jogo, mas ainda depende da regra no painel e não separa as contas Steam da mesma máquina.
3. **API de Remote Storage (`ISteamRemoteStorage`).** O host grava e lê pelo SDK (`FileWrite`/`FileRead`). O arquivo
   fica no cache da Steam (`<Steam>/userdata/<conta>/<appid>/remote/`), por conta, e a Steam sobe ao fechar o jogo, baixa
   antes de abrir e mostra a tela de conflito quando duas máquinas divergem. No painel basta ligar o Steam Cloud e dar a
   cota.

## Decisão

Alternativa 3. O host nativo ganha `core/steam_cloud.{h,cpp}` (ler, gravar, apagar e saber se a nuvem está disponível)
e as globais `__cortexSteamCloud*`. A fachada TS `SteamCloud` (`src/core/steamCloud.ts`) as consome, e o
`GameConfig` passa a usar a nuvem sozinho quando ela está disponível (Steam inicializada e `ISteamRemoteStorage` vivo).
Nenhuma API do jogo muda: o mesmo `GameConfig.load()`/`save()` serve o PC puro, o Studio e a Steam.

A nuvem é a fonte quando existe. Arquivo ainda ausente nela cai no caminho de antes (o `fetch` do arquivo ao lado do
exe), o que serve de semente para instalações antigas; o primeiro `save()` já grava na nuvem. Se a gravação na nuvem
falhar (Steam Cloud desligado no painel do app, cota cheia), o `save()` cai no arquivo ao lado do exe: perder o save é
pior do que ele aparecer na pasta.

**Configuração por máquina** (resolução, tela cheia, vsync) não deve ir para a nuvem: ela seguiria para outra máquina
(a resolução do PC no Steam Deck). Quando um jogo tiver opções assim, elas ficam num arquivo próprio fora do
`GameConfig` sincronizado (a pasta por usuário do host, `__cortexWriteUserFile`). Isso não é construído agora: nenhum
jogo grava vídeo no `GameConfig` hoje.

## Consequências

- Pela Steam, os `.ini` do `GameConfig` não são criados na pasta do jogo; cada conta Steam tem os seus.
- A gravação é imediata no cache local da Steam, e o envio à nuvem acontece quando o jogo fecha (é como o SDK
  funciona; não há envio a cada mudança). Com a Steam offline, grava local e sobe depois.
- O app precisa ter o **Steam Cloud ligado no painel do Steamworks** (cota de bytes e de arquivos por usuário). Sem
  isso o `FileWrite` falha e o jogo cai no arquivo ao lado do exe (com log `config`).
- O arquivo antigo ao lado do exe, se existir, é lido uma vez como semente e não é apagado.
- Fora da Steam (export PC puro, Studio, navegador) nada muda.
