# SPEC-0372 - Varreduras por quadro pulam subárvore escondida

**Data:** 2026-10-22
**Status:** aceito
**Relacionados:** ADR-0251 (corte da casca de contorno), SPEC-0322 (varredura em rodízio do espelho),
SPEC-0332 (gancho de `visible`), SPEC-0307 (`visible=false` e física — não muda aqui), SPEC-0144 do
DDD 61 (medição do Guará)

## Contexto

Duas varreduras da engine percorrem **todo nó da cena, escondido ou não**:

- `cullOutlines` (`src/scene/OutlineCulling.ts`) roda a cada `OUTLINE_CULL_INTERVAL` quadros com
  `root.traverse`, que desce por subárvore com `visible = false`;
- a varredura em rodízio das flags do espelho nativo (`_varrerFlags`, `src/core/NativeSceneMirror.ts`)
  confere 1/8 dos slots por quadro, também sem olhar a visibilidade do ancestral.

O DDD 61 esconde o Guará inteiro em bloco (`visible = false` num grupo) longe dele — ~1.250 nós. Medido
na SPEC-0144 do jogo: `cull` p99 2,19 → 2,71 ms e `mirror` p99 +0,2…+0,3 ms nos três pontos antigos,
só por esses nós que nem desenham. Tirar o Guará do grafo em runtime mediu **pior** (jsP95 +1,9 ms na
Comercial). O custo é da engine: o jogo não tem como avisar "pule isso".

Os dois resultados não dependem do que está debaixo de um nó escondido:

- a casca de contorno escondida pelo ancestral não desenha, seja qual for o `visible` dela;
- o host nativo herda a visibilidade do pai (`main_pass_culler.cpp` e `shadow_caster_enumerator.cpp`
  calculam `effectiveVisible`): `material.visible`, lado da sombra, `frustumCulled` e `renderOrder` de
  um nó com ancestral escondido não chegam ao desenho.

## Decisão

### `cullOutlines`

A travessia passa a ser recursiva com poda: um nó com `visible = false` **que não é casca** tem a
subárvore pulada. A casca continua avaliada mesmo com `visible = false` — é o próprio filtro que a
esconde, e pulá-la a deixaria escondida para sempre (por isso não serve `traverseVisible`).

Ao reaparecer, a casca volta a ser processada na próxima passada (até `OUTLINE_CULL_INTERVAL` quadros),
o mesmo atraso que ela já tem para a câmera que anda. Até lá fica com o estado de quando o ancestral
sumiu — que é o de uma distância parecida, porque quem esconde por distância (o `DistanceCuller`, a
região do jogo) mostra de volta na mesma fronteira.

### Varredura do espelho

Os slots do espelho estão em ordem BFS e o `appendSubtree` reaproveita lápides, então não há faixa
contígua de subárvore para pular. Cada slot ganha um contador `_ocultoAcima` = quantos ancestrais
**espelhados** estão com `visible = false`:

- calculado na adoção do slot pelo pai (`_ocultoAcima[pai] + (pai.visible ? 0 : 1)`); `install` e
  `appendSubtree` adotam pai antes de filho;
- mantido pelo gancho de `visible` (SPEC-0332): quando o valor **muda** num nó **com filhos**, a
  subárvore dele soma `+1` (escondeu) ou `-1` (mostrou). O custo sai do quadro (varredura) e vai para a
  troca (O(subárvore) por troca, uma vez);
- a varredura pula o slot com contador > 0;
- quando o contador de um slot volta a 0, o slot é **re-conferido na hora** (flags do quadro e troca
  de geometria) — o que aconteceu com ele escondido chega ao host no mesmo quadro em que reaparece,
  sem o atraso de até 8 quadros da varredura.

O `visible` do próprio nó continua indo pelo gancho no instante da escrita, escondido ou não. Matriz
de mundo e transform não mudam: os slots sujos seguem para o host como antes.

### Fora do escopo

- Física: `traverseCollidable` (SPEC-0307) já poda subárvore escondida e não muda.
- `cullShadowCasters` e outras travessias: não medidas como custo do Guará.

## Consequências

- O custo das duas varreduras passa a ser proporcional aos nós **visíveis**: subárvore escondida custa
  uma leitura por slot no espelho e zero no `cullOutlines`.
- Trocar o `visible` de um grupo grande custa uma passada pela subárvore no momento da troca. Quem
  liga/desliga o mesmo grupo grande **todo quadro** pagaria isso todo quadro (nenhum caso conhecido; a
  SPEC-0144 já faz o jogo escrever `visible` só na troca).
- Casca debaixo de ancestral que reaparece pode ficar até `OUTLINE_CULL_INTERVAL` quadros com o estado
  antigo (ver acima); o espelho fica mais correto que antes (re-conferido na hora).
- Testes: `OutlineCulling.test.ts` (nó escondido não visitado; volta a ser processado ao reaparecer) e
  `NativeSceneMirror.test.ts` (slot com ancestral escondido não é conferido; reaparecer re-confere e
  manda a flag que mudou escondida).

## Medição

(preenchida depois do A/B no export nativo do DDD 61)
