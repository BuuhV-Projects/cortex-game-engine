# SPEC-0729 - buildScene sem trabalho redundante no host

**Data:** 2026-11-13
**Status:** em andamento

## Contexto

No export nativo do Port Hollow (Hermes sem JIT, numa thread), o `buildScene` leva 21–26 s, contra 1,8 s no
navegador. Quatro rodadas com o profiler de boot (SPEC-0217) e marcas temporárias mostraram onde vai o tempo (rodada 4,
21,2 s, 2.615 nós):

| Parte | ms | |
|---|---|---|
| 1º `CharacterPhysicsSystem.collect`: `ensureBoundsTree` em 349 malhas (2,26 M triângulos, three-mesh-bvh em JS) | 6.923 | 33% |
| `new Terrain` ×203: `computeVertexNormals` 3.637, `setIndex(number[])` 1.170, `computeBoundingSphere` 722 | 5.770 | 27% |
| `buildRoads` (`moldTerrainToRoads`: normais e esfera dos 203 terrenos de novo pelo `applyHeights`) | 2.519 | 12% |
| cessões de quadro (a maior parte é o `perfTrace` do export `--debug`) | ~4.000 | 19% |
| modelos, vegetação, primitivas, colliders, merge | ~900 | 9% |

Depois do `buildScene`, um 2º collect ainda monta 1,8–2,3 s de BVH nas malhas `static-merged-*`, que o merge criou.

- **A BVH em JS é redundante no host.** Os raios da física e da câmera vão para o C++ (SPEC-0347, `nativeRaycast`),
  e a árvore JS só serve à malha que o host não reproduz (`route` → `Route.Js`). O `jsFirstHit` já monta a árvore
  sob demanda nesse caso. Mesmo assim, o collect chama `ensureBoundsTree` em toda malha pisável, visível ou
  preparada (SPEC-0307).
- **O `Terrain` usa o caminho genérico do three**: `Vector3` por vértice nas normais, índice em `number[]`
  convertido num segundo laço, e a esfera calculada com `fromBufferAttribute`. Para uma grade regular, isso tudo cabe
  num laço direto sobre `Float32Array`.

## Decisão

### 1. BVH em JS só para a malha que o host não reproduz

- `nativeRoutable(o)` (`src/physics/nativeRaycast.ts`): `true` quando o raycast nativo está ativo e `o` passa pelas
  mesmas regras do `route`. As regras são: malha não batched, `raycast` padrão, material único, `matrixWorld` em
  `Float64Array` e geometria registrável (posição `Float32Array` não normalizada, sem morph, índice Uint16/Uint32,
  `drawRange` cheio). Para `InstancedMesh`, as instâncias também precisam registrar. Registrar agora a geometria no
  host é o que o 1º raio faria de qualquer jeito.
- O `CharacterSceneCollector.visit` (`src/physics/characterCollect.ts`) só chama `ensureBoundsTree` quando
  `!nativeRoutable(o)`, nos dois lugares: na malha visível pisável e na escondida preparada (SPEC-0307).
- No navegador, `nativeRaycastActive()` é falso e tudo continua como antes.
- Uma malha que deixe de ser roteável depois cai no `jsFirstHit`, que monta a árvore sob demanda, como hoje.

### 2. Terreno em arrays planos

Um módulo novo, `src/scene/terrainGrid.ts`, com funções puras:

- `gridIndex(resolution)`: o índice da grade (`a, c, b, b, c, d` por célula, a mesma ordem de hoje) num
  `Uint16Array`, ou num `Uint32Array` quando `(res+1)² > 65.535`. É a mesma escolha do `setIndex` do three. O molde
  fica em cache por resolução, e cada terreno recebe uma cópia: compartilhar o `BufferAttribute` faria o `dispose` de
  um soltar o buffer dos outros.
- `gridNormals(positions, index, normals)`: as normais com a mesma aritmética do `computeVertexNormals` do three,
  operação por operação (produto vetorial `(C−B)×(A−B)` acumulado no `Float32Array` em cada vértice do triângulo,
  depois `x · (1/‖n‖ || 1)`). O resultado é idêntico bit a bit.
- `gridBoundingSphere(positions)`: a mesma esfera do `computeBoundingSphere` (centro da caixa e o maior raio até os
  vértices), sem `Vector3`.

O `Terrain` usa essas funções no construtor e no `applyHeights`, que também passa a escrever o Y direto no array da
posição. O atributo de normal é reaproveitado e marcado com `needsUpdate`, como o three faz.

### Fora do escopo (medido, ficou para depois)

- Orçamento de cessão maior no host: ganharia ~0,6–1 s, mas a tela de loading passaria a ~4 quadros por segundo.
- Divisão e poda do `moldTerrainToRoads`, além do que o item 2 já tira dele.
- `makeVegetation` sem clone (~0,4 s), primitiva de collider com geometria compartilhada (~0,2 s), `mergeStaticScene`
  (~0,2 s).
- Cook do JPG embutido em GLB para KTX2: não pesa dentro do `buildScene`, só antes dele.

## Consequências

- O ganho esperado no host é de ~9–13 s com o item 1 (as duas coletas) e ~5,5–6 s com o item 2.
- Nada muda no navegador nem no resultado: o raio dá o mesmo acerto, e as normais e a esfera saem iguais.
- A memória de BVH cai no host: as árvores JS das malhas roteáveis deixam de existir.
