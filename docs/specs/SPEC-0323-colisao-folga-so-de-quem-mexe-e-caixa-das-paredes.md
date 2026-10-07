# SPEC-0323 - Colisão do personagem: folga só pra quem se mexe + caixa antes dos raios de parede

**Data:** 2026-10-07
**Status:** aceito

## Contexto

Frente R2-C do ciclo "75 fps no export nativo" do DDD 61. Depois da SPEC-0320, o
`world` ainda custa 5–7 ms/quadro no export release. A sonda por fase dentro dos
sistemas (export release, spawn do Setor O, ms por quadro) mostrou:

| fase | ms/q | candidatas por quadro |
| --- | --- | --- |
| `CharacterPhysicsSystem` — 12 raios de PAREDE | 1,73 | 33 malhas |
| `CharacterPhysicsSystem` — 1 raio de CHÃO | 0,80 | 96 malhas |
| `ThirdPersonControlSystem` — 2 raios da câmera | 0,85 | 80 malhas |
| varreduras (as duas, amortizadas) | 0,41 | — |
| `World.query` (todos os sistemas) | 0,04 | — |

Duas causas:

1. **Folga de 5 m pra tudo.** O `NearMeshIndex` (SPEC-0302) soma
   `MOVING_MARGIN` = 5 m ao raio de TODA esfera, pra cobrir o que anda entre duas
   varreduras (250 ms). Quase tudo na cidade é parado, e a folga transforma o filtro
   "o que alcança o ponto" num disco de ~12 m em volta de cada casa: 96 malhas pra um
   raio vertical.
2. **Paredes testam tudo, 12 vezes.** Os 12 raios (±X/±Z × 3 alturas) vão contra
   todas as candidatas em todo quadro, mesmo no meio da rua, sem parede a menos de
   0,4 m. Cada raio × malha paga inversão de matriz + teste de esfera/caixa + BVH.

## Decisão

1. **Folga por malha (`NearMeshIndex.rebuild`).** O índice guarda a esfera em mundo
   da varredura anterior de cada malha (`WeakMap`). Se o centro ou o raio mudaram
   mais que `MOVE_EPSILON` (1 mm) — ou é a 1ª vez que a malha aparece — ela usa
   `MOVING_MARGIN` (5 m, como antes); senão usa `STATIC_MARGIN` (0,5 m).
   - 0,5 m cobre quem COMEÇA a andar logo depois da varredura (parado → 2 m/s² por
     250 ms anda 6 cm; um elevador a 2 m/s anda 0,5 m).
   - Teletransporte continua igual a antes: fica até uma varredura sem colisão no
     ponto novo (com 5 m também ficava).
2. **Caixa das paredes antes dos raios (`touchingBox`).** Os 12 raios de parede só
   tocam o que está dentro da caixa que eles varrem: `x ± (raio + SKIN)`,
   `z ± (raio + SKIN)`, `y` entre a altura do raio de baixo e a do de cima (+1 mm de
   folga numérica). Antes dos raios, cada candidata com árvore BVH (não instanciada)
   faz UM `boundsTree.intersectsBox(caixa, inversa(matrixWorld))` — teste exato
   caixa × triângulos; a que não toca sai da lista. Sem árvore (pequena e compacta)
   ou instanciada: fica (raio normal).
   - Resultado idêntico: um acerto de raio é um ponto de triângulo dentro da caixa;
     o filtro só é conservador (ignora `side` do material, que o raio respeita).
   - Alternativa descartada: trocar os 12 raios por consulta de ponto mais próximo
     (`closestPointToPoint`) — mudaria a resposta da colisão (depenetração por eixo
     vira radial) e exigiria re-tunar a gameplay.

3. **Caixa em mundo no índice.** A 1ª rodada A/B (itens 1–2) baixou o
   `CharacterPhysics` só ~0,5 ms e a câmera quase nada: as candidatas são malhas
   grandes e compridas (rua, fileira de casas, célula fundida) cuja ESFERA cobre o ponto
   mesmo longe da geometria, e rejeitá-las no raycast do three custa ~4–8 µs por
   raio × malha. O índice passa a guardar também a caixa alinhada (AABB) em mundo de
   cada malha (`worldBox`, mesma folga) e só devolve a malha se a esfera **e** a caixa
   alcançam — as duas contêm a geometria, então o filtro continua conservador.
   `nearXZ`/`near` testam a caixa primeiro (4–6 comparações).

## Consequências

- No meio da rua os raios de parede somem (a caixa não toca nada); encostado numa
  parede, só a malha dela recebe os 12 raios.
- A folga menor vale também pra câmera (mesmo índice) e pro chão.
- Malha parada que começa a andar rápido (> 2 m/s) pode ficar até 250 ms fora do
  filtro no começo do movimento — mesmo tipo de atraso que o teletransporte já tinha.
- Testes: `tests/physics/nearMeshes.test.ts` (folga estática × móvel; `touchingBox`
  com BVH `indirect`), `tests/systems/CharacterPhysics.test.ts` (parede empurra igual).

## Medição

Ver a seção de A/B no fim (preenchida após as rodadas).
