# ADR-0327 — Poda da projeção do `three`: só subárvores sem desenhável na câmera, por `visible` temporário

**Data:** 2026-10-09
**Status:** rejeitado (medição na SPEC-0326)

## Contexto

Frente R2-D do ciclo "75 fps no export nativo do DDD 61". A sonda da R1b
apontou `_projectObject` com ~5,0 ms/quadro e 1.294 chamadas, numa árvore de
~10 mil nós em que o `three` visita nó a nó o que o espelho de cena em C++
(SPEC-0234) já sabe estar fora do frustum.

A remedição (SPEC-0326) mostrou que **os 5,0 ms eram dupla contagem** (a
sonda embrulhava toda chamada recursiva e somava tempo inclusivo por nível).
O custo real é **~1,1–1,2 ms/quadro**, e das ~1.450 visitas por quadro ~720
não empurram nada. Dessas, **~600 estão em subárvores SEM nada desenhável pela
câmera** (bonecos cujas peças ficam na camada 27 e são desenhadas por um lote
instanciado; efeitos sem malha) e só ~110 em grupos com malha fora do frustum
(ônibus, motos, interiores de loja).

## Decisão

`src/render/ProjectionPruner.ts`, ligado ao `Renderer` do `three` pelo
`Game`: acha as subárvores (≥ 3 nós) sem luz/LOD/grupo especial e sem
malha/linha/pontos/sprite na camada da câmera e, no passe da câmera do jogo,
esconde (`visible=false`) a raiz delas durante a projeção, devolvendo o
`visible` logo depois. A RenderList sai idêntica à do `three`.

### Alternativas consideradas

- **Poda por frustum com esfera por subárvore (JS)** — implementada, medida e
  RETIRADA. A esfera em cache supõe subárvore rígida; num grupo parado com
  filho que anda (moto e piloto, NPC), a esfera fica velha e o objeto some: no
  A/B a moto da Hélio Prates sumiu e `tris` caiu 8–18% — o "ganho" de
  2–3 ms vinha de desenhar menos, não de projetar mais rápido. Validar a
  rigidez por quadro custa o que a poda economiza, e o teto dela era ~110
  visitas (~0,08 ms).
- **Bit por subárvore vindo do C++** (o espelho já corta por frustum, com a
  matriz certa de cada nó): exato também para nós dinâmicos. Fica como
  evolução se a poda por frustum valer a pena um dia; exige API nova no
  `NativeSceneMirror` (`subtreeCulled` num buffer externo, como o
  `syncBuffer`) e no host.
- **Cópia própria de `_projectObject`** consultando uma flag por nó: duplica
  código privado do `three` (SPEC-0246) e põe um teste por nó de volta no laço.

### Por que `visible` temporário e só no passe da câmera

O `visible` alterado vive só durante a montagem da RenderList da câmera do
jogo. A passada de sombra (do `three`, depois, dentro de `_renderObjects`; ou a
nativa do SPEC-0245, que lê o `visible` no `update` do espelho antes do render),
o `scene.onBeforeRender` (onde o lote de bonecos lê o `visible`) e a varredura
de flags do espelho (SPEC-0322) veem a cena intacta.

## Consequências

- Exata por construção: a poda só pula nó em que a visita do `three` não faz
  nada. O risco que sobra é uma malha mudar de camada (ou nascer desenhável)
  dentro de uma candidata SEM evento de estrutura: o rodízio (4 candidatas
  por passe) e a remontagem a cada 120 passes pegam; `invalidate()` força.
- Desligada no editor, na inspeção, no carregamento e no quadro de
  aquecimento. Ligada só no host nativo; `?projectionPrune=0` desliga para A/B.
- **Medido e rejeitado** (SPEC-0326): −40% de visitas mas só ~0,08 ms a menos
  na projeção (o caro é a malha, não o grupo), e o próprio pruner custa
  0,3–0,8 ms/q; o A/B de fps fica no ruído. O código não entra na main; fica no
  histórico do branch `perf/r2-poda-projecao`. A meta de −2 a −3 ms partia do
  número inflado da R1b.
