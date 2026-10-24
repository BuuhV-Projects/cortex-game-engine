> **Anexo do PRD-0466 / ADR-0465** (2026-10-24). Inventário só de leitura do host na base d601dae8. **Superado em um ponto:** medir em 1920×1080 já é possível (`CORTEX_WINDOW_SIZE` + `--window` no kit, SPEC-0455). Caminhos de scratchpad citados são locais e temporários; o que vale é o arquivo:linha no repo indicado.

# Inventário do host nativo para um renderer próprio em C++

Worktree: `D:\@buuhvprojects\js-game-engine\.claude\worktrees\renderer-nativo-45b16a` (branch `claude/renderer-nativo-45b16a`, base `d601dae8`).
Levantamento só de leitura, feito em 2026-10-24. Os caminhos são relativos à raiz do repo. "Padrão" significa ligado no export nativo sem precisar de query. No Studio/browser nada disso é instalado.

Mapa de referência: `docs/cortex-native/architecture.md` (tabela de módulos nas linhas 61–143, superfície WebGPU nas linhas 575–600).

Contexto de decisão que pesa no desenho:
- O ADR-0232 (fase 1) mediu o laço por objeto: **2,2 µs/draw em C++ contra 33,5 µs/draw no three/Hermes**.
- O ADR-0330 substituiu o ADR-0228 e levou o passe principal para C++: a etapa (a) foi entregue, a (b) está parcial.
- O ADR-0404 escolheu o RenderingServer **pelo caminho da receita** (o three compila, o C++ desenha) e não o do uber-shader. A correção do teto (ADR-0404:209–244) diz que o custo que sobra é **por estado de shader** (UBO de luzes/sombra por estado, cerca de 77 µs × 13 estados ≈ 1 ms/quadro), e não o laço por objeto.
- O ADR-0237/SPEC-0238 (uber-shader + `MaterialDesc` + `PipelineKey`) ficou parcial. A SPEC-0241 (submissão nativa do passe principal) foi **encerrada e o código removido**.

---

## 1. SceneMirror: espelho da cena em C++

| peça | arquivo:linha | o que faz / estado | como serve ao renderer próprio |
|---|---|---|---|
| Lado JS | `src/core/NativeSceneMirror.ts:675` (`class NativeSceneMirror`), `install` em :862, `update` em :1127 | Descreve a cena uma vez (`build`). A cada quadro escreve só os nós sujos e chama `api.update(linhas, planos)`. **Padrão** no host: o `Game.ts:694-701` instala no 1º quadro sem carga em andamento, sem query. | Já é o canal de deltas JS→C++ que um renderer próprio precisa. A hierarquia, as matrizes de mundo e as flags de desenho moram no C++. |
| Núcleo C++ | `native/src/scene/scene_mirror.h` (578 linhas): `build` :359, `appendBatch` :375, `removeSubtree` :390, `applyTransforms` :411 (impl. `scene_mirror.cpp:292`), `updateAndCull` :420 (impl. `scene_mirror.cpp:334`), `worldData()` :449 | Hierarquia linear com pai antes do filho, composição da matriz de mundo em **double** e culling por frustum. A capacidade é reservada com `kMirrorSpareNodes = 512` (:153). Um estouro **recusa** e não realoca, porque o JS segura ponteiros para `matrixWorld.elements`. Remoção vira lápide no lugar. | Serve de "scene graph" do renderer. As matrizes de mundo já estão em memória nativa e o JS as lê sem cópia. |
| Ponte | `native/src/shims/scene_mirror_shim.cpp:557-564` | `__cortexSceneMirror`: `build`, `worldMatrices`, `syncBuffer` (os dois últimos são ArrayBuffer externo, sem cópia), `update` (a única travessia por quadro), `appendNodes`, `removeNode`, `drawShadowPass`, `setInstances`. | Contrato pronto para reaproveitar. |

**Formato do `build` (por nó)**: 21 floats em `Float32Array` (`NativeSceneMirror.ts:28`, escrito por `descreverNo` em :587):
`[0] pai` (índice; `-2-k` = pai na posição k do lote, `BATCH_PARENT_BASE`), `[1..3] posição`, `[4..7] quaternion`, `[8..10] escala`, `[11] raio padrão`, `[12] visible`, `[13] flags` (NodeFlag), `[14] geometryId` (−1 = nenhum), `[15..17] centro da boundingSphere local`, `[18] raio`, `[19] material.visible inicial`, `[20] ShadowSide inicial`.

**NodeFlag (16 bits, estáticos do build)**, em `scene_mirror.h:208-278`:
- castShadow autorado (1)
- skipAngularCull (2)
- frustumCulled (4)
- drawable (8)
- skinned (16)
- instanced (32)
- materialArray (64)
- alphaClip (128)
- positionNode (256)
- mainCull (1<<9)
- mainJsCull (1<<10)
- light (1<<11)
- mainUnsupported (1<<12)
- mainFrustumCulled (1<<13)

Os bits de 16 a 256 são motivos de recusa do gate de sombra.

**Sync por quadro (delta)**: 12 doubles por nó sujo, em `Float64Array`. É o `kSyncFloatsPerNode`, `scene_mirror.h:34`, escrito por `_escreverLinhas` em `NativeSceneMirror.ts:1155-1192`:
`[0] índice do slot`, `[1..3] posição`, `[4..7] quaternion`, `[8..10] escala`, `[11] SyncFlag`.

Os bits do `SyncFlag` (`scene_mirror.h:46-93`) são:
- visible (1)
- material.visible (2)
- ShadowSide com 2 bits (shift 2)
- frustumCulled (16)
- mainUnsupported (32)

As linhas são compactas: lápide não vira linha. A transform suja via gancho nos vetores do three (SPEC-0322). As flags são conferidas por varredura em rodízio de 8 quadros (`SWEEP_PERIOD_FRAMES`, :92); uma cena com menos de 256 nós é varrida inteira todo quadro.

**Outros canais**:
- `setInstances(index, Float32Array, count)` manda as matrizes de `InstancedMesh` só quando `version`/`count` mudam (`NativeSceneMirror.ts:1287-1302`).
- `appendNodes`/`removeNode` disparam pelos eventos `childadded`/`childremoved`.

**Lacuna para o renderer**: o espelho não carrega material nem textura. Material só chega como bits de recusa. Também não há "id de material" no nó, apenas `geometryId`.

## 2. Projeção/culling do passe principal em C++

| peça | arquivo:linha | o que faz / estado | serve como |
|---|---|---|---|
| JS | `src/render/NativeMainProjection.ts:219` (`installNativeProjection`), interruptor em :75 | Substitui o `_projectObject` do three. Recebe do C++ a lista de candidatos e o `z`; faz em JS camadas, material, `renderList.push` e a oferta ao RenderServer. **Padrão** no host; desliga com `?nativeMainPass=0` ou `?nativeProjection=0`. Recusa (o three projeta) em `LOD`, `ClippingGroup`, `BundleGroup`, `Group` com `renderOrder`, `ArrayCamera`, render aninhado ou `sortObjects=false`. | A travessia, a visibilidade herdada e o frustum já estão prontos para a fila de desenho do renderer. |
| C++ | `native/src/scene/main_pass_culler.h:33-56`, `cull` em `main_pass_culler.cpp:24` | Uma passada linear sobre o espelho: visibilidade herdada, frustum pela esfera da geometria (raio × maior escala) e `z` de ordenação (linha z da viewProj, sem dividir por w; `sortDepth`). Faz pass-through de luz e de `JsCull` (Sprite, instanciado, skinned). | Faz o mesmo papel do `RenderSceneCull` do Godot. |
| Ponte | `native/src/shims/main_pass_shim.cpp:114-115` | `__cortexMainPass.project(planos f64[24], viewProj f64[16], indices i32, z f64)` devolve n (−1 recusa, −2 args, −3 saída pequena). `setBounds(i,cx,cy,cz,r)` é chamado quando a geometria muda. | |
| Matemática | `native/src/scene/sphere_math.h` | `getMaxScaleOnAxis`, `applyMatrix4` afim e `intersectsSphere` do three. É compartilhada com a sombra. | |
| Culling antigo | `SceneMirror::updateAndCull` (`scene_mirror.cpp:334`) | Frustum feito dentro do `update` (SPEC-0233/0234). | |

## 3. Passe de sombra nativo (CSM da engine)

| peça | arquivo:linha | o que faz / estado | serve como |
|---|---|---|---|
| Passe | `native/src/render/shadow_pass.h:85`, `drawShadowCasters` em `shadow_pass.cpp:299` | Passe **depth-only** (sem attachment de cor nem fragment) na `ShadowDepthTexture` da cascata. O alvo vem **por identidade** e é reaquirido a cada quadro. `cullMode` é por caster, derivado do `side` (o three inverte o lado na sombra) e do `flipSided` (det < 0). Há um pipeline por `(cull, passo de vértice)`. Tem variante instanciada (atributo por instância, 4×vec4). **Padrão** desde o E8 da SPEC-0245; desliga com `?semPasseDeSombraNativo=1`. Diagnóstico com `CORTEX_SHADOW_PASS_LOG=1`. Medido: −2,85 a −4,75 ms de `cpu.render` no kart-racer. | É o 1º passe "renderer próprio" que já existe e está em produção. Já tem WGSL próprio (`shadow_pass.cpp:44` e `:62`) e cria pipeline em C++ (`depthCompare Less` em :267). |
| Matemática | `native/src/render/shadow_math.h`: `shadowModelViewProjection` :35 (`viewProj × model` em double, depois float), `shadowModelDeterminant` :63, `shadowCullMode` :89 | Parte pura e testada no `cortex_host_tests`. | Reutiliza direto. |
| Quem projeta | `native/src/scene/shadow_caster_enumerator.*` | Reproduz os filtros do three na mesma ordem (visibilidade herdada, drawable, castShadow autorado, culling angular SPEC-0197, frustum da ortho da cascata). Validado com 2.632/2.632 amostras idênticas. | |
| Gate | `native/src/scene/shadow_pass_gate.*` (171 linhas no .h) | Decide aceitar ou recusar com motivo e devolve `firstOffender`. Recusa: VSM, skinned, InstancedMesh sem matrizes, material array, alphaTest/alphaMap, positionNode, geometria ausente, lado não reproduzível, divergência de nós. | É o padrão "recusar em vez de aproximar" e vale para o renderer inteiro. |
| JS | `src/scene/OutdoorLighting.ts:225-360` (`_desenharPasseDeSombraNativo`), interruptores em :44 e :61 | Roda depois do `super.updateBefore` (que posiciona as cascatas). Por cascata: chama `shadow.updateMatrices`, monta a viewProj em `Float64Array` e chama `espelho.drawShadowPass(...)`. Quando o nativo assume, `cascata.shadow.autoUpdate = false`. | A lógica do CSM (splits, ortho por cascata) **continua no three/engine em JS**; o C++ só desenha. |
| Registro de geometria | `native/src/render/geometry_registry.h` (`GeometryEntry`: vertex/index buffer, contagem, stride, offset), ponte em `native/src/shims/geometry_registry_shim.cpp:92-95`, lado JS em `src/render/CasterGeometryRegistry.ts` + `src/render/GeometryDesc.ts` | Liga `geometryId` aos `GPUBuffer` **do three** (só guarda o vínculo; não é dono dos buffers). O registro é preguiçoso: entra depois do 1º upload. | Para um renderer próprio, o dono do buffer teria de passar a ser o C++. Hoje só existe a posição (o stride diz onde ela está). |
| Instâncias | `native/src/render/instance_buffer_store.h` (`upload`, `erase`, `eraseIf`, `clear`) | Faz cópia própria do `instanceMatrix` em `GPUBuffer` do host, porque o three troca UBO por atributo conforme o tamanho do lote. | É o modelo de buffer de instâncias do host. |

## 4. RenderingServer RS1 (SPEC-0425, ADR-0404) e etapas b.1/b.2

As peças se encadeiam assim: `TransformOnlyRefresh` → `RenderIdRefresh` → b.1 `CleanDrawFastPath` → b.2 `DrawBatch` → RS1b `RenderServer`. A instalação fica em `src/core/Renderer.ts:187-197`, todas com padrão `isNativeHost()`.

| peça | arquivo:linha | o que faz / estado | serve como |
|---|---|---|---|
| Refresh só de transform | `src/render/TransformOnlyRefresh.ts` (`QUERY_KEY` :22, `queryFlagRequested` :246) | Quando só a matriz mudou, faz um `writeBuffer` do UBO de objeto em vez do refresh completo do `NodeMaterialObserver`. **Padrão**; desliga com `?transformOnlyRefresh=0`. | É o plano de UBO por objeto (ADR-0290). |
| RenderIdRefresh | `src/render/RenderIdRefresh.ts` (:33, :225) | Evita o "primeiro objeto do monitor" refeito todo quadro (material exclusivo). **Padrão**; desliga com `?renderIdRefresh=0`. | |
| b.1 desenho direto | `src/render/CleanDrawFastPath.ts` (884 linhas; interruptores `cleanDraw` :42, `drawBatch` :44, `nativeMainPass` :45, `sharedRefs` :47; `cleanDrawRequested` :552) | Grava um instantâneo numérico do que os nós do RO leem. Se bate no quadro seguinte, desenha direto (`updateBefore`, nós de render, grupos compartilhados, draw); qualquer divergência volta ao three. **Padrão**. | Mostra o que é "estado limpo" por objeto. |
| b.2 lote | JS `src/render/DrawBatch.ts` (332 linhas; `?drawBatchCheck=1` :21; `?batchRecapture=1` :26, **desligado por padrão**, SPEC-0435 (a)). C++ `native/src/render/draw_batch.h` (`RecipeStore`, `DrawRecipe` com pipeline + até 4 grupos + até 8 VBs + índice, `DrawCommand` de 4 ints, `replay` em `draw_batch.cpp:78`). Ponte em `native/src/shims/draw_batch_shim.cpp:168-170` (`record`/`release`/`flush`) | A receita (os handles do three) é gravada uma vez com AddRef. O `flush(passEncoder, Int32Array, n)` emite a sequência com eliminação de estado redundante. Depois do flush o JS zera `currentSets`/`_activePipelines` do three. **Padrão**. | **Núcleo do laço de desenho em C++** já pronto e puro (testável com `DrawEmitter` falso). O renderer próprio pode alimentá-lo com receitas próprias em vez das do three. |
| RS1b servidor | `src/render/RenderServer.ts` (509 linhas; `renderServerRequested` :41), instalado em `CleanDrawFastPath.ts:848` | Instâncias opacas simples (malha comum, material único opaco, depth on, sem polygonOffset/renderOrder/onBefore) saem da RenderList. Por instância e quadro: confere o instantâneo e anexa 4 ints. O trabalho por estado roda uma vez por `NodeBuilderState`. A emissão é ordenada pela chave do `painterSortStable` e intercalada com o three (há geometria coplanar no DDD 61). **Padrão desde 2026-10-23** por decisão do usuário; desliga com `?renderServer=0`. Medido no Comercial com walk: render −1,12 ms, p95 −2,8, >33 ms 29,3%→22,3%, paridade 0. | Prova que receita + lote + ordenação em bloco dão paridade exata. Pela sonda, o resto do custo (cerca de 1 ms) é por estado de shader. |
| Sonda | `src/render/DrawRecipeProbe.ts` (`?drawRecipeProbe=1`, desligada) | Mede o teto de elegibilidade por draw. | |

## 5. MaterialDesc / pipeline_cache e WGSL próprio do host

**Como os pipelines são criados hoje**: quase todos vêm do three via shim (`device.createRenderPipeline[Async]`, parser em `native/src/webgpu/pipeline.cpp`, com sub-parsers vertex/fragment/primitive/depth/multisample/layout; layouts explícitos em `layouts.cpp`). Não há cache no host: quem cacheia é o three (`_activePipelines`/cacheKey). O C++ cria pipeline próprio apenas para shadow, bloom, supersample/composite, splash e as sondas.

| peça | arquivo:linha | estado | serve como |
|---|---|---|---|
| `PipelineCache<Pipeline>` | `native/src/render/pipeline_cache.h:33-70` | Cache genérico por chave `uint64` com contadores hit/miss. **Sem consumidor em produção**: só `native/tests/pipeline_cache_test.cpp` o usa. | Pode ser reaproveitado tal como está no renderer próprio. |
| `MaterialDesc` | `src/render/MaterialDesc.ts` (243 linhas): `shading` = standard/unlit/toon/outline, `blend` = opaque/blend, cor e textura como dado, recusa em vez de aproximar | Feito no M1 do ADR-0237 (cobriu 89,3% da cena). **Hoje só é usado em telemetria** (`src/core/PerfTrace.ts:4,682`, `measureCoverage`). | Ponto de partida para o "material como dado" do renderer. |
| `PipelineKey` | `src/render/PipelineKey.ts` (bits: shading 3, blend 2, flags 1, vertex layout 8, formato do alvo 8) | Usado só em `countDistinctPipelines` (telemetria). Medido: 242 materiais geram **5 chaves** no kart-racer. | É o contrato de bits já desenhado com o C++. |
| SPEC-0238 | `docs/specs/SPEC-0238-cache-de-pipeline-nativo.md` | "Parcial: passos 1–4 feitos; o 5 depende do M5" (e o M5/SPEC-0241 foi encerrado). | |

**WGSL próprio do host** (resultado do grep `@vertex|@fragment` em `native/` e `src/`, fora de node_modules):

| shader | arquivo:linha | uso |
|---|---|---|
| sombra (comum e instanciada), só vertex | `native/src/render/shadow_pass.cpp:44-54` e `:62-74` | produção |
| blit SSAA + composição da UI em gama | `native/src/webgpu/supersample.cpp:60` (vs) e `:77` (fs) | produção |
| composite HDR (bloom + vinheta + ACES + OETF + UI) | `native/src/webgpu/supersample.cpp:122` (vs), `:138-146` (ACES), `:162` (fs) | produção quando o bloom nativo está ligado |
| bloom (`vs`, `fsBright`, `fsDown`, `fsUp`) | `native/shaders/bloom.wgsl:25/58/76/106` (embutido via `bloom_wgsl.h.in`; fonte única compartilhada com o backend de browser) | produção |
| splash | `native/src/webgpu/splash.cpp:44/55` | produção |
| sonda de override | `native/src/webgpu/override_probe.cpp:32/38` | diagnóstico |
| bench do laço | `native/src/webgpu/render_bench.cpp:36/41` | diagnóstico |
| autoteste de profundidade | `native/src/webgpu/depth_selftest.cpp:95/101` | diagnóstico |

**Não existe** em `src/` nenhum shader WGSL autorado à mão: todo o sombreamento de material vem do TSL/NodeBuilder do three.

## 6. Uniformes por objeto, buffer de instâncias, lote de desenho

- **UBO por objeto**: hoje é do three (grupo "object" do NodeBuilder). O host só reescreve via `writeBuffer` no plano de transformação (`TransformOnlyRefresh.ts`, ADR-0290; cerca de 22 µs por objeto que se move, SPEC-0425:192-206). Ainda **não há** UBO de objeto do host para o passe principal. A sombra usa **push de matriz MVP** por draw (`shadow_pass.cpp`, uniform por caster).
- **Offset dinâmico**: só o spike `render_bench.cpp` usa um bind group com offset dinâmico (ADR-0232:126-128: "o three cria um bind group por objeto"). É o modelo recomendado para o renderer.
- **Instâncias**: `InstanceBufferStore` (seção 3) serve hoje só à sombra. No passe principal, os `InstancedMesh` continuam com o three (`kNodeMainJsCull`) e o RS2 está suspenso (ADR-0404:233-244).
- **Lote**: o `RecipeStore` + `replay` de `draw_batch.*` (seção 4) é o laço de emissão. `DrawCommand` = {recipe, count, instanceCount, first}.
- **Spike do laço completo**: `native/src/webgpu/render_bench.cpp` (`runRenderBench`, `render_bench.h:24`, liga com `CORTEX_RENDER_BENCH=<n>` e `CORTEX_RENDER_BENCH_FRAMES`, `main.cpp:207`). Faz compose (quat+pos+escala), multiplicação, teste de esfera contra os 6 planos, uniforme e draw, tudo em C++ sem three, num alvo de 1280×720. Mediu 2,2 µs/draw com 1.300 objetos. **Isolado**: cria o próprio device e não convive com o frame do jogo.

## 7. Pós no host: bloom, tone mapping, UI e SSAA

| peça | arquivo:linha | o que faz / estado |
|---|---|---|
| Bloom nativo | `native/src/webgpu/bloom.h:20-44`, registro em `bloom.cpp:369-370` | `__cortexBloom(config|null)` é chamado uma vez por fase (ADR-0147). `__cortexSceneHdr(texture)` entrega a cada quadro a RT HDR do three (ADR-0149). A pirâmide (bright, down, up) é encodada em C++. Liga quando o jogo/PostFX chama; não é padrão para todo jogo. |
| Lado JS | `src/core/nativePostFX.ts` (`nativePostFXHost`, `nativeSceneHdrSink`); `src/core/Renderer.ts:398-413` | Com bloom nativo, o JS renderiza em **linear HDR com `NoToneMapping`** e o host aplica exposição + **ACES** (a mesma aproximação do `ACESFilmicToneMapping`) + vinheta + OETF. Sem bloom, o three faz o tone mapping e o host só faz o blit LDR. |
| Composite / SSAA | `native/src/webgpu/supersample.cpp`: `ensureOffscreen` :364, `clearOffscreen` :407, `blitToSwapchain` :428 | `getCurrentTexture` devolve o offscreen (nativo × `renderScale`). No present, o blit faz downscale bilinear para a swapchain e **compõe a UI em gama**: `out = game·(1−a) + OETF(ui/a)·a` (ADR-0105). Há um caminho HDR com uniform `HdrParams` (:27). |
| **Supersampling 2×** | `native/src/main.cpp:295-305` | `CORTEX_RENDER_SCALE` (**padrão 2.0**, faixa [1, 4]; 1.0 desliga). O `devicePixelRatio = renderScale` vai para o JS (`main.cpp:340-351`). O compositor de UI força o offscreen mesmo com escala 1 (`supersample.cpp:367-369`). |
| UI de runtime | `__cortexUiLayer(texture|null)` em `native/src/webgpu/navigator.cpp:104-134`; JS em `src/ui/runtime/` (RendererUiBackend, ADR-0102) | A UI é desenhada **pelo three** numa cena ortográfica dentro de uma RT; o host só compõe. O texto vem de `__cortexRasterText` (stb_truetype, `shims/text_raster.*`). |
| Canvas 2D | `native/js/src/shims/canvas2d/` (raster em software no JS) + `__cortexBlitImage` (`native/src/shims/canvas_blit.cpp:76`, laço em `native/src/canvas2d/blit.cpp`) | O resultado sobe como `ImageBitmap` via `copyExternalImageToTexture`. É reenviado só quando `__cortexVersion` muda (ADR-0315). |
| DOM-lite | `native/js/src/shims/dom-lite.js`, `html-lite.js` | DOM inerte (sem layout); nada desenha. |
| Splash | `native/src/webgpu/splash.*` | WGSL e pipeline próprios; é a única a apresentar nos ~1,45 s iniciais (ADR-0109/0218). |

**Para o renderer próprio**: a UI de runtime depende do three para virar textura. Trocar o three exige um caminho de UI próprio (quads com textura de texto) ou manter um three só para UI.

## 8. Override constants (specialization) no naga/D3D12

- **Provado**: `native/src/webgpu/override_probe.cpp` (o WGSL `override uSelectedRed : f32 = 0.0;` em :32; `fragment.constantCount = 1` em :128). Liga com `CORTEX_OVERRIDE_PROBE=1` (`main.cpp:200`). O resultado registrado na SPEC-0238:93-107 foi "vermelho lido=191 esperado=191 → **override FUNCIONA no naga/D3D12**", e a conclusão escrita é "o uber-shader está liberado".
- **Lacuna encontrada**: o shim que o JS usa (`native/src/webgpu/pipeline.cpp`) **não lê `constants`** dos estágios vertex/fragment. O grep por `constant` no arquivo vem vazio; só o probe preenche `constantCount`. Hoje, um `constants: {...}` vindo do JS seria **descartado em silêncio**. Para o three isso é irrelevante (não verifiquei se o three 0.184 emite `override`). Para um renderer próprio que crie pipelines em C++, também não é problema: basta preencher `WGPUConstantEntry` direto.
- Nenhum shader de produção usa `override` (shadow, bloom, supersample e splash não usam).
- **Limitações conhecidas do naga** (memória `native-vertex-color-naga-branco.md` e SPEC-0238:24-26): `COLOR_0` (vertex color) em `MeshStandardNodeMaterial` com `map` **renderiza branco** (o naga miscompila; o Dawn aceita). A correção foi dropar `COLOR_0`/`TEXCOORD_1` no bake. A lição registrada é que **"compilou" não é prova**: todo shader novo precisa de uma sonda de pixel. O mapa também cita "naga mais estrito que o Dawn" (crash da vegetação instanciada) e a armadilha do Hermes com `let` em closure de `for` (memória `hermes-let-closure-gotcha.md`).

## 9. DynamicLighting, ?parityFreeze e instrumentos de paridade/captura

| instrumento | arquivo:linha | o que faz / estado |
|---|---|---|
| DynamicLighting (SPEC-0435 (d′)) | `src/render/DynamicLightingSwitch.ts` (QUERY :18; tamanhos dos arrays: dir 2, point 8, spot 8, hemi 1 em :24-27), instalado em `src/core/Renderer.ts:164` | Usa o `DynamicLighting` do próprio three: luzes **sem sombra** viram arrays de tamanho fixo com contagem, atualizados uma vez por render. Ligar ou desligar uma luz muda a contagem e não a variante. Luzes com sombra seguem o caminho padrão. **Padrão no host** (`04c72500`): render −1,4/−1,7 ms andando, paridade noturna de 6 px em 921.600; desliga com `?dynamicLighting=0`. É a ideia do buffer de luzes por quadro do Godot. |
| `?parityFreeze=<s>` | `src/render/MainPassArm.ts:13-70` (`mainPassArm = {three, lighting}`, classe `ParityFreeze`) | Depois de `<s>` segundos o jogo para de atualizar e só desenha. Os quadros alternam o braço do desenho (nativo × three); com `?parityTarget=lighting` alternam a iluminação. A projeção fica nativa nos dois (trocá-la a cada quadro trava o host). Os pares N×N+1 dão a diferença e N×N+2 dão o ruído (SPEC-0362). |
| Captura do quadro composto | `native/src/webgpu/render_parity_capture.h:11-34` | `CORTEX_RENDER_PARITY_CAPTURE=<dir>` grava a `swap` composta antes do present em `frame_NNNN_WxH.rgba` cru. `CORTEX_RENDER_PARITY_CAPTURE_SKIP` define o aquecimento. Ao terminar, faz QUIT sozinho (SPEC-0240). |
| Comparador | `native/scripts/render-parity.mjs` | Para arquivos ou diretórios RGBA, devolve `maxChannelDiff`, `pctPixelsAboveNoiseFloor` (`--delta`), o pior pixel e um histograma. Não decide limiar. |
| Janela fora da tela / oculta | `native/src/core/app_window.cpp:58-87` | `CORTEX_WINDOW_OFFSCREEN=1` (posição −32000) ou `CORTEX_WINDOW_HIDDEN=1`. As duas continuam desenhando. |
| Autoteste de profundidade | `native/src/webgpu/depth_selftest.cpp` (`CORTEX_DEPTH_SELFTEST=1`, :444) | Verifica que duas passes em command buffers separados compartilham a profundidade com `Load`. É diagnóstico isolado. |
| Tempo de GPU por passe | `native/src/webgpu/pass_timing.*` + `pass_timing_stats.h` (`CORTEX_FRAME_TIMING`) | Timestamps por origem (`j` three, `s` sombra, `b` bloom, `c` clear, `p` blit) e `gpu-work` med/p95/max a cada 300 quadros. |
| Contadores NAPI | `native/src/webgpu/napi_stats.cpp` (`__cortexNapiStats`) | Travessias de ponte por tipo. |
| Sonda de fases | `?renderPhases=1..3`, `?matrixFreeze` (SPEC-0227) | Fases do render (memória `sonda-de-fases-do-render.md`). |

## 10. Shims WebGPU no host (a fronteira que o three usa)

Os métodos abaixo são os registrados por `setMethod`/`setProp` em `native/src/webgpu/*.cpp`:

- **navigator/contexto** (`navigator.cpp`): `requestAdapter`, `requestDevice`, `getPreferredCanvasFormat`, `configure`, `getCurrentTexture`.
- **GPUDevice** (`device.cpp`):
  - criação: `createBuffer`, `createTexture`, `createSampler`, `createShaderModule`, `createBindGroupLayout`, `createPipelineLayout`, `createBindGroup`, `createRenderPipeline[Async]`, `createComputePipeline[Async]`, `createCommandEncoder`, `createRenderBundleEncoder`;
  - escopos de erro: `pushErrorScope`, `popErrorScope`;
  - fila: `submit`, `writeBuffer`, `writeTexture`, `copyExternalImageToTexture`, `onSubmittedWorkDone`.
- **GPUBuffer** (`buffers.cpp`): `mapAsync`, `getMappedRange`, `unmap`, `destroy` (o destroy é **adiado em 10 quadros**, ADR-0153).
- **GPUTexture** (`textures.cpp`): `createView`, `destroy`.
- **GPURenderPipeline** (`pipeline.cpp`): `getBindGroupLayout`.
- **Encoder/pass/bundle** (`commands.cpp`):
  - encoder: `beginRenderPass`, `beginComputePass`, `copyBufferToBuffer`, `copyTextureToTexture`, `finish`;
  - pass: `setPipeline`, `setBindGroup`, `setVertexBuffer`, `setIndexBuffer`, `setViewport`, `setScissorRect`, `draw`, `drawIndexed`, `executeBundles`, `dispatchWorkgroups`, `end`.
- **Globais do host para render**:
  - `__cortexBloom`, `__cortexSceneHdr`, `__cortexUiLayer`, `__cortexSplashActive`, `__cortexNapiStats`;
  - `__cortexSceneMirror`, `__cortexMainPass`, `__cortexDrawBatch`, `__cortexGeometryRegistry`;
  - `__cortexBlitImage`, `__cortexRasterText`.
- Features e limits do adapter/device, constantes GPU* e o canvas fake ficam em JS (`native/js/src/shims/webgpu-extras.js`).
- **Ausentes (não encontrados no grep)**:
  - `drawIndirect`/`drawIndexedIndirect`, `setStencilReference`, `setBlendConstant`;
  - query sets expostos ao JS (o timestamp é só interno, no pass_timing);
  - `getCompilationInfo`;
  - `constants` no pipeline (seção 8).
- Render bundles são suportados, mas **desligados no uso** (ADR-0215: câmera congelada).
- Desatualizado: a seção "Limitações" do M0 (architecture.md, marcos) ainda diz que `mapAsync`/`copyTextureToTexture` não existem, mas os dois estão registrados hoje.

## 11. Kit de medição (SPEC-0382) e autopiloto (SPEC-0414)

Comandos (`native/scripts/perf/README.md`; só `.sh`, Git Bash; lock em `D:/jogos/detetive-brasilia/.cortex/measure.lock`):
```bash
K=native/scripts/perf
$K/lock.sh status | $K/lock.sh run <dono> -- <cmd>
$K/export.sh <engineDir> <gameDir> <outDir> <tag>        # export sem --debug, save isolado
$K/round.sh --exp <exp> --out <run> --spawn setorO [--extra '&k=v'] [--secs 135] [--autopilot walk|drive]
$K/validate.sh <runs>/*/                                  # VÁLIDO/INVÁLIDO (≥20 amostras após 30 s, world>0, apresentados>0)
$K/summarize.sh <runs>/*/
$K/ab.sh --a <expA> [--b <expB>] [--extra-a '&q=0'] --out <dir> --points "setorO comercial" [--reps 2] [--autopilot walk]
```
- **Métricas** (`trace-stats.mjs`, linhas 32-35 e 157-175): frameMs med/p95/p99, js do host med/p95 (frame-timing), **render** e **world** com `cpuAvg` e p99, draws, % apresentados e **`>33ms`** (fração das amostras acima de `SLOW_FRAME_MS = 33`, `trace-stats.mjs:22`). O A/B traz tabela por ponto com frameMs p95/p99 e js p95. Há alerta de `frameMs` no teto de 100 ms. Tempo de GPU sai à parte no `run.log` (`pass-timing`/`gpu-work`, com `CORTEX_FRAME_TIMING=1`, que o `round.sh` já exporta).
- **Autopiloto**: `src/input/InputAutopilot.ts` (controle virtual Xbox que troca `navigator.getGamepads`), perfis em `src/input/autopilotProfiles.ts`. `walk` dura cerca de 36 s por ciclo (anda, gira a câmera, pula, mira e atira). `drive` exige `&drive=1` no DDD 61. Liga com `?autopilot=<perfil>` (o `round.sh`/`ab.sh` acrescentam). A rodada é inválida se o autopiloto não ligou, se o jogador não andou ou se a câmera passou do horizonte.
- **Resolução**: o `round.sh:75` exporta `CORTEX_WINDOWED=1 CORTEX_WINDOW_OFFSCREEN=1 CORTEX_FRAME_TIMING=1 CORTEX_VRAM_LOG=1`. No modo janela o tamanho está **cravado em 1280×720** (`native/src/main.cpp:248`, sem variável de ambiente). Com o SSAA padrão de 2.0, o passe principal desenha em **2560×1440**.
  - **Hoje não dá para rodar em 1920×1080 pelo kit sem mudar código.** Seria preciso uma variável de tamanho de janela no `main.cpp`/`app_window.cpp`, ou rodar em fullscreen (sem `CORTEX_WINDOWED`, na resolução do desktop; o `round.sh` não oferece isso).
  - O **supersampling já é configurável sem código**: `CORTEX_RENDER_SCALE` é lido do ambiente, e um `export CORTEX_RENDER_SCALE=1.5` antes do `round.sh` é herdado pelo launcher. Não testei isso; o `round.sh` não tem flag própria para ele.
  - O PRD-0009 (`docs/prds/0009*.md:311-316`) já registra como prioridade (2026-10-24) "medir também em 1920×1080 e decidir o fator de supersampling por resolução". Em Full HD com 2×, o passe iria a cerca de 3840 px de largura.
