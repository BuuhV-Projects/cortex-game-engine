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
   - **A caixa só é recalculada pra quem se mexeu** (esfera OU o 3×3 da `matrixWorld`
     mudou — giro no lugar não muda a esfera mas muda a caixa). Na 1ª versão a caixa
     (8 cantos transformados) era refeita pra todas as ~900 malhas a cada varredura, nas
     duas listas: no Comercial a câmera subiu de 1,97 para 3,53 ms/q no A/B. A parada
     reaproveita a caixa guardada.

## Consequências

- No meio da rua os raios de parede somem (a caixa não toca nada); encostado numa
  parede, só a malha dela recebe os 12 raios.
- A folga menor vale também pra câmera (mesmo índice) e pro chão.
- Malha parada que começa a andar rápido (> 2 m/s) pode ficar até 250 ms fora do
  filtro no começo do movimento — mesmo tipo de atraso que o teletransporte já tinha.
- Testes: `tests/physics/nearMeshes.test.ts` (folga estática × móvel; `touchingBox`
  com BVH `indirect`), `tests/systems/CharacterPhysics.test.ts` (parede empurra igual).

## Medição

Export release (sem `--debug`) do DDD 61, `?cortexDebug=perf&systemProfile=1&cortexHud=1`, 120 s por rodada, t ≥ 30 s, rodadas serializadas pela `measure.lock`. A = engine main 13555386 + jogo main 761c5df; B = as duas branches `perf/r2-world-update` (engine SPEC-0323 + jogo SPEC-0121). ms por quadro (média).

| ponto | | fps (1000/med) | quadro med/p95 | world | update | CharacterPhysics | VehicleControl | 3ª pessoa | VehicleLights |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Setor O | A | 45,9 | 21,8 / 25,4 | 5,57 | 4,01 | 2,38 | 1,59 | 0,86 | 0,61 |
| Setor O | B | 48,1 | 20,8 / 27,8 | 4,51 | 3,95 | 1,70 | 1,49 | 0,79 | 0,59 |
| Comercial (A,B) | A | 38,5 | 26,0 / 34,1 | 7,13 | 5,25 | 2,66 | 1,52 | 2,05 | 0,85 |
| Comercial (A,B) | B | 41,3 | 24,2 / 34,8 | 6,69 | 4,92 | 1,90 | 1,62 | 2,53 | 0,84 |
| Comercial (B,A) | B | 40,8 | 24,5 / 32,9 | 6,72 | 4,98 | 1,86 | 1,65 | 2,44 | 0,83 |
| Comercial (B,A) | A | 38,9 | 25,7 / 31,0 | 6,85 | 5,09 | 2,65 | 1,52 | 2,07 | 0,87 |
| Hélio dirigindo | A | 54,6 | 18,3 / 25,2 | 4,35 | 3,70 | 1,87 | 1,60 | 0,49 | 0,63 |
| Hélio dirigindo | B | 55,6 | 18,0 / 26,2 | 4,07 | 3,66 | 1,56 | 1,57 | 0,55 | 0,59 |

Leitura: `CharacterPhysics` −0,3 a −0,8 ms em todo ponto (paredes sem raio no meio da rua, menos candidatas). ⚠️ No Comercial a câmera da 3ª pessoa SUBIU +0,4–0,5 ms nas duas ordens (≈900 alvos; a varredura agora testa giro e refaz a caixa de quem anda) — ganho líquido do `world` ali é só −0,15 a −0,45 ms. Pendência: medir `tpCollect` x `tpRays` com a sonda e, se for a varredura, dar índice só de esfera pra câmera.
