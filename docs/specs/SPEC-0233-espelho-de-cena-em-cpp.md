# 0233 - Espelho de cena em C++ (fase 2 do ADR-0232)

**Data:** 2026-09-20
**Status:** aceito — fase 2 medida

## Contexto

A fase 1 do ADR-0232 mediu o teto: o laço por objeto custa **2,2 us em C++**
contra **33,5 us em JS**, no mesmo host. A fase 2 é o que torna esse número
alcançável — a hierarquia de cena passa a viver em C++.

O detalhe que define o desenho, e que já custou caro uma vez: **meio caminho
não serve**. Se o C++ calcular as matrizes e o `three` continuar desenhando, as
matrizes precisam voltar para o JS **por objeto**, e a travessia de ponte (15 us
por objeto, SPEC-0225) devolve o ganho. Foi exatamente assim que a hipótese de
mover só a submissão morreu.

Por isso a fase 2 não entrega render ainda: ela entrega a **estrutura** e prova,
com número, que a travessia e o culling em C++ valem o que a fase 1 prometeu.

## O que a cena tem hoje (medido)

Do trace do `kart-racer`, com os assets já refinados:

| | valor |
| --- | --- |
| nós na árvore | ~1.000-1.300 |
| nós visíveis | ~900-1.075 |
| **nós cuja matriz local MUDA por frame** | **63** |
| custo em JS de matriz + culling | 8,5 ms por frame |

Os 63 são as raízes dos carros e os pivôs de roda. É o número que justifica o
formato de sincronização: **o JS manda o que mudou, não a cena inteira**.

## Decisão

`native/src/scene/scene_mirror.{h,cpp}` — uma cópia da hierarquia em C++, em
memória linear, com três operações:

1. **`build(nós)`** — recebe a árvore uma vez: índice do pai, transform local,
   raio da esfera de recorte, flag de visível. A ordem é **pai antes de filho**,
   o que permite a travessia ser um laço linear em vez de recursão.
2. **`applyTransforms(pares)`** — por frame, recebe só os índices que mudaram e
   seus transforms. 63 atualizações, não 1.300.
3. **`updateAndCull(viewProj, planos)`** — compõe a matriz local de quem mudou,
   propaga a matriz de mundo para a subárvore e testa o frustum, devolvendo a
   lista de visíveis.

### Por que memória linear, e não uma árvore de ponteiros

Um `Object3D` por nó, com `children` em vetor, é o desenho natural em C++ e o
errado aqui: a travessia por frame vira perseguição de ponteiro, com um cache
miss por nó. Em memória linear com **pai antes de filho**, a propagação da
matriz de mundo é uma passada sequencial — o pai já foi calculado quando o
filho chega, e o acesso é previsível para o cache.

É a diferença entre "C++ em vez de JS" e "C++ escrito como se fosse JS". O
número da fase 1 (2,2 us) veio de um laço linear; um grafo de ponteiros pode
devolver boa parte disso.

### Formato do buffer de sincronização

Uma travessia de ponte **por frame**, não por objeto: o JS escreve num
`Float32Array` e chama uma função só. Por nó atualizado, 11 floats — índice,
posição (3), quaternion (4), escala (3):

```
[ idx, px, py, pz, qx, qy, qz, qw, sx, sy, sz ] × N
```

O índice vai como `float` por simplicidade de layout; com 1.300 nós isso é
exato (float32 representa inteiros até 2^24 sem perda), e a spec registra o
limite.

### O que fica de fora desta fase

- **Submissão e materiais** — são as fases 3 e 4. Aqui o resultado do culling
  ainda não desenha nada; é medido isoladamente.
- **Skinning e animação por osso** — a matriz de um osso muda por frame e a
  regra dos "63 que mudam" não vale para ele. Fica no caminho do `three` até a
  fase 4 decidir.

## Como medir

Dois números, no mesmo host e com a mesma cena de 1.300 nós:

- **JS (hoje):** `cpu.rpMatrix + cpu.rpProject` = 8,5 ms por frame (SPEC-0227).
- **C++ (esta spec):** o mesmo trabalho, cronometrado no `render_bench`.

A fase 2 só é considerada boa se o C++ ficar **abaixo de 1 ms** — qualquer
coisa acima disso significa que a estrutura está errada, porque a fase 1 já
mostrou que o trabalho cabe em muito menos.

## Resultado (20/09/2026)

1.300 nós, 63 mudando por frame, 300 frames, 10 de aquecimento:

| caminho | ms por frame |
| --- | --- |
| JS (three no Hermes, SPEC-0227) | 8,5 |
| **C++ (este espelho)** | **0,023** |

Passou com folga do critério de 1 ms — e no **pior caso**: na cena do teste as
raízes se movem, então os 1.300 nós recompõem a matriz de mundo, sem aproveitar
o salto de quem não mudou.

O que sustenta o número é a estrutura, não a linguagem: memória linear com pai
antes de filho, propagação numa passada sequencial e flag de sujo que o pai
deixa para o filho encontrar. Um grafo de ponteiros em C++ devolveria boa parte
disso em cache miss.

**O que isto ainda NÃO faz:** mudar o fps do jogo. As fases 1 e 2 mediram o
teto; o ganho só chega ao jogador quando o JS parar de fazer matriz e culling e
o C++ passar a submeter com os materiais reais — fases 3 e 4.
