# ADR-0363 — Fila opaca nativa intercalada na RenderList (b.3 do ADR-0330)

**Data:** 2026-10-23
**Status:** aceito

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
   emite (`emitUntil`) os nativos de chave menor; no fim da lista (ou antes
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
