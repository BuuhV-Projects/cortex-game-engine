# SPEC-0152 - Teardown de fase sem vazamento (engine)

**Data:** 2026-07-25
**Status:** aceito

## Contexto

Jogar fases em sequência fazia memória e GPU crescerem monotonicamente (observado
no teste4, tanto no Studio quanto no export nativo). Auditoria completa do caminho
`Game.reset()` → `World.clear()` + `Scene.disposeAll()` encontrou quatro furos no
lado JS do engine (o lado nativo é o ADR-0153):

1. **Listener `mousedown` sem remoção** — `ThirdPersonControlSystem` e
   `FirstPersonCameraSystem` registram `mousedown` no canvas no construtor e não
   sobrescrevem `dispose()`. O `World.clear()` remove o system, mas o listener
   fica no canvas segurando o system → câmera → raiz da cena da fase anterior
   inteira. Um listener novo por fase = uma fase inteira retida por fase. É
   também o que impedia o GC (nativo) de coletar os wrappers de GPU.
2. **PostFX anterior nunca disposto** — `Game.setPostFX(fx)` substituía o
   anterior sem `dispose()`; `Game.reset()` nem tocava no `_postfx`. No browser
   isso vaza o `RenderPipeline` + pirâmide do bloom por fase.
3. **Caches de asset sem despejo** — `SceneAssets` (`_cache`/`_texCache`/`_loader`)
   e `AssetLoader._cache` são caches por URL sem nenhum caminho de limpeza; o BVH
   (`boundsTree`) construído pelo `CharacterPhysicsSystem` fica pendurado nas
   geometrias cacheadas (compartilhadas com os clones via SkeletonUtils) e
   `disposeBoundsTree` nunca era chamado.
4. **`Scene.disposeAll` não tratava `InstancedMesh`** — o `instanceMatrix` (e o
   dispose-event do objeto) não era liberado.
5. *(2ª rodada, após playtest de reabrir a MESMA fase)* — **as RenderTargets do
   PostFX vazavam mesmo com `dispose()`**: o `RenderPipeline.dispose()` do three
   só solta o material do quad; a RT HDR da cena vive no nó do `pass()`
   (`PassNode.dispose`) e a pirâmide do bloom (bright + 5 níveis H/V + materiais)
   no `BloomNode.dispose` — ninguém os chamava. Era o grosso do "GPU sobe rápido
   reabrindo a fase" no Studio. Também fora do alcance do `disposeAll`:
   **shadow map de luz** (RT só sai em `light.dispose()`) e **boneTexture de
   skeleton** (`skeleton.dispose()`).

6. *(3ª rodada, medida com soak automatizado no export — ver spec 0015 do
   teste4)* — quatro causas adicionais, confirmadas por telemetria de texturas
   vivas no host (`CORTEX_VRAM_LOG`):
   - **`ScriptHostSystem` sem `dispose()`**: o `onDestroy` dos scripts anexáveis
     só rodava na borda Play→Stop do editor — na troca de fase os listeners de
     `document` registrados por scripts (moeda/checkpoint/chegada) ficavam
     vivos retendo entity → object3d → a cena completa da fase anterior.
   - **PMREM interno do three**: entregar textura equiretangular crua a
     `scene.environment` faz o three gerar PMREM em RenderTargets internos
     (2× 3072×4096 half-float + depths ≈ 290 MB) presos em caches sem caminho
     de dispose — um conjunto NOVO por fase.
   - **`background` nunca disposto**: com o PMREM próprio, environment e
     background divergem — o skybox (43 MB c/ mips) e o CUBO de conversão do
     background (2048²×6) vazavam por fase.
   - **CSM (`shadowNode` customizado)**: o listener de dispose interno do three
     só cobre o ShadowNode padrão — e o `CSMShadowNode.dispose()` do three tem
     um bug upstream: **não dispõe os `_shadowNodes` das cascatas** (os donos
     das RTs 4096²). O `disposeAll` dispõe os dois explicitamente.

   Resultado medido no soak (space-2, export nativo): escada de VRAM de
   **~772 → ~87 MB/ciclo** (resta oscilação de 1 fase em trânsito + working set
   ~200 MB/ciclo CPU-side, rastreado como pendência). O host grava
   `perf-log.txt` na pasta do jogo (vram/ws + criação×destroy×release +
   texturas vivas) pra diagnosticar regressões — `CORTEX_VRAM_LOG=1` espelha
   no console.

## Decisão

- **Listeners:** os dois systems guardam o handler e ganham `override dispose()`
  com `removeEventListener` — o `World.clear()` já chama `dispose()` na troca.
- **PostFX:** `setPostFX(novo)` dispõe o anterior (`dispose?.()`, duck-typed)
  quando a instância muda; `Game.reset()` chama `setPostFX(null)` (que também
  reseta o pós-FX nativo, comportamento já existente). Caso de borda do host:
  o estado nativo é **global** e, num swap direto, o construtor do PostFX novo
  configura o host ANTES do dispose do antigo — o `PostFX.dispose()` só desliga
  o host se a instância ainda for o **dono** (marcador de módulo
  `_activeNativeOwner`), senão apagaria o bloom da fase nova.
- **Caches:** `AssetLoader` ganha `disposeCache()` (dispõe texturas, GLTF/FBX —
  geometria + `disposeBoundsTree` + materiais/texturas — e chama `free?.()` de
  AudioBuffers, que existe no shim nativo) e `SceneAssets` exporta
  `clearSceneAssetCaches()` (esvazia `_cache`/`_texCache` dispondo tudo, delega
  ao `disposeCache()` do loader interno e chama o hook global
  `__cortexClearObjectUrls?.()` do host). `Game.reset({ releaseAssets: true })`
  chama isso; o **default continua `false`** — o cache por URL é *by design*
  (platô limitado pelo total de assets únicos do jogo; trocar de fase reusa
  peças de kit sem recarregar). Jogos chamam `releaseAssets` nos pontos de
  troca "larga" (voltar ao menu, trocar de mundo).
- **`Scene.disposeAll`:** passa a chamar `InstancedMesh.dispose()`,
  `Light.dispose()` (RT do shadow map) e `skeleton.dispose()` (boneTexture) na
  travessia; `disposeObjectResources` cobre os mesmos casos pra árvores em cache.
- **`PostFX.dispose` (browser):** dispõe explicitamente o nó do `pass()` (RT HDR
  da cena) e o `BloomNode` (pirâmide + materiais), além do `RenderPipeline` — o
  dispose do pipeline do three não desce até eles.
- **Nudge de GC:** ao final do `Game.reset()`, chama o hook global
  `__cortexGC?.()` (registrado pelo host nativo — ADR-0153; inexistente no
  browser, onde o GC já sente a pressão sozinho).
- **Scripts:** `ScriptHostSystem` ganha `override dispose()` que roda o mesmo
  teardown da borda Play→Stop (ADR-0143) — `restoreRaycasts` + `onDestroy` +
  zera os slots — nas últimas entidades hospedadas.
- **PMREM possuído pelo engine:** `Scene.setEnvironment(renderer, tex)` gera o
  PMREM explicitamente (`PMREMGenerator` do three/webgpu) e guarda a RT; o
  `disposeAll` a devolve. `Skybox.fromHDRI/fromGradient` aceitam `renderer` e
  usam esse caminho (o `buildScene` passa o seu); com renderer ausente/não
  pronto, cai na atribuição crua (comportamento antigo).
- **`disposeAll` também dispõe o `background`** quando é textura (dispara o
  listener do three que devolve o cubo de conversão) e o **`shadowNode`
  customizado** das luzes (CSM) antes do `light.dispose()`.
- **Cache = residente na GPU** *(4ª rodada, medida com o perf-log)*: mesmo com
  as texturas rastreadas estáveis, a VRAM/RAM do processo subia em degraus de
  ~256 MB a cada re-entrada — o alocador do wgpu/D3D12 cresce em blocos que não
  devolve quando ~1 GB de texturas é destruído e recriado por troca (churn).
  Assets carregados pelo cache do `SceneAssets` são marcados
  `userData.cortexCached` (geometria/material/textura) e o `disposeAll` PULA o
  dispose deles — ficam residentes entre fases (re-entrada sem re-upload). O
  platô é o conjunto de assets únicos visitados; `clearSceneAssetCaches`
  (`reset({ releaseAssets: true })`) continua liberando tudo nos pontos de
  troca larga.
- **Caches internos do renderer:** o reset descarta
  `_objects/_nodes/_bindings/_renderLists/_renderContexts` (mesma lista do
  `renderer.dispose()`, menos backend/info/geometries/pipelines/textures — os
  três últimos quebram recursos VIVOS em uso, testado). Reconstrução lazy no
  frame seguinte, como no design do three.

## Consequências

- Trocar de fase deixa de acumular: cena/GPU liberadas no reset, listeners
  não retêm mais a fase anterior, PostFX antigo morre com a troca.
- O BVH em geometria cacheada continua vivo entre fases **por design** (platô
  por URL) — só morre no `releaseAssets`. Depois de um `releaseAssets`, a
  próxima fase re-carrega/re-parseia os assets (custo de load consciente).
- `dispose()` de PostFX no caminho nativo desliga o bloom do host — o
  `setPostFX(null)` no início da fase seguinte já fazia isso; agora o contrato
  vale pra qualquer troca de instância.
- Testes: Vitest cobre dispose dos listeners, troca de PostFX e
  `disposeCache`/`clearSceneAssetCaches`.
