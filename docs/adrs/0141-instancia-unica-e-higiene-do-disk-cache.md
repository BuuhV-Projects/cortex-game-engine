# ADR-0141 - Instância única do Studio e higiene do disk cache

**Data:** 2026-07-22
**Status:** aceito

## Contexto

O Studio abria cuspindo isto no log, de forma recorrente:

```
net\disk_cache\blockfile\backend_impl.cc:1020] Critical error found -8
net\disk_cache\blockfile\entry_impl.cc:1072]  No file for a1010e3a
```

O `-8` **não** é um `net::Error` — é da enum interna do disk cache
(`net/disk_cache/blockfile/errors.h`): `ERR_INVALID_LINKS`, ou seja, a lista
encadeada LRU do índice quebrou. O `No file for <hash>` é uma entrada do índice
apontando pra um arquivo `f_xxxxxx` externo que não existe mais.

O cache HTTP e o code cache do Chromium usam o backend **blockfile**, cujo índice
só fecha íntegro num shutdown limpo. O Studio morre à força o tempo todo em
desenvolvimento — `Ctrl+C` no `electron-vite dev`, fechar o terminal, crash de
renderer — e cada morte dessas tem chance de deixar o índice inconsistente pra
sessão seguinte.

Impacto funcional: **nenhum**. O Chromium detecta, desabilita o cache naquela
sessão e recria do zero. O custo é ruído: um erro vermelho recorrente e inócuo
no boot treina a gente a ignorar o log, e aí o erro de verdade passa batido.

Agravante encontrado na investigação: o `main.ts` não pedia
`requestSingleInstanceLock()`. Duas instâncias do Studio compartilhariam o mesmo
`userData` — mesmo disk cache, `preferences.json`, `chats/` e `sessions/` — com a
última escrita vencendo em silêncio. Não era a causa do erro observado (os cinco
processos do log eram uma instância só: main + gpu + utility + renderers), mas é
um caminho aberto pra corromper cache e perder preferências.

## Decisão

Três medidas, em `electron/cacheHygiene.ts` (módulo puro, sem dependência de
`electron`, pra ser testável com diretório temporário) + ligação no `main.ts`:

**1. Instância única.** `app.requestSingleInstanceLock()` no topo do `main.ts`. A
segunda invocação sai na hora e o handler `second-instance` restaura/foca a
janela existente. É também pré-requisito da medida 2 — sem o lock, uma segunda
instância purgaria o cache que a primeira está usando.

**2. Detecção de shutdown sujo por sentinela.** Um arquivo
`<userData>/cortex-session.lock` é criado no boot e removido no `before-quit`.
Encontrá-lo **durante o boot** significa que a sessão anterior morreu à força.

**3. Purga preventiva no boot.** Quando a sentinela sobrevive, os caches
blockfile são esvaziados antes de o Chromium abrir o índice — obrigatoriamente
antes da primeira `BrowserWindow`, senão vira corrida.

Dois detalhes que o código trava por teste:

- **só `Cache` e `Code Cache`** são purgados. `GPUCache`/`DawnWebGPUCache` usam
  outro backend, não produzem esse erro, e limpá-los só encareceria o boot;
- a purga **esvazia o conteúdo e mantém a raiz**. Apagar e recriar o diretório é
  tentador, mas no Windows o nome fica em "delete pending" enquanto um handle
  não solta e o `mkdir` seguinte estoura EPERM — mesma armadilha já documentada
  no ADR-0101 (`native/scripts/fs-clean.mjs`).

### Alternativas descartadas

- **Só limpar o cache na mão quando incomodar.** Resolve o sintoma de hoje e
  volta no próximo `Ctrl+C`. Não ataca nada.
- **Desabilitar o disk cache em desenvolvimento** (`disable-http-cache`).
  Eliminaria a classe inteira do erro em dev com uma linha, mas deixa dev e
  produção com caminhos de cache diferentes — bug de cache passa a ser
  reproduzível só em produção, que é o pior lugar pra descobrir. Também torna o
  reload do dev server mais lento.
- **Purgar o cache em todo boot.** Simples e sem sentinela, mas joga fora um
  cache íntegro na esmagadora maioria dos boots (o shutdown normalmente é limpo),
  pagando boot mais lento sempre pra resolver um caso raro.

## Consequências

- O erro deixa de reaparecer: um shutdown sujo é pago **uma vez**, no boot
  seguinte, com um cache frio (boot marginalmente mais lento nessa sessão).
- Shutdown limpo não paga nada — o cache é preservado integralmente.
- Abrir o Studio duas vezes agora **foca a janela existente** em vez de subir uma
  segunda instância. É uma mudança de comportamento visível pro usuário.
- Purga e sentinela são best-effort: um cache travado por outro processo é
  ignorado em silêncio, sem derrubar o boot. O Chromium ainda tem a própria
  recuperação como rede de segurança.
- A sentinela guarda o PID da sessão, útil pra diagnóstico manual.
- **Não** cobre o cache corrompido que já estava em disco antes desta mudança —
  esse foi limpo na mão uma vez. Da próxima em diante, é automático.
