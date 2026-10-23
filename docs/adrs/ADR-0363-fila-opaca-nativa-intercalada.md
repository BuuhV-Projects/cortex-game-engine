# ADR-0363 — Fila opaca nativa intercalada na RenderList (b.3 do ADR-0330)

**Data:** 2026-10-23
**Status:** **medido, sem ganho; arquivado** — o código foi removido; para retomar, o último estado está no commit `dbf15071` (branch `claude/b2-desenho-nativo-d831a3`). Ver "Resultado medido" e as armadilhas.

## Contexto

Depois da b.2 (SPEC-0333), um desenho limpo e parado ainda passa, em JS, por:
`renderList.push` na projeção, o sort da RenderList, a iteração do
`_renderObjects`, o `renderObject` (com `onBeforeRender`/`onAfterRender`), o
wrapper da b.1 (conferência + grupos compartilhados) e o `DrawBatch.add`. O teto
medido SEM sonda no DDD 61 `e2be01c` (deixando de projetar os limpos parados —
imagem errada de propósito, só para medir) foi:

| ponto | render normal | sem os limpos | Δ render | Δ quadro |
| --- | --- | --- | --- | --- |
| setorO | 13,37 | 8,20 | −5,17 | −5,35 |
| comercial | 14,37 | 8,76 | −5,60 | −5,55 |

~85 draws/quadro a **~61–66 µs de JS cada**. A conferência da b.1 em si custa
~3–5 µs por objeto; o resto é a máquina do `three` em volta.

## Decisão

Os desenhos **opacos, limpos e parados** saem da RenderList do `three`:

1. **Na projeção** (SPEC-0332), cada candidato com gravação da b.1 válida
   (mesmo contexto, material, luzes, clipping, geometria, ambiente; matriz e
   instantâneo batendo; receita da b.2 viva; material opaco único) é
   **oferecido** à fila nativa em vez de ir para o `renderList.push`. A
   conferência é a da b.1 (`restMatch`/`matrixMatch`), os grupos
   compartilhados e os nós de render do estado de shader rodam uma vez por
   chamada de `render()`, como na b.1, e os `info` de draws/triângulos são
   somados ali.
2. **A fila vai ao C++** (`__cortexDrawBatch.queue`): comandos
   `[receita, count, instâncias, first]` com a chave de sort do `three`
   (`renderOrder`, `z`, `id` — `groupOrder` é 0 na chamada de topo), ordenada
   de forma estável em C++ pela mesma regra do `painterSortStable`.
3. **A emissão é intercalada** no `_renderObjects` da lista opaca dessa
   RenderList: antes de cada item do `three` que veio da projeção, o host
   emite (`emitNext`, comparando localmente as chaves ordenadas que o host
   devolveu) os nativos de chave menor; no fim da lista (ou antes
   dos transparentes, ou no `finishRender` se não houver opaco em JS), emite o
   resto. O fundo (`unshift` depois do sort, não é nó da cena) nunca dispara
   emissão antes dele — vai primeiro, como no `three`.

Recusa (o objeto volta ao caminho da b.1, por objeto): transparente,
material em array, `occlusionTest`, `onBeforeRender`/`onAfterRender` próprios,
objeto que se moveu, gravação ou receita ausente/velha, sort customizado da
RenderList (`_opaqueSort`), `?nativeOpaqueQueue=0`.

## Alternativas consideradas

- **Empurrar placeholders na RenderList do `three`** e reconhecê-los no
  `_renderObjects`: preserva a ordem sem merge, mas mantém o `push`, o sort em
  JS e a iteração por objeto — exatamente o custo medido. Rejeitada.
- **Limpeza por ganchos de escrita** (material, textura, geometria) no lugar
  da conferência por quadro: tiraria também os ~3–5 µs da conferência, mas a
  superfície de ganchos é grande e o modo de falha é imagem sutilmente errada
  (a SPEC-0362 mostrou como esses atalhos mordem). A conferência fica; um
  passo seguinte pode trocá-la se a medição mostrar que ela virou o gargalo.
- **Ordenar a fila em JS** (comparador por item): ~n log n chamadas de
  comparador no Hermes. O sort de ~85 itens em C++ é desprezível.

## Consequências

- O passe principal do host passa a ter dois produtores de desenho
  intercalados: o `three` (itens da RenderList) e a fila nativa. A ordem final
  é a total do `painterSortStable` — a mesma imagem por construção, conferida
  pelo instrumento `?parityFreeze` (SPEC-0362).
- Objeto da fila nativa não passa pelo `renderObject` do `three` no quadro:
  `onBeforeRender`/`onAfterRender` próprios são recusa, e o `renderId` do
  monitor não é carimbado (ao voltar ao `three`, ele refaz o objeto — correto,
  só mais lento naquele quadro).
- Depois de cada emissão, os caches de estado do encoder do `three`
  (`currentSets`, `_activePipelines`) são invalidados, como na b.2.
- Interruptores: `?nativeMainPass=0` (tudo), `?cleanDraw=0`, `?drawBatch=0`,
  `?nativeOpaqueQueue=0` (só esta etapa).

## Armadilha medida: reentrância (derrubava o host no aquecimento)

A primeira versão chamava a atualização do estado de shader e dos grupos
compartilhados (`nodes.updateBefore`) DENTRO da oferta, na projeção. Um
`updateBefore` pode renderizar a mesma cena noutro alvo — no DDD 61, um render
target RGBA8 no aquecimento —, e a projeção aninhada reaproveitava a fila em
montagem e a mandava ao host: os itens oferecidos no contexto RGBA16F foram
emitidos no pass RGBA8 (`set_pipeline`: "Render pipeline targets are
incompatible with render pass", pânico no `wgpuQueueSubmit`). Sondado por
contexto e pass até isolar. Regras que ficaram:

1. **A oferta não tem efeito colateral**: a atualização dos oferecidos roda no
   `beginRender` do contexto dono da fila (como a b.1 faz dentro do pass).
2. **A fila tem dono**: o contexto do render que a montou. Só ele emite
   (`_renderObjects` da lista dele, `_renderTransparents` e `finishRender` com
   o contexto dele).
3. **Aninhado não mexe**: enquanto o render dono está aberto, projeção
   aninhada não oferece nem troca a fila.
4. **Fila sem render é descartada** pela projeção seguinte (`compileAsync`
   projeta sem abrir pass).
5. **Laço com o tamanho da ENTRADA**: o DDD 61 tem um render aninhado da mesma
   cena com a mesma câmera em todo quadro — a MESMA RenderList, então o
   `begin()` aninhado esvazia e reenche o array que o render de fora está
   percorrendo. O `_renderObjects` do `three` fixa `il` na entrada; o
   embrulho que lia `list.length` ao vivo virava laço quase infinito
   (sonda: `rpNodes` 6,5 s num quadro, 214 objetos refeitos, host parado). E o
   ramo da fila exige o contexto dono — o aninhado reconhece o mesmo array.
6. **Nunca `nodes.getCacheKey` na projeção**: o `three` a memoiza por chamada
   de `render()` (`info.calls`) e ela inclui as luzes da RenderList, que só
   são fixadas no `finish()`, DEPOIS da projeção. Calculada na oferta, a chave
   com as luzes erradas valia para a chamada inteira, todo render object
   divergia dela e era refeito (`rpNodes` 6,5 s, `rpObjGet` 216 num quadro).
   A oferta compara com a chave da chamada anterior; a verdadeira é conferida
   no `beginRender` do dono e, se o ambiente mudou no quadro, a fila do host é
   descartada e os oferecidos são desenhados pelo `three`, na ordem do sort
   (intercalados em JS — caso raro, imagem exata).
7. **A chave da chamada anterior é guardada por `lightsNode`**: o render
   aninhado do DDD 61 usa outra câmera (outro `lightsNode`) e sobrescrevia o
   memo único de ambiente todo quadro — a oferta recusava tudo (33 ofertas
   numa rodada inteira, 0 emitidos).
8. **Comparar a chave em JS, cruzar a ponte só por sequência**: a primeira
   versão funcional chamava `emitUntil` na ponte antes de CADA item do
   `three` e, antes disso, despachava o lote da b.2 — o lote virou sequências
   de 1 desenho (`flushes` 38 mil → 213 mil numa rodada) e o render ficou
   igual ao sem fila (13,57 × ~13,5 ms). O host passou a devolver as chaves
   ordenadas no próprio `Float64Array` (`queue`), o JS mantém o cursor e só
   chama `emitNext(pass, n)` quando há nativos antes do item.
9. **A gravação da oferta é a do contexto do render**, não a mais recente do
   objeto: o render aninhado grava os mesmos objetos noutro contexto depois do
   principal, e a oferta que só olhava `_cxGravacao` recusava ~40 limpos por
   quadro (a b.1 já buscava pelo mapa `(objeto, contexto, passId)`).

## Resultado medido (2026-10-23)

DDD 61 `e2be01c`, engine da branch (base `7fb9421e`), export release, kit
SPEC-0382, mesma build `?nativeOpaqueQueue=0` (A) × ligada (B), intercalado,
2 réplicas × 170 s. Paridade `?parityFreeze` no setorO: **`maxChannelDiff` 0**
em nativo×`three` e nos controles.

| ponto | render A | render B | Δ | quadro med Δ |
| --- | --- | --- | --- | --- |
| setorO | 15,02 (uma réplica atípica: 17,1) | 13,77 | −1,24 | −0,05 |
| centro | 14,06 | 13,77 | −0,29 | −0,65 |
| comercial | 14,30 | 15,31 | +1,01 | −0,15 |
| Águas Claras | 15,65 | 24,38 (uma réplica: 33,9, p95 100, GC 2,4 MB/q) | +8,73 | +0,75 |

**Sem ganho demonstrável; uma réplica com regressão grave a investigar.**

Por que o teto (−5,2 ms) não se realizou:

- **O teto estava inflado**: o experimento marcava "limpo e parado" de forma
  permanente — objeto que depois se movia continuava fora da projeção. Os
  contadores de recusa mostram, por quadro no setorO, ~36 aceitos, ~20 que se
  moveram (NPCs, carros, jogador), ~4,5 instantâneo divergente, ~3 material,
  ~3 receita — ~44 limpos e parados, não ~85.
- O que sobra por item na fila (conferência + oferta + chave + emissão por
  sequência) e o custo do `three` que NÃO sai (o render aninhado da mesma
  cena, o `RenderIdRefresh`, a projeção em JS dos candidatos) comem a maior
  parte dos ~36 × ~40–60 µs.

O que fica de pé: as 9 armadilhas acima (todas com teste), a paridade exata
por construção, e a pendência no backlog do PRD-0009.
