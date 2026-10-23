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

**Export nativo release do DDD 61** na main do jogo (`e2be01c`, tem o Guará), engine `5c970b0c` com o
host recompilado; kit de medição SPEC-0382 (`ab.sh`): A = arquivos desta SPEC como na `main`, B = esta
mudança, mesma build; 3 réplicas por ponto, intercaladas AB/BA, 200 s, t ≥ 30 s, todas válidas
(`validate.sh`). B − A, média das réplicas (ms):

| ponto | quadro med | quadro p95 | js p95 (host) | render | `mirror` média | `cull` média · p99 A → B | `world` A / B |
|---|---|---|---|---|---|---|---|
| Setor O | −0,2 | −0,3 | −0,9 | −0,37 | −0,37 | −0,25 · 3,92 → 0,90 | 2,91 / 2,91 |
| Centro | −0,8 | +0,3 | −0,5 | −0,35 | −0,36 | −0,25 · 3,84 → 1,02 | 3,28 / 3,39 |
| Comercial | −1,1 | −1,8 | −0,9 | −0,48 | −0,35 | −0,22 · 3,75 → 1,24 | 3,43 / 3,49 |
| Águas Claras | −0,9 | −2,2 | 0,0 | −0,01 | −0,37 | −0,26 · 4,25 → 1,25 | 3,03 / 3,00 |
| Guará | −0,6 | −0,6 | −0,6 | −0,32 | −0,36 | −0,22 · 3,74 → 1,04 | 2,53 / 2,54 |
| dirigindo (Hélio, `drive=1`)¹ | −0,7 | −1,5 | −1,1 | −0,30 | −0,36 | −0,22 · 3,76 → 0,79 | 2,50 / 2,48 |

¹ Na base da engine `f7cea071` (com a SPEC-0394; antes dela o ponto morria ao bater num prop), A e B
reexportados nessa base e o host recompilado; sem piloto (o detetive começa no carro, com o trânsito).

- A rajada do `cullOutlines` (a cada 10 quadros) cai de ~4 ms para ~1 ms no p99; a varredura do espelho
  custa 0,35–0,37 ms a menos por quadro, igual nos cinco pontos.
- Fases que esta SPEC não toca ficam iguais (`world`, `update`, draws, triângulos): a medição está limpa
  e o desenho é o mesmo.
- O quadro (mediana e p95, ±1–2 ms de ruído por rodada nesse jogo) não piora em nenhum ponto.

**Bench sintético** (Node, cena com 3.000 nós visíveis + bloco de 1.250 escondido): `cullOutlines`
0,215 → 0,136 ms por passada com o bloco escondido (pula as 625 cascas dele); com tudo visível, sem
regressão (0,206 → 0,189).

Referência secundária (jogo `aacfb7e`, 1 par, máquina carregada): `cull` p99 3,49 → 0,68 ms.
