# SPEC-0652 - Texturas de camada do terreno compartilhadas por URL

**Data:** 2026-11-01
**Status:** aceito

## Contexto

O export nativo do Port Hollow morria logo depois da carga com
`HermesGC: OOM ... external = 2290375432` (o teto do heap do host é 2 GB; ADR-0278). Uma sonda de alocação no
prelude (soma de bytes por pilha, ArrayBuffer/TypedArray do JS e bytes devolvidos pelo host) mostrou, de ~2,85 GB
alocados até o crash:

| Origem | Bytes | Chamadas |
|---|---|---|
| `__cortexDecodeImage` (PNG → RGBA) | 748 MB + 655 MB | 620 + 367 |
| `__cortexReadFile` ← `TextureLoader.load` ← `Terrain.loadLayerTexture` | 680 MB | 704 |
| fusão estática + BVH (o resto) | ~450 MB | — |

O jogo pinta 176 terrenos com as mesmas ~4 texturas. `Terrain.loadLayerTexture` fazia
`new TextureLoader().load(url)` por terreno e por camada: 704 `Texture` independentes, cada uma com o arquivo
relido, decodificado e o RGBA mantido vivo (e enviado à GPU 704 vezes). Subir o teto só adiaria o crash.

## Decisão

- `src/scene/terrainLayerTextures.ts` guarda as texturas de camada do `Terrain` num cache **por URL**: a primeira camada que pede a URL
  carrega (`RepeatWrapping`, `SRGBColorSpace`, como antes); as próximas reusam o mesmo objeto. Todas as camadas de
  todos os terrenos já usavam essas mesmas configurações, então compartilhar não muda a imagem. O tiling continua
  por terreno (é um uniform do nó, não da textura).
- As texturas do cache são marcadas `userData.cortexCached = true` (o `Scene.disposeAll` não as descarta na troca
  de fase, como as do `loadTexture`).
- `clearTerrainLayerTextures()` descarta e esvazia o cache; o `clearSceneAssetCaches` (SPEC-0152) chama, então
  `game.reset({ releaseAssets: true })` também solta as texturas do terreno.
- Não usa o `_texCache` do `loadTexture`: aquele é assíncrono e cria a textura com filtro nearest por padrão
  (`pixelated`), e mudar wrap/filtro de um objeto de lá vazaria para os outros usos da mesma URL.

- **Hook de contrato** (SPEC-0643, `templates/new-project/.claude/hooks/native-contract.mjs` e cópia nos jogos):
  novo ERRO para loader do three criado direto no código do jogo (`new TextureLoader()`, `ImageLoader`,
  `ImageBitmapLoader`, `GLTFLoader`, `KTX2Loader`). O jogo carrega pelo `loadTexture`/`loadGLB` da engine (cache por
  URL) ou guarda o resultado num `Map` por URL — a mesma lição do terreno, aplicada ao código do jogo.

## Consequências

- Port Hollow: 704 cargas de textura viram ~4. Prova no export na seção de validação abaixo.
- Teste: `tests/scene/Terrain.test.ts` — dois terrenos com a mesma URL carregam uma vez só; depois do
  `clearTerrainLayerTextures` a URL volta a carregar.
- Mudar `wrapS`/`colorSpace` da textura de um terreno muda a de todos que usam a mesma URL (antes cada um tinha a
  sua). Nenhum código faz isso hoje.
