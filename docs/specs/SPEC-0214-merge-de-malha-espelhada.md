# 0214 - Merge de malha espelhada (winding invertido)

**Data:** 2026-09-19
**Status:** aceito

## Contexto

No export nativo do kart-racer, árvores e prédios aparecem **pretos** na vista
panorâmica do circuito — silhuetas escuras no lugar do modelo iluminado. No
Studio a mesma cena está correta.

A diferença entre as duas pilhas é o **merge estático** (SPEC-0120), que liga por
padrão só no host nativo (no Studio fica fora porque o editor precisa dos objetos
individuais).

### A causa

O merge "assa" a matriz de mundo de cada malha na geometria
(`geometry.applyMatrix4`). Para uma malha **espelhada** — escala negativa em
algum eixo, comuníssimo em cenário autorado, é como se duplica uma árvore virando
ela do avesso — a matriz tem **determinante negativo**.

O `applyMatrix4` do three trata as normais corretamente (usa a matriz normal),
mas **não reverte a ordem dos vértices** de cada triângulo. Resultado: a face
fica com o winding invertido, o backface culling a descarta e o que sobra é a
face de trás, sem luz.

Medido com um merge de duas caixas, uma delas em `scale.set(-1, 1, 1)`:

```
RESULTADO: 12 triangulos coerentes, 12 VIRADOS (de 24)
```

Exatamente a metade — a malha espelhada inteira.

### Por que apareceu agora

O bug é antigo (nasceu com a SPEC-0120), mas ficava escondido: antes do cache de
preset de material (SPEC-0196), cada malha tinha o **próprio** material, então
quase todo grupo tinha tamanho 1 e o merge não acontecia. Com os materiais
compartilhados, os grupos passaram a ter dezenas de malhas — e toda malha
espelhada do cenário começou a fundir, e a escurecer.

É um bom lembrete de que otimização que muda o agrupamento de dados pode acordar
defeitos latentes em quem consome esse agrupamento.

## Decisão

Ao assar uma matriz de **determinante negativo**, o merge inverte o winding da
geometria logo depois do `applyMatrix4`.

```ts
g.applyMatrix4(matrix);
if (matrix.determinant() < 0) flipWinding(g);
```

`flipWinding` troca os dois últimos vértices de cada triângulo:

- **geometria indexada** (o caso dos `.glb`): troca no índice, sem mexer nos
  atributos — é barato e não realoca nada;
- **não indexada**: troca os dados do vértice 1 com os do 2 em **todos** os
  atributos, porque não há índice onde corrigir. Gerar um índice aqui não serve:
  o `mergeGeometries` exige que todas as partes do grupo concordem em ter ou não
  ter índice, e a assinatura de atributos já foi decidida no agrupamento.

Vale para os **dois** merges — `mergeStaticScene` (SPEC-0120) e `mergeSubtree`
(SPEC-0213) —, porque os dois assam matriz na geometria e correm o mesmo risco.

## Consequências

- Malha espelhada volta a ser desenhada com a face certa no export. Some o
  sintoma "objeto preto" do cenário.
- Custo: uma passada no índice por malha espelhada, só no merge (uma vez, no
  build da cena). Malha não espelhada não paga nada — a checagem é um
  determinante.
- Cenas já exportadas precisam ser exportadas de novo para pegar a correção.

## Validação

`tests/scene/mergeWinding.test.ts` — para os dois merges:

- malha espelhada fundida fica com **todos** os triângulos coerentes (normal do
  atributo concorda com a normal geométrica do winding);
- malha normal continua coerente (a correção não inverte quem estava certo);
- espelhada e normal no mesmo grupo: as duas saem coerentes;
- geometria **não indexada** espelhada também sai coerente;
- espelhamento em dois eixos (determinante POSITIVO) não é invertido — é
  rotação, não espelhamento.
