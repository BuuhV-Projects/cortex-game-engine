# SPEC 0753 - Residência de assets: carregar sob demanda e soltar por orçamento

**Data:** 2026-11-27
**Status:** implementado

## Contexto

Um jogo que carrega todos os modelos de uma vez paga a memória de todos, mesmo os que não aparecem. O Port Hollow
carrega os 44 skins de NPC de missão no loading (cerca de 1 GB só de cor, decodificada) quando a missão atual usa
uns 8. Para carregar sob demanda e soltar, a engine hoje não tem as peças:

- O `AssetLoader` só cacheia o asset **depois** de pronto: duas cargas paralelas da mesma URL baixam e decodificam o
  arquivo duas vezes.
- Não existe liberar **uma** URL: o `evict(url)` tira do cache sem dispor, e o `disposeCache()` solta tudo.
- O `disposeObjectResources` dispõe a textura (a GPU), mas a imagem decodificada (`ImageBitmap` no navegador, o
  bitmap do shim no host nativo, SPEC-0748) só sai no GC, porque o three não chama `close()` no dispose.
- Não há contagem de uso nem orçamento.

O GTA San Andreas resolve isso com o `CStreaming` (estudado no exe 1.01 do usuário): orçamento fixo em bytes
(`memory` do `stream.ini`), contador de referências por modelo, uma lista do usado há mais tempo varrida só quando
falta espaço, e a flag "a missão precisa" que o script põe ao pedir o modelo e tira no fim, sem apagar na hora (o
modelo volta para a fila e, se a missão seguinte usar o mesmo, ainda está lá).

## Decisão

### `AssetLoader`

- **Carga em andamento dividida:** `loadTexture`, `loadGLTF`, `loadFBX` e `loadAudio` guardam a promessa da carga
  por URL até ela terminar. Uma segunda chamada da mesma URL recebe a mesma promessa. Se a carga falha (inclusive
  um `throw` síncrono do loader do three), a promessa sai do mapa e a próxima chamada tenta de novo. O `evict`, o
  `clearCache` e o `disposeCache` mexem só no cache pronto, como antes: a carga em andamento termina e entra no
  cache.
- **`release(url): boolean`** solta uma URL já carregada: GLTF/FBX → `disposeObjectResources(raiz, { closeImages:
  true })`; textura → `dispose()` e fecha a imagem; áudio → `free?.()`. Tira a URL do cache e devolve `true`. URL sem
  asset pronto (nunca pedida, ou ainda em carga) devolve `false` e não faz nada.
- **`disposeObjectResources(root, { closeImages })`:** com `closeImages`, cada textura disposta também fecha a imagem
  (`texture.source.data.close?.()`). Sem a opção, como antes. Só quem sabe que ninguém mais usa a textura pede o
  fechamento: imagem fechada não sobe para a GPU de novo.

### `AssetResidency` (novo, `src/core/AssetResidency.ts`)

O conjunto de GLBs residentes de um jogo, com orçamento em bytes:

```ts
const skins = new AssetResidency({ budgetBytes: 512 * 2 ** 20, onEvict: (url) => templates.delete(url) });
await skins.hold('mission-3', urlsDaMissao3); // carrega e segura o elenco
const gltf = skins.get(url);                  // síncrono: o residente (ou undefined)
skins.acquire(url);                           // um boneco vivo usa o modelo
skins.unref(url);                             // o boneco saiu
skins.unhold('mission-3');                    // a missão acabou: descartável, não apagado
```

- **`request(url): Promise<GLTF>`** carrega pelo `AssetLoader` (a carga em andamento é dividida), marca como usado
  agora e roda o `trim()`.
- **`get(url)`** devolve o GLTF residente e marca como usado agora; `undefined` se não está pronto.
  **`isResident(url)`** só consulta.
- **`acquire(url)` / `unref(url)`:** o contador de referências (quantos usuários vivos). Pode ser chamado antes de a
  carga terminar. `unref` abaixo de zero é erro de quem chama e fica em zero.
- **`hold(owner, urls): Promise<GLTF[]>`** segura as URLs em nome de `owner` (um nome: a missão, o jogo) e pede
  todas. **`unhold(owner)`** tira a marca daquele dono. A URL fica segura enquanto algum dono a segura.
- **`trim()`:** enquanto os bytes residentes passam do orçamento, solta o residente usado há mais tempo que tem
  contador 0 e nenhum dono, chamando antes o `onEvict(url, gltf)` (para o jogo largar o que derivou do GLTF) e
  depois o `loader.release(url)`. Se todos os residentes estão em uso ou seguros, para: o orçamento é teto de
  descarte, não de carga (o pedido nunca falha por falta de espaço), e `stats.overBudget` conta essas vezes.
- **Os bytes** de cada GLB são estimados na chegada (`sizeOf`, que o jogo pode trocar): por textura distinta dos
  materiais, largura × altura × 4 bytes (1 se comprimida), com 4/3 se tem mips; mais os `array` dos atributos e do
  índice de cada geometria distinta. A textura conta pela imagem (`texture.source`): clones que dividem a imagem
  contam uma vez; o mesmo `array` em dois atributos também. A função é exportada (`estimateGltfBytes`).
- **`stats`:** `{ resident, bytes, budgetBytes, loads, evictions, overBudget }`.
- **`release(url)`** solta na hora uma URL sem uso (o jogo que sabe o que faz); com uso ou segura, não faz nada e
  devolve `false`.

### Casos de borda

- **A URL que acabou de chegar** não é solta pelo `trim()` da própria chegada (o `request` nunca devolve um GLTF já
  solto); nos `trim()` seguintes, só o contador ou um dono a protegem. Quem pede sem `hold` chama o `acquire` logo.
- **Em carga:** o `trim()` só olha os residentes, então nunca solta o que não chegou; `release(url)` de URL em carga
  devolve `false`. `acquire`, `unref`, `hold` e `unhold` valem durante a carga: o que chega sem contador nem dono
  (um `unhold` no meio) fica residente e descartável.
- **`hold` com falha:** a promessa do `hold` rejeita (a primeira falha) e a marca do dono sai só da URL que falhou;
  as outras seguem seguras até o `unhold(owner)`. A URL que falhou, sem contador nem outro dono, é esquecida.
- **`unref` sem `acquire`** fica em zero e avisa no `debug('assets')`.
- **`onEvict` que lança** é logado no `debug('assets')` e o `release` acontece assim mesmo.
- **Contadores:** `loads` conta cada chegada (a recarga depois do descarte conta de novo); `evictions` conta o
  `trim()` e o `release()`; `overBudget` conta os `trim()` que terminaram acima do orçamento.

O que fica no jogo: quais URLs, quando pedir e soltar, o orçamento e o que derivar do GLTF (o template, o material).

## Consequências

- Um jogo pode ter muito mais modelos no disco do que cabe na memória: só paga os residentes, e o descarte só
  acontece quando passa do orçamento (o que saiu da missão continua lá até precisar do espaço).
- O GLTF residente é compartilhado: quem clona (`clone()`) compartilha geometria, material e textura com ele, e por
  isso o descarte só solta o que tem contador 0. Quem usa a residência tem de chamar `acquire`/`unref` por clone vivo.
- O `trim()` roda no fim de cada `request`, não por quadro.
- Testes: `tests/core/assetLoaderRelease.test.ts` (carga dividida, nova tentativa após falha e após `throw`
  síncrono, `release` de cada tipo, `release` em carga, `closeImages` uma vez por imagem, `disposeCache` sem fechar)
  e `tests/core/assetResidency.test.ts` (orçamento, ordem do usado há mais tempo, contador e dono protegem, `unhold`
  não solta na hora, `onEvict` antes do `release`, `overBudget`, a URL recém-chegada, a carga em andamento, o `hold`
  com falha, a estimativa de bytes).
