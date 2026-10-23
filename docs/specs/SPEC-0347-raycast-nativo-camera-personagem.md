# SPEC-0347 - Raycast nativo da câmera e do personagem (`__cortexRaycast`)

**Data:** 2026-10-09
**Status:** aceito
**Decisão:** ADR-0346

## Contexto

Frente R4-B do ciclo "75 fps no export nativo" do DDD 61. Ver ADR-0346: depois
da SPEC-0328 o custo da câmera (1,46 ms) e do personagem (1,36 ms) no Comercial
é o custo fixo do Hermes por raio × malha (~20 µs), não o algoritmo.

## Decisão

### Ponte do host: `__cortexRaycast`

`native/src/physics/raycast/` (puro, testado no `cortex_host_tests`) +
`native/src/shims/raycast_shim.*` (NAPI):

| função | o que faz |
| --- | --- |
| `addGeometry(posições: Float32Array, passo, deslocamento, vértices, índice: Uint16Array \| Uint32Array \| null) → token \| null` | copia os triângulos (posição em `float`, como no buffer), monta a BVH (corte pela mediana do eixo mais longo dos centróides, folha de até 4 triângulos) e devolve um token `{ id }`. O token é `napi_wrap`: quando o JS o perde (a geometria foi coletada), o finalizador apaga a geometria do host. `passo`/`deslocamento` em floats cobrem o atributo intercalado do GLB cozido. |
| `addInstances(matrizes: Float32Array, quantas) → token \| null` / `setInstances(token, matrizes, quantas) → bool` | matrizes de instância (`instanceMatrix.array`, coluna-maior), re-enviadas quando `version` ou `count` mudam. |
| `first(raio: Float64Array(8), n, slots: Int32Array(3n), matrizes: Array<Float64Array>, entradas: Float64Array, saída: Float64Array(8)) → número` | `raio` = origem, direção (unitária), `near`, `far`; por candidata `slots` = (id da geometria, `side`, id das instâncias ou −1) e `matrizes[i]` = a `matrixWorld.elements` dela; `entradas[i]` = distância em que o raio entra na caixa (SPEC-0328, ordem crescente). Devolve o índice da candidata do 1º acerto (ou −1, ou −2 argumentos inválidos) e grava em `saída` distância, ponto (mundo), normal da face (local, como o `three`) e `instanceId` (−1 sem instância). |

Semântica (igual ao caminho JS):

- Raio levado ao espaço local pela inversa da `matrixWorld` (em `double`), com a
  direção **sem normalizar**: o parâmetro do raio local é a distância em mundo,
  então `near`/`far` e a ordem entre malhas são exatos.
- Triângulo: porte literal do `Ray.intersectTriangle` do `three` (mesmos
  sinais, mesmos empates de borda); `BackSide` testa (c, b, a) com descarte de
  face de trás, `FrontSide` (a, b, c) com descarte, `DoubleSide` sem descarte.
- Distância reportada = |origem − ponto em mundo| (como o `three`), tem de cair em
  `[near, far]`.
- Candidatas em ordem de entrada; para quando a próxima entra além do melhor
  acerto (mesma poda do `firstHit` JS).
- `InstancedMesh`: por instância, matriz = `matrixWorld × instância`; descarte
  pela esfera da instância (esfera da geometria — centro da caixa, maior
  distância a um vértice — levada ao mundo, com folga relativa 1e-6). As esferas
  em mundo ficam em cache enquanto a `matrixWorld` e as instâncias não mudam.

### Lado do engine: `src/physics/nativeRaycast.ts`

- `firstHit` (nearMeshes) e a colisão de parede do `CharacterPhysicsSystem`
  passam por `firstHitAmong(raycaster, candidatas, entradas, skip)`. Com a ponte
  ativa, cada candidata que passa em `layers` e no `skip` vai pro nativo se for
  **fiel**: `raycast` = o do protótipo (patch do `raycastAccel`), material único
  (não array, definido), sem `morphAttributes.position`, `drawRange` cheio,
  posição `Float32Array` com `itemSize` ≥ 3 (atributo comum ou intercalado),
  índice `Uint16Array`/`Uint32Array` ou nenhum, e `matrixWorld.elements`
  `Float64Array` (no export é a fatia do espelho). As demais vão pelo caminho
  JS (o de hoje) e o menor dos dois acertos vence.
- Geometria registrada uma vez por `BufferGeometry` (`WeakMap` → token, versões
  da posição e do índice); versão mudou → token novo. Malha atendida pelo nativo
  NÃO ganha árvore do three-mesh-bvh.
- O acerto volta como `Intersection` do `three`: `distance`, `point`, `object`,
  `face.normal` (local), `instanceId`.
- `?nativeRaycast=0` desliga (A/B na mesma build). `?nativeRaycastCheck=1` roda
  também o caminho JS em toda consulta e loga (`debug('perf')`, a cada
  `CHECK_LOG_EVERY` consultas) quantas divergiram (objeto diferente ou distância
  além de `CHECK_TOLERANCE`), quantas tiveram acerto e quantas candidatas foram
  pro C++ e pro JS — sem esses dois, "0 divergências" sairia também de um raio que
  nunca acerta ou de uma rota que manda tudo pro JS.

### Paridade

`tests/physics/nativeRaycastGolden.test.ts` monta uma cena determinística (malha
com e sem árvore, escala não-uniforme + giro, os três `side`, índice 16/32 bits
e sem índice, atributo intercalado, `InstancedMesh`) e dispara ≥ 200 raios
aleatórios com o `firstHit` JS. O resultado vira `native/tests/raycast_golden.h`
(`CORTEX_WRITE_RAYCAST_GOLDEN=1` regrava; sem a variável, o teste falha se o
golden não bate com o JS de hoje). O `raycast_parity_test.cpp` monta a mesma cena
no `RaycastWorld` e exige o mesmo objeto, instância e distância/ponto
(tolerância 1e-5 m).

O roteamento do lado JS com a ponte ativa (`tests/physics/nativeRaycastRoute.test.ts`,
ponte falsa) trava: registro único por geometria e re-registro quando a `version`
muda, material em array no caminho JS com o menor acerto vencendo, `skip` tirando
a candidata antes da ponte e instâncias re-enviadas quando mudam.

## Consequências

- Câmera e personagem pagam por raio uma chamada de ponte + o trabalho em C++,
  em vez de ~20 µs de Hermes por malha candidata.
- O `alongRay` (0,3 ms) continua em JS — próximo candidato se pesar (ADR-0346,
  alternativa 4).
- Host novo: recompilar (`yarn build:host`) e re-exportar. Engine novo com host
  velho: a ponte não existe e tudo segue em JS.

## Medição

Export release do DDD 61 na main do jogo (`e2be01c`), engine desta branch (com a main
`7fb9421e`), kit SPEC-0382: mesma build, braço A = nativo ligado, B = `&nativeRaycast=0`,
`&perf=1` nos dois, 135 s por rodada, 2 réplicas intercaladas (AB, depois BA), 16 rodadas
válidas. ms por quadro, média das 2 réplicas (t ≥ 30 s):

| ponto | world A / B | personagem A / B | câmera 3ª pessoa A / B |
| --- | --- | --- | --- |
| setorO | 3,02 / 3,56 | 1,39 / 1,65 | 0,43 / 0,76 |
| centro | 3,39 / 3,91 | 1,43 / 1,55 | 0,53 / 0,81 |
| comercial | 3,52 / 5,45 | 1,45 / 2,32 | 0,81 / 1,90 |
| ac | 3,41 / 3,56 | 1,28 / 1,39 | 0,51 / 0,61 |

- O `world` cai 0,15–0,54 ms (comercial 1,2 ms no par limpo; o 1º par do comercial
  pegou a máquina carregada — o `render`, que o raycast não toca, subiu 5 ms junto).
  Personagem e câmera ficam mais baratos nos 4 pontos.
- O quadro (`frameMs`) não serve de juiz aqui: o `render` varia com os `draws` (trânsito
  e NPCs do momento, ±10–13 draws entre braços) bem mais do que o ganho do raycast.
- Paridade na cena real (`?nativeRaycastCheck=1`, comercial, jogo `dff1386`): 9.000
  consultas, 5.707 com acerto, 0 divergências; 80 % das candidatas no C++.
- **Dirigindo** (`helio&drive=1`, com a correção do Rapier da SPEC-0394; piloto
  automático pela Hélio Prates, 319–396 m por rodada com t ≥ 30 s; 150 s, 2 réplicas,
  4 rodadas válidas): world 3,74 / 4,12, personagem 1,79 / 2,01, câmera 0,66 / 0,94
  (A / B). O `frameMs` bate no teto de 100 ms em 2–6 amostras por rodada nos dois
  braços (carga da cidade ao dirigir) e não entra na comparação.
