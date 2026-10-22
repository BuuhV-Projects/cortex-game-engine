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

(preenchida após o A/B no export release)
