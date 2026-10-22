# ADR-0346 — Raycast de colisão (câmera e personagem) em C++ no host nativo

**Data:** 2026-10-09
**Status:** aceito (formato e medição na SPEC-0347)

## Contexto

Frente R4-B do ciclo "75 fps no export nativo do DDD 61". Depois da SPEC-0328
(grade XZ, `alongRay`, `firstHit`, árvore a partir de 64 triângulos na malha
cruzada), no Comercial a 3ª pessoa custa ~1,46 ms e o `CharacterPhysicsSystem`
~1,36 ms por quadro. O que sobra é custo **fixo por raio × malha no Hermes**
(~20 µs): ~0,67 ms em malhas com árvore BVH (fusões estáticas longas, ~45
candidatas por raio cuja caixa contém a origem), ~0,7 ms no laço por instância
do `instancedRaycast`, 0,3 ms da busca no índice e 0,6 ms do raio de chão. O
algoritmo já testa só o que o raio cruza; o que custa é o interpretador
executando a descida na árvore, a inversão de matriz e a montagem do acerto.

## Alternativas

1. **Seguir otimizando o JS** (cortar candidatas "largas", cache de matriz
   inversa por malha). Ganho incremental; o piso continua sendo ~10–20 µs de
   Hermes por malha testada.
2. **Ler do lado nativo a árvore do three-mesh-bvh** (serializar o
   `MeshBVH`). Reaproveita a árvore, mas exige montá-la ANTES no Hermes (o
   custo de montagem que hoje trava o 1º contato fica) e acopla o host ao
   formato interno de uma lib que muda entre versões.
3. **Árvore própria em C++ montada dos buffers da geometria** (escolhida). O
   JS entrega uma vez por geometria as posições (e o índice) — o host copia,
   monta a BVH e guarda por id; matrizes de instância sobem quando a `version`
   muda. Por raio, UMA chamada leva as candidatas (id da geometria, lado da
   face, id das instâncias) e as `matrixWorld.elements` delas — que no export
   já SÃO a memória do espelho da cena (`Float64Array` sobre o buffer nativo,
   SPEC-0234), então o C++ lê a mesma matriz que o JS leria, sem cópia e sem
   estado de cena próprio. Devolve o 1º acerto (distância, ponto, normal da
   face, candidata, instância).
4. **Índice inteiro em C++** (a grade da SPEC-0328 do lado nativo). Tiraria
   também os 0,3 ms do `alongRay`, mas duplica o índice e a lógica de folga
   por movimento; fica como próximo passo se a medição mostrar que ele virou
   o maior pedaço.

## Decisão

Alternativa 3, com o caminho JS intacto como referência e fallback:

- `__cortexRaycast` (host) é detectado em runtime; no browser/Studio não
  existe e tudo segue o caminho JS atual (mesma interface: `firstHit`).
- Malha que o nativo não reproduz fielmente (material em array, `raycast`
  sobrescrito, morph, `drawRange` parcial, posição não-`Float32`, matriz que
  não é `Float64Array`) fica no caminho JS dentro da MESMA consulta — o melhor
  dos dois vence.
- Semântica igual à do `three`: teste de triângulo portado do
  `Ray.intersectTriangle` (mesma ordem de operações e mesmos empates de
  borda), lado da face pelo `material.side`, `near`/`far` na distância em
  mundo, normal da face em espaço local (como o `three` devolve).
- Interruptor `?nativeRaycast=0` desliga (A/B na mesma build);
  `?nativeRaycastCheck=1` roda os dois caminhos e conta divergências (paridade
  na cena real).

## Consequências

- Uma cópia das posições das malhas de colisão vive no heap C++ (fora do teto
  do Hermes), e a árvore do three-mesh-bvh deixa de ser montada no export para
  as malhas que o nativo atende (menos memória JS e sem o pico de montagem no
  1º contato).
- A geometria é liberada pelo finalizador do token (`napi_wrap`) quando a
  geometria JS é coletada; geometria alterada no lugar (`version` da posição
  ou do índice muda) é re-enviada.
- A paridade é travada por um golden gerado do caminho JS
  (`native/tests/raycast_golden.h`, conferido no Vitest) e testado no
  `cortex_host_tests`. Mudou a semântica do `firstHit` em JS → regenere o
  golden e porte pro C++.
- Mudou o host: precisa recompilar (`yarn build:host`) e re-exportar.
