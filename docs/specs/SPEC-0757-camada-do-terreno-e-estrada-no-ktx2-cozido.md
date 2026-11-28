# SPEC 0757 - A camada do terreno e a textura de estrada usam o KTX2 cozido

**Data:** 2026-11-28
**Status:** implementado
**Relacionado:** ADR-0758, SPEC-0755, ADR-0756, SPEC-0652, SPEC-0662

## Contexto

O jogo põe imagens soltas na lista `cookTextures` e o `loadTexture` público troca pela BC7 no host (SPEC-0755). A
camada do terreno e a textura de estrada ficavam fora (ADR-0756): a primeira carrega pelo `TextureLoader` direto, e a
segunda clona a textura a cada estrada, e o clone de uma BC7 sobe vazio. O Port Hollow quer as duas em BC7 sem
reduzir nada.

## Decisão

### 1. O cache de textura ladrilhada (`src/scene/tiledTextures.ts`)

`tiledTextureCache(configure)` devolve `{ get(url), clear() }`:

- `get(url): Promise<Texture>` carrega uma vez por URL pelo `loadLooseTexture(url, false, …)`: no host, o `.ktx2` do
  manifesto (`loadCookedTexture`, os dados BC7 soltos da CPU depois do upload); senão, o original pelo
  `TextureLoader.loadAsync`. O `configure` roda uma vez, na textura nova, antes do primeiro upload;
- duas chamadas juntas da mesma URL dividem a mesma carga; a carga que falha sai do cache (a próxima tenta de novo);
- `clear()` descarta as texturas que chegaram e esquece as cargas.

A textura é do cache, não do `loadTexture`: as opções de um uso não mudam a textura de outro.

### 2. A camada do terreno

- `terrainLayerTexture(url): Promise<Texture>`, com `RepeatWrapping`, sRGB e `userData.cortexCached` (como antes).
- O `Terrain.loadLayerTexture` espera a textura e só a põe no nó (com o `needsUpdate` do material, SPEC-0662) se a
  camada daquele índice ainda tiver a mesma URL e o mesmo nó. A falha vai para o `debug('terrain', …)`.
- O `clearTerrainLayerTextures` segue no `clearSceneAssetCaches`.

### 3. A textura de estrada

- `roadTexture(url): Promise<Texture>` (`src/scene/roadTextures.ts`), com `RepeatWrapping`, sRGB, anisotropia 8 e
  `userData.cortexCached`.
- O `RoadBuild.applySurface` usa a textura do cache direto, sem `clone()`: todas as estradas da mesma URL dividem uma.
- `clearRoadTextures` entra no `clearSceneAssetCaches`.

### 4. A orientação

O `TextureLoader` entrega o PNG com `flipY = true`. A entrada do jogo na lista fica com o `flipY` padrão (`true`), e o
cook grava as linhas viradas (SPEC-0755 §2). Nenhuma das duas usa dado linear: são cor.

## Testes

- `tests/scene/tiledTextures.test.ts`: uma carga por URL, o `configure` uma vez, cargas juntas divididas, a falha sai
  do cache, o `clear` descarta, e no host com o manifesto o `.ktx2` no lugar do original.
- `tests/scene/terrainLayerTextures.test.ts`: terrenos com a mesma URL carregam uma vez, com wrap e sRGB; a camada
  trocada antes da carga chegar não recebe a textura antiga.
- `tests/scene/terrainLayerSwap.test.ts`: segue (o mock passa a devolver promessa).
- `tests/scene/roadTextures.test.ts`: duas estradas com a mesma URL dividem a textura (sem clone), com wrap,
  anisotropia e sRGB.
