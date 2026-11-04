# SPEC-0674 — Coleta incremental do personagem e terreno sem varrer entidades

**Data:** 2026-11-04
**Status:** implementado

## Contexto

No export nativo do DDD 00 (Port Hollow, Hermes sem JIT), o `world` mede 18–22 ms por quadro, com o
`CharacterPhysicsSystem` em 30–35% (~6–7 ms) e o `TerrainCollisionSystem` em ~10%. A cena tem ~14,6 mil nós,
~2,1 mil entidades ECS e **um** `CharacterBody` (o jogador). O jogo não usa `KinematicBody` nem `PlatformerBody`.

Medido numa bancada sintética do mesmo porte (V8 `--jitless`, só interpretador, 1.200 passos de 16 ms: terreno,
144 pedestres `cortexNoCollide`, 116 carros de 15 nós, 200 células de 40 malhas com 3/4 escondidas, 1.500 árvores
sólidas):

| Parte | Custo |
| --- | --- |
| `CharacterPhysicsSystem` (média por passo) | ~1,2 ms |
| passo com coleta (a cada `COLLECT_INTERVAL_MS`) | ~12,5 ms (pico) |
| …dos quais `NearMeshIndex.rebuild` (3 índices) | ~9,3 ms (73%) |
| …travessia + classificação | ~3,4 ms |
| passo sem coleta (raios + troncos) | ~0,4 ms |
| `TerrainCollisionSystem` (média por passo) | ~0,7 ms, para achar **zero** corpos |

Origem de cada custo:

1. **Rebuild dos índices refaz tudo.** A cada 250 ms o `NearMeshIndex.rebuild` busca o registro anterior de
   cada malha num `WeakMap`, reescreve as 10 floats de cada uma e **remonta a grade XZ inteira** (esvazia as
   listas de todas as células e reinsere cada malha), mesmo que nada tenha se mexido.
2. **A travessia** (`traverseCollidable`) chama uma closure por nó, desce por `for…of` e, para cada malha,
   sobe aos ancestrais (`isSolid`). Ela **já poda** `cortexNoCollide`, `editorInternal` e as subárvores
   escondidas já preparadas (SPEC-0307/0320): os 14,6 mil nós não são visitados, só os colidíveis visíveis.
3. **Troncos.** `Vegetation.getInstances()` copia todas as instâncias a cada coleta (`slice`: lixo) e o passo
   testa **todos** os troncos (`O(nº de árvores)` por quadro).
4. **Alocações por passo.** Closures `skip`/`cast` por entidade e por passo, e o objeto de entrada/saída do
   `resolveWallPush`.
5. **`TerrainCollisionSystem`** declara `requiredComponents = []`: recebe as ~2,1 mil entidades e faz até
   4 buscas em `Map` por entidade (`Terrain`, `Transform`, `PlatformerBody`, `KinematicBody`), e inverte a
   matriz do terreno por corpo (`worldToLocal`).

## Decisão

### 1. Índice só do que está sujo (`NearMeshIndex`)

`NearMeshIndex.rebuild(meshes)` compara a lista nova com a anterior (mesmos objetos, mesma ordem). Igual:

- o registro anterior de cada malha vem de um array paralelo aos slots (sem `WeakMap`);
- malha **parada** (mesma `matrixWorld` e mesma esfera local, comparação exata — o `unchanged` de sempre) cujo
  slot já está com a folga estática não é reescrita nem mexe na grade;
- malha que se mexeu (ou que estava com a folga de movimento e agora parou) recalcula como antes e, se a caixa
  com folga mudou, **sai das células antigas e entra nas novas** (a grade é atualizada só para esses slots).

Lista diferente (entrou, saiu ou mudou de ordem): o caminho completo de antes (registro por `WeakMap`, grade
remontada). As consultas (`nearXZ`, `alongRay`) não mudam: o `gather` ordena os índices pegos, então a ordem
dentro da célula nunca importou. Os números guardados por slot são os mesmos que o caminho completo
escreveria — o resultado de qualquer consulta é idêntico.

`nearMeshes.ts` (538 linhas) é dividido: o índice e as funções de esfera/caixa vão para
`src/physics/nearMeshIndex.ts`; `nearMeshes.ts` os reexporta (nenhum import muda).

### 2. Coleta sem closure e sem subir aos ancestrais

A coleta da cena sai do `CharacterPhysicsSystem` para `src/physics/characterCollect.ts`
(`CharacterSceneCollector`). Ela percorre com uma **pilha explícita** reaproveitada (pré-ordem, filhos na
ordem — a mesma ordem da recursão), com as mesmas podas do `traverseCollidable`, e leva o "tem ancestral
`cortexSolid`" descendo pela pilha (o da raiz é calculado uma vez, subindo dela). As listas saem na mesma
ordem, com os mesmos membros.

Continua sendo uma varredura periódica (a cada `COLLECT_INTERVAL_MS`), e não uma lista mantida por eventos
`childadded`/`childremoved`. Motivo: visibilidade (`visible`, o streaming de células) e flags de `userData`
(o editor liga `cortexSolid` num nó vivo, em `PhysicsAuthoring`/`VegetationAuthoring`) mudam sem evento.
Uma lista só por eventos ficaria errada até um `refresh()` manual. A varredura relê tudo isso a cada intervalo,
como antes, e o que custava era o rebuild (item 1), não a descida.

### 3. Troncos: cache por versão e grade

- `Vegetation.version` (novo, só leitura) sobe a cada mudança das instâncias (todo caminho passa pelo
  `sync()`). A coleta guarda a sequência de vegetações sólidas visitadas e as versões delas. Se as duas
  forem iguais à coleta anterior, os troncos não são relidos (sem `getInstances()`). Um objeto em
  `userData.cortexVegetation` sem `version` é relido toda vez, como antes.
- Os troncos ganham uma grade XZ (`src/physics/trunkGrid.ts`, células de 8 m), remontada só quando os troncos
  mudam. O passo consulta só as células a até `maior raio de tronco + raio do personagem + folga` da posição e
  aplica os empurrões **em ordem crescente de índice**, como o laço linear. Se a soma dos empurrões passar da
  folga, a posição volta à de partida e o passo refaz o laço linear completo. Assim nenhum tronco que o laço
  linear tocaria fica de fora, e o resultado é idêntico.

### 4. Passo sem alocação

`skip` do próprio personagem é um método ligado uma vez (o objeto da vez fica num campo); os raios de parede
são um método; o empurrão de parede usa `Infinity` como "livre" em vez do objeto do `resolveWallPush` (que
continua exportado, com o mesmo contrato). Os laços sobre `ys` são indexados.

### 5. `TerrainCollisionSystem` sem varrer entidades

- `src/ecs/structureVersion.ts`: contador que sobe em `Entity.addComponent`/`removeComponent` e
  `World.createEntity`/`destroyEntity`/`clear`.
- O sistema guarda a classificação (terrenos e corpos, em arrays paralelos) e só reclassifica quando o contador
  mudou ou quando a lista recebida não é a mesma da anterior (comprimento e identidade de cada entidade —
  comparação barata, sem `Map`).
- A inversa da `matrixWorld` de cada terreno é calculada uma vez por passo (depois do `updateWorldMatrix`) e
  aplicada a cada corpo — o mesmo `applyMatrix4` que o `worldToLocal` fazia, então o número é o mesmo.
- Sem corpos, o passo só atualiza a matriz dos terrenos (como antes) e sai.

## Consequências

- Na bancada: o passo com coleta cai de ~12,5 ms para o custo da travessia mais a comparação das matrizes; o
  `TerrainCollisionSystem` vai de ~0,7 ms para dezenas de µs. Números finais no commit e na medição da sessão
  principal.
- Comportamento de colisão idêntico: mesmas listas, mesma ordem, mesmos números no índice, mesma ordem dos
  empurrões dos troncos. Os testes do personagem, do índice e do terreno passam sem mudança.
- Quem guarda dados em `userData.cortexVegetation` sem `version` não ganha o cache (continua correto).
- Quem chamar `TerrainCollisionSystem.update` à mão com outra lista é reclassificado (a comparação é por
  identidade); mutação de componente fora de `addComponent`/`removeComponent` não existe na API.
- Pendente (fora desta mudança): `World.query` aloca o array de resultado por sistema por passo e poderia usar
  o mesmo contador; `toIntersection` do raycast nativo aloca 3 objetos por acerto.
