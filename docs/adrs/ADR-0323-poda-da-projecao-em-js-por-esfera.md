# ADR-0323 — Poda da projeção do `three` em JS, por esfera de subárvore e `visible` temporário

**Data:** 2026-10-07
**Status:** aceito

## Contexto

Frente R2-D do ciclo "75 fps no export nativo do DDD 61". A sonda da R1b
apontou `_projectObject` com ~5,0 ms/quadro e 1.294 chamadas, numa árvore de
~10 mil nós em que o `three` visita nó a nó o que o espelho de cena em C++
(SPEC-0234) já sabe estar fora do frustum.

A remedição desta frente (SPEC-0322) mostrou que **os 5,0 ms eram dupla
contagem**: a sonda da R1b embrulhava `_projectObject` em TODA chamada
recursiva e somava o tempo inclusivo de cada nível (mais o custo de dois
`performance.now()` por nó). Medido só no topo — e confirmado pela sonda de
fases da SPEC-0227 (`rpProject`, com guarda de reentrância) — o custo real é
**1,1–1,7 ms/quadro**. O teto do que a poda pode tirar é a fração das visitas
que não empurra nada: ~50% (≈ 0,6–0,8 ms), concentrada em subárvores SEM nada
desenhável pela câmera (bonecos do lote instanciado, camada 27) e em grupos
compactos fora da tela (ônibus, motos, lojas).

## Decisão

Um módulo em `src/render/ProjectionPruner.ts`, ligado ao `Renderer` do
`three` pelo `Game`, que:

1. escolhe **subárvores candidatas** (≥ 3 nós, raio ≤ 40 m, sem luz/LOD/
   skinned/instanced/`frustumCulled=false` desenhável) e guarda a esfera delas
   no espaço LOCAL da raiz;
2. no passe da câmera do jogo, ANTES de o `three` projetar, esconde
   (`visible=false`) a raiz de cada candidata fora do frustum — ou de cada
   candidata sem nada desenhável pela câmera — e devolve o `visible` logo
   DEPOIS da projeção.

### Alternativas consideradas

- **Bit por subárvore vindo do C++** (o espelho já corta por frustum): a
  agregação pai←filhos é trivial na memória linear do espelho, e o resultado
  seria exato para nós dinâmicos. Rejeitada agora: exige mudar o host nativo
  e a API do `NativeSceneMirror`, que outra frente está reescrevendo, por um
  ganho cujo teto é < 1 ms. Fica como evolução se o JS da poda pesar — a API
  mínima pedida seria `subtreeCulled(index)` lida de um buffer externo, como
  o `syncBuffer`.
- **Substituir `_projectObject` por cópia própria** que consulte uma flag por
  nó: poda exata e sem `visible` temporário, mas duplica código privado do
  `three` (quebra a cada versão; ver SPEC-0246) e põe um teste por nó de volta
  no laço que queremos encurtar.
- **Esconder pelo jogo** (cada sistema do DDD 61 esconder o que está fora da
  tela): espalha a regra e não serve a outros jogos.

### Por que `visible` temporário e só no passe da câmera

O `visible` alterado vive só durante a montagem da RenderList da câmera do
jogo. A passada de sombra (do `three`, que roda depois dentro de
`_renderObjects`, ou a nativa do SPEC-0245, que lê o `visible` no `update` do
espelho antes do render) vê a cena intacta — um caster fora da câmera mas
dentro do frustum da luz continua projetando sombra. O
`scene.onBeforeRender` (onde o lote de bonecos do DDD 61 lê o `visible` das
figuras) também roda antes da projeção.

## Consequências

- Esfera em cache supõe subárvore **rígida**: movimento relativo grande lá
  dentro (filho que se afasta da raiz) só é visto no rodízio de remedição
  (16 candidatas por passe) e pela folga (×1,25 + 1 m). Mudança de
  estrutura (`childadded`/`childremoved`) e de máscara de camadas da câmera
  remontam tudo; mudar `layers`/`frustumCulled` de uma malha SEM evento só é
  visto no rodízio — o jogo pode chamar `invalidate()`.
- Desligada no editor (objeto arrastado deixaria a esfera velha) e no quadro
  de aquecimento (precisa ver tudo para compilar pipelines). Ligada só no
  host nativo; `?projectionPrune=0` desliga para A/B.
- O ganho é pequeno frente ao quadro (ver SPEC-0322): a premissa de −2 a −3 ms
  não se sustenta com a medição corrigida.
