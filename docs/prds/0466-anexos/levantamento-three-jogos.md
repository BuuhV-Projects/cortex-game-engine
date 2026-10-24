> **Anexo do PRD-0466 / ADR-0465** (2026-10-24). Levantamento só de leitura (git show/git grep) dos jogos nos commits indicados. Caminhos de scratchpad citados são locais e temporários; o que vale é o arquivo:linha no repo indicado.

# Levantamento: o que cada jogo usa do three (para o renderer C++ do export)

**Data:** 2026-10-24 · **Só leitura** (`git show`/`git grep` nos commits; nada de checkout/build).

| Jogo | Commit lido | Onde fica o código |
|---|---|---|
| detetive-brasilia (DDD 61) | `e2be01c` | raiz (`entities/`, `missions/`, `utils/`, `main.ts`) |
| teste4 | `HEAD` = `99ee99a` (main) | raiz + fases geradas em TS (`scenes/course*.ts`) + overlays `assets/scene-data*.json` |
| kart-racer | `HEAD` = `e5046ff` | raiz + `scenes/level.json` |
| crash-bandicoot-racer | `HEAD` = `f560970` | quase tudo em dados (`scenes/*.json`, 1631 nós `model`) + `scenes/*.ts` |

Engine de referência: worktree `renderer-nativo-45b16a` (`src/`).

**Método.** As contagens excluem `vendor/`, `tests/`, `*.test.ts`, `tools/`, `scripts/` e `dev-assets/`. "Menções" são linhas de `git grep`. "Instâncias" contam `new X(`. Os GLBs foram lidos pelo cabeçalho JSON (script `glb.js` no scratchpad) e marcados como *usado* quando o nome aparece em cena/TS/manifest. Scripts usados: `cnt.sh`, `js.sh`, `agg.js`, `glb.js`, `glbext.js` em
`C:\Users\buuhb\AppData\Local\Temp\claude\D---buuhvprojects-js-game-engine--claude-worktrees-renderer-nativo-45b16a\0e95ad36-20a5-45e8-a409-14e6edbb5755\scratchpad\`.

---

## 0. O que a ENGINE cria por baixo (vale para todo jogo que usa o recurso)

| Recurso da engine | Arquivo | O que cria no three | Como fica no C++ |
|---|---|---|---|
| Preset `unlit` | `src/scene/Materials.ts:153` | `MeshBasicMaterial` (cor chapada, mantém `map`) | material fixo **unlit** |
| Preset `toon` | `Materials.ts:180` | `MeshToonMaterial` + `gradientMap` (rampa de N bandas, `DataTexture`); `preserveGloss` mantém `MeshStandardMaterial` em peça metálica/polida | material fixo **toon** (rampa como textura 1D ou nº de bandas) + **standard** no `preserveGloss` |
| Contorno (`outline`) | `Materials.ts:355-400` | casca filha `MeshBasicNodeMaterial` `BackSide`, `positionNode = position + normal*esp/len(normal no mundo)`; casca **SkinnedMesh** quando a malha é skinada; copia morph | material fixo **outline** (inverted hull no VS, já descrito em `MaterialDesc.outlineThickness`) **com variante skinada** |
| `MaterialDesc` (ADR-0237) | `src/render/MaterialDesc.ts:73-79` | aceita só Standard/Toon/Basic(+Node) | **recusa** `MeshLambertMaterial`, `MeshPhysicalMaterial`, `normalMap`, `alphaMap`, `alphaTest`, `envMap`, qualquer `*Node`. Precisa crescer (ver tabela final) |
| Água simples (`water`) | `src/scene/Water.ts:143,205-217` | `MeshStandardMaterial` + cáustica = `emissiveMap` com `offset` deslizante (CPU) | material fixo **standard** + transformação de UV animada no emissivo |
| Água `style:"cartoon"` | `src/scene/CartoonWaterMaterial.ts` | `MeshStandardNodeMaterial` TSL: ondas senoidais no VS, `mx_noise_float`, 16 ondulações (`uniformArray`), espuma de margem (`DataTexture`), fresnel, normal procedural | **WGSL próprio "água cartoon"** |
| Terreno com splat | `src/scene/Terrain.ts:400` | `MeshStandardNodeMaterial`, 4 camadas × splat RGBA (TSL) | material fixo **terrain-splat4** (ou WGSL) |
| Partículas | `src/scene/Particles.ts:201` | `InstancedMesh` de quads billboard (orientados na CPU), `MeshBasicMaterial` aditivo/normal, `depthWrite:false`, sem névoa | material fixo **unlit instanciado + blend aditivo** |
| Marcas de pneu | `src/systems/SkidMarkSystem.ts:89` (via `setupVehicle`) | malha ring buffer dinâmica, `MeshBasicMaterial` transparente | unlit + **buffer dinâmico** (upload parcial) |
| Vegetação | `src/scene/Vegetation.ts:239-258` | `InstancedMesh` + `MeshStandardMaterial` (sem vento, sem TSL) | standard instanciado |
| Sprite / Tilemap / Background | `Sprite.ts:66`, `Tilemap.ts:108`, `Background.ts:64` | `MeshBasicMaterial` em quad | unlit (nenhum dos 4 jogos usa) |
| Céu | `src/core/Skybox.ts` + `SceneBuilder.ts:626-659` | `fromGradient` (degradê → env via PMREM), `fromHDRI` (`.hdr` → background + PMREM), `fromPanorama` (PNG equiretangular como `scene.background`) | **recurso novo: skybox equiretangular + IBL pré-filtrado** |
| IBL | `src/core/Scene.ts:57` | `PMREMGenerator` → `scene.environment` (toda cena com `outdoorLighting` ganha um, nem que seja do degradê) | **recurso novo: env pré-filtrado** (gerar offline/no load em C++) |
| Luz exterior | `src/scene/OutdoorLighting.ts` | 1 `DirectionalLight` (sombra) + 1 `HemisphereLight` + 1 `AmbientLight`, ACES, `PCFSoftShadowMap` | dir + hemi + ambiente no UBO de luz |
| Sombra | `OutdoorLighting.ts:103` (`CameraFollowingCSM extends CSMShadowNode`), `:509-532` | mapa único (`shadowArea`) ou CSM N cascatas, fade, culling por razão angular | **já existe no host**: `native/src/render/shadow_pass.*` (depth-only em C++, SPEC-0245). Falta a amostragem PCF/cascata no material fixo |
| Névoa | `SceneBuilder.ts:618` | `scene.fog = new Fog(cor, near, far)` (linear) | **uniform de névoa linear** em todo material fixo (com flag `fog:false`) |
| PostFX | `src/core/PostFX.ts:131-148` | no host, bloom + vinheta vão para o C++ e o composite aplica **ACES**. `fxaa` e `toneMapping` são **ignorados** no host | **já existe no host** (`webgpu/bloom.cpp`, `native/shaders/bloom.wgsl`, composite em `supersample.cpp`) |
| UI de runtime no host | `src/ui/runtime/createUiLayer.ts` → `RendererUiBackend.ts:434,546,600,706` | **passa pelo three**: cena ortográfica numa RenderTarget própria, `MeshBasicNodeMaterial` TSL (retângulo arredondado por SDF + gradiente + borda; imagem com máscara arredondada; texto rasterizado pelo host e tingido) | composite **já existe** (`__cortexUiLayer`, ADR-0105). O **desenho** precisa de **WGSL próprio de UI** (ou de um renderer 2D em C++) |
| Canvas 2D | `native/js/src/shims/canvas2d/` | canvas em software → `Texture(canvas)` | **já existe no host**. O C++ só recebe pixels |
| KTX2 | `native/src/shims/ktx2*` | transcode basisu no host | **já existe no host** |
| SSAA | `native/src/webgpu/supersample.*` | renderScale + blit | já existe (substitui o FXAA) |

> Observação: o `GLTFLoader` cria `MeshPhysicalMaterial` sempre que o GLB declara `KHR_materials_specular`, `_ior`, `_clearcoat`, `_transmission` ou `_volume`. O `MaterialDesc` hoje recusa esses materiais (linha 151, "tipo EXATO"). Isso pesa em todos os jogos (ver os GLBs abaixo).

---

## 1. detetive-brasilia (DDD 61) @ e2be01c

Esse jogo usa o three direto: **não** usa presets `toon`/`unlit` nem `outline` da engine, e a cena do `buildScene` é inline no `main.ts:752`, sem `outdoorLighting`. Portanto **não há PMREM/IBL nem CSM**. A iluminação é Lambert + hemisfério + sol, com a sombra própria do jogo.

**1. Materiais** (instâncias `new`): `MeshBasicMaterial` **40**, `MeshLambertMaterial` **27**, `MeshLambertNodeMaterial` **3**, Standard só vindo dos GLBs (49 menções, clonados para animar o emissivo), Toon/Phong/Physical/Points/Line/Sprite **0** no código.
- Lambert + `vertexColors` + `map` (atlas): `entities/city.ts:394`, `entities/centro.ts:473`, `entities/car.ts:61` (`TRAFFIC_MATERIAL`).
- Emissivo com `emissiveMap = map` e `emissiveIntensity` animado de dia/noite (**63 menções**): `entities/city.ts:445,651`, `entities/centro.ts:481`, `entities/aguasClaras/towers.ts:197-198`, `entities/aguasClaras/posto.ts:107-130`, `entities/bigStores.ts:145-165`, `entities/hospitals.ts:71`.
- `colorWrite:false, depthWrite:false` (malha só de colisão/raycast, não desenha nada): `city.ts:413`, `centro.ts:484`, `aguasClaras/towers.ts:199`.
- `side: DoubleSide`: 12 menções (`city.ts:459`, `people/peopleGpu.ts:212`). `fog:false`: 13 menções (céu, seta de navegação, luzes de veículo). `toneMapped:false`: céu e painéis do metrô (`metroBoards.ts:215`).
- GLBs: **245** arquivos, 515 materiais, 203 com textura base, **0 normalMap**, 0 metal/rough map, 10 `BLEND`, 441 `doubleSided`, **86 com `KHR_materials_specular`** (o loader cria `MeshPhysicalMaterial`), 14 com `COLOR_0`, 119 GLBs com skin (são fonte do bake de pessoas; só o player é `SkinnedMesh` em runtime), 9 ponteiros LFS não lidos.
- **C++:** a maior parte é material fixo **lambert** (novo, não existe no `MaterialDesc`) com `vertexColors` + `map` + emissivo com intensidade em uniform. Também usa **unlit**. O GLB Physical cai para **standard/lambert**, descartando `specular`. Malha com `colorWrite:false` não vai para a fila de desenho.

**2. TSL / shader custom** (`Fn(` 0, `onBeforeCompile` 0, `.wgsl` 0):
- **`entities/people/peopleGpu.ts`** (262 linhas). NPCs montados no vertex shader: a geometria de todos os tipos fica numa `DataTexture` rgba32float (`:108`). A malha é só um índice de canto. O shader faz `textureLoad`, dobra os membros em volta dos pivôs pelos ângulos da instância (7 `vec4` por instância: `iRow0..2`, `iLimb1..4`, `peopleMesh.ts:20`) e aplica paleta + atlas de letras com `alphaTest` (`:209-215`: `positionNode`, `normalNode`, `colorNode`). Usado em `peopleBatch.ts:58,101` (herói com capacidade 4 + chunks `PEOPLE_CHUNK`) e `crowdBatch.ts:41`. **C++: WGSL próprio (específico do jogo)**, com vertex pulling e atributos de instância arbitrários.
- `entities/people/playerSkin.ts:178-186`: Lambert com `colorNode` que pinta por slot (atributo `SLOT_ATTRIBUTE`, luminância × cor do guarda-roupa, `select` encadeado). **C++: lambert + "tinta por slot" (máscara de até 5 cores)**: variante do material fixo ou WGSL pequeno.
- `entities/parkedCars.ts:21-22`: `colorNode = mix(attribute color, attribute instancePaint, attribute paintMask)`, ou seja, cor por instância só na lataria. **C++: lambert instanciado com cor de instância mascarada.**
- Névoa: `Fog` linear dinâmica (`main.ts:495-497`). Cor, near e far mudam por hora e chuva (`main.ts:1366-1370`). **C++: uniform de névoa linear.**
- Céu: `entities/skyDome.ts:113-140`. Domo com cor por vértice recolorido na CPU a cada quadro, sol em quad aditivo, estrelas aditivas e nuvens translúcidas, tudo `MeshBasicMaterial` com `renderOrder -1`. **C++: unlit + vertexColors + aditivo** (não precisa skybox).
- UV scroll, vento e cáusticas: **0**.

**3. Luzes:** 1 `DirectionalLight` (sol, **única com sombra**) e 1 `HemisphereLight` (`main.ts:499-500`). **6 `SpotLight`** de poste em pool fixo (`streetLighting.ts:23`, `STREET_LIGHT_COUNT=6`, sem sombra). **2 `SpotLight`** de farol do player (`playerHeadlights.ts:34`). Total: **10 luzes simultâneas, sempre na cena** (apagar = intensidade 0, para não trocar a variante do shader). Faróis da frota são falsos (lentes e halos instanciados, `vehicleLights.ts:142,147`). **C++: UBO de luzes com dir + hemi + até 8 spots, sem variante por contagem.**

**4. Sombra:** **própria**, `entities/sunShadow.ts` (SPEC-0130). Um mapa único `2048²` (`:20`), ortográfico, meia-largura 45 m (`:18`), que acompanha a câmera com deslocamento para a frente. `autoUpdate=false` (`:158`) e `needsUpdate` só quando o foco anda 0,4 da meia-largura ou a cada **3 s** (`:37-38`). Projetam: casters marcados uma vez no boot, com altura mínima de 0,3 m e sem transparentes nem `colorWrite:false` (`:116-120`). Recebem: só o chão (rua e calçada). Força 0,8, bias −0,0004, normalBias 0,04. `?sombra=0` desliga. **C++: o shadow pass do host serve se aceitar "mapa único com refresh sob demanda".** Precisa de flag por malha (cast/receive) e da força da sombra.

**5. Instancing:** `sharedInstancedMesh` (buffer de matrizes alargado para ≥1025, `entities/sharedInstancedMesh.ts:39`) em **20 pontos de criação**: torres de AC (`aguasClaras/towers.ts:381`), sangue (`blood.ts:54`), props quebráveis e cabos (`breakableProps.ts:154-168`), rodas do trânsito (`car.ts:111`), caixas de acessório (`figureBatch.ts:108`, com `instanceColor`), carros estacionados (`parkedCars.ts:102`), lojas, portas e piscinas de luz (`shops.ts:98-114`), lentes e halos (`vehicleLights.ts:147`), efeitos de combate (`missions/combate/effects.ts:75`), feiras e lixo (`feiraActivity.ts:148`, `garbageJob.ts:206`), parque (`dogWalkers.ts:155`, `families.ts:137`, `parkLife.ts:196`), restaurante (`restaurant.ts:194,198`). Mais o `PeopleMesh` (vertex pulling) e a `Vegetation` da engine (`aguasClaras/parkForest.ts:50`). `InstancedBufferAttribute` custom: 4 (`instancePaint`, `instanceColor`). `BatchedMesh`: 0. **C++: instancing nativo com atributos por instância extras (cor, máscara, 7×vec4 das pessoas).**

**6. Skinning:** `SkinnedMesh` só para o **player** e os dublês dele (`playerSkin.ts:199-201`, Mixamo 22 ossos + auxiliares), com `AnimationMixer` só no detetive (`playerSkin.ts:68`). Simultâneos: **1 a 4** (herói, StandIn, piloto da moto, clone do barbeiro). Os NPCs **não** são skinados (são o `peopleGpu`). Morph: 0. **C++: skinning por GPU com 1 a 4 esqueletos de ~22-30 ossos** (a animação continua no JS).

**7. Transparência:** `transparent:true` 17 menções, `alphaTest` 3 (`city.ts:414` pichações, `crimes/pichacao/graffitiCrime.ts:121`, `peopleGpu.ts:215` letras), aditivo 13 menções (`city.ts:425`, `groundMarker.ts:40`, `skyDome.ts:114`, `vehicleLights.ts:142`), `depthWrite:false` 21, `renderOrder` 12 (`aguasClaras/posto.ts:119`, `bigStores.ts:165`, `groundMarker.ts:48`, `shops.ts:117`), `polygonOffset` 2 (`blood.ts:53`, `combate/effects.ts:120`). **C++: blend normal/aditivo, alpha-test, ordenação por `renderOrder` e depois por distância, polygonOffset (depth bias) no pipeline.**

**8. Sprites, partículas, linhas e texto:** `Sprite`/`Points`/`Line`/`Decal`/Troika: **0**. `ParticleEmitter` da engine em 2 sistemas (`carDamage.ts:108`: fumaça cinza, preta e de explosão; `carWreck.ts:112`). Chuva: 1400 traços em malhas fixas que só se movem, `MeshBasicMaterial` transparente (`rain.ts:8,45`). Marcas de pneu da engine via `setupVehicle`. Texto: **canvas 2D** em `Texture(canvas)` (11 `new Texture`, 21 `getContext('2d')`): placas de ônibus (`busSign.ts:32-42`), painéis do metrô (`metroBoards.ts:212`), letreiros (`city.ts:361`, `centro.ts:125`, `aguasClaras/towers.ts:121-188`). **C++: unlit; o canvas já é software no host.**

**9. UI:** `UiLayer`/`loadUiTemplate` (16 menções, ex.: `entities/jobs.ts:101`, `missions/shopping/shoppingUi.ts:34`). No host ela **passa pelo three** (`RendererUiBackend`, ver §0).

**10. Pós-processamento:** **nenhum** (`PostFX` 0, `toneMapping` 0). `colorSpace = SRGBColorSpace` nas texturas de canvas (11). O ACES default do composite vale.

**11. Render targets e câmeras:** `RenderTarget` 0, `renderer.render` aninhado 0, `CubeCamera`/espelho/retrovisor/minimapa **0**. Câmera: a do jogo (`game.camera`/`renderCamera`) mais o `trainCamera.ts`, que só controla a mesma câmera. **Layers:** `FIGURE_PART_LAYER`, que nenhuma câmera desenha (`figure.ts:240`; o lote copia as matrizes em `scene.onBeforeRender`). **C++: máscara de layer por nó + hook de pré-render.**

**12. Outros:** `DataTexture` 4 (`peopleGpu.ts:108` paletas e geometria float32). `KTX2` 0, `VideoTexture` 0, `Line2` 0, `Reflector`/`Water`/`Sky` do examples 0. Geometria custom: **41 `new BufferAttribute`**, 16 `new BufferGeometry` (cidade procedural mesclada com cor por vértice, `city.ts`, `geometry.ts`), com `DynamicDrawUsage` nas instâncias. **C++: geometria arbitrária com atributos `position/normal/uv/color` + extras de instância; textura float32 amostrável por `textureLoad`.**

---

## 2. teste4 @ HEAD (99ee99a)

Platformer 3D em kits GLB. As fases são geradas em TS e o look vem dos presets da engine, autorados no overlay.

**1. Materiais:**
- Presets no overlay (`assets/scene-data*.json`, 22 arquivos, `data.material`): **unlit+outline 381**, unlit 79, toon 28, toon+outline 27, unlit+outline sem textura 4. Nas fases TS: `type:'unlit'|'toon'` 20 (`scenes/course.ts:74,93`, `scenes/hub.ts:416`), `outline:` 9.
- Código: `MeshBasicMaterial` 11 menções (`utils/PlasmaPortal.ts:477`, `utils/PortalSign.ts:80`, `utils/RenderDebug.ts:43` só de dev), `MeshStandardMaterial` 4 (`utils/WardrobeMenu.ts:241` piso do estúdio). Toon/Physical/Lambert criados à mão: **0**.
- GLBs: **684** arquivos, 879 materiais, 867 com textura base, **63 normalMap**, **209 emissivos (198 com `emissiveTexture`)**, 80 `BLEND`, 8 `MASK`, 802 `doubleSided`, **`KHR_materials_specular` 388 e `_ior` 386** (vira Physical se nenhum preset substituir), `KHR_texture_transform` **41 GLBs usados** (kit underworld: `arch_001`, `barrel_001`…), `KHR_materials_emissive_strength` 131, `KHR_materials_unlit` 2. Mais 57 GLBs com skin (trajes).
- `matte` global zera `envMapIntensity` e define rugosidade; `main.ts:119-155` reacende o reflexo do céu nos materiais PBR.
- **C++: unlit + outline e toon (+outline) cobrem a grande maioria.** O PBR restante vira **standard com normalMap, emissiveMap e transformação de UV por textura** (offset, repeat e rotação do `KHR_texture_transform`).

**2. TSL / shader:** nenhum `Fn`/`uniform`/`colorNode` no jogo. Tudo é da engine:
- Contorno inverted hull (§0), inclusive em **SkinnedMesh** (o player e os trajes recebem `applyMaterial`, `entities/dressCutePlayer.ts:461`).
- Água simples com cáusticas (`emissiveMap` deslizante): `scenes/course.ts:242-251` (`waves_1.png`, repeat 8, intensidade 0,55, flow `[0.02, 0.013]`), também em `courseKit`, `courseKitAqua` (12 menções), `courseKitChocolate`, `fase2`. **C++: standard + emissivo com UV animado** (material fixo, sem WGSL).
- Névoa por fase: 45 menções (`courseKitSpace.ts` 9, `courseKitUnderworld.ts` 5, `courseKitAqua.ts` 4), e `utils/HubScreen.ts:69` troca `three.fog`.
- Céu: skybox por fase (`scenes/levels.ts` 21 menções). `main.ts:403-432` carrega PNG equiretangular, define `scene.background`, gera **PMREM** do skybox (`game.scene.setEnvironment`), aplica `environmentIntensity` e `backgroundIntensity`. Underworld usa `Skybox.fromGradient` (`courseKitUnderworld.ts:122`).
- UV de roupa: `texture.offset.x` para trocar a cor do traje (`dressCutePlayer.ts:359`). **C++: offset de UV no material.**
- Portal de plasma: `DataTexture` gerada na CPU + `MeshBasicMaterial` aditivo com opacidade animada (`PlasmaPortal.ts:325-393,477-535`). Sem shader custom.

**3. Luzes:** as da engine (`outdoorLighting`): 1 dir com sombra, 1 hemi e 1 ambiente. Guarda-roupa: cena própria com 1 `AmbientLight` e 2 `DirectionalLight` sem sombra (`WardrobeMenu.ts:231-235`). Point/Spot: **0**.

**4. Sombra:** da engine. **CSM** nos mundos aqua, space e underworld (`courseKitAqua.ts:792`, `courseKitSpace.ts:819`, `courseKitUnderworld.ts:880`, com `shadowMapSize: SHADOW_MAP_SIZE`). Os demais usam o mapa único `shadowArea`. Overlay com `shadow` em 13 arquivos, `castShadow` 26 e `receiveShadow` 20 nós. **C++: shadow pass do host + amostragem de cascata.**

**5. Instancing:** `InstancedMesh`/`BatchedMesh` próprios: **0**. Só o que a engine faz (fusão estática, vegetação ausente).

**6. Skinning:** **29 menções** de `SkinnedMesh` em `entities/dressCutePlayer.ts`. Player "cute" + peças de traje como `SkinnedMesh` ligados ao **mesmo esqueleto** (`:52`, `worn.castShadow` `:289`), `SceneAnimator` (`:463`, `AnimationMixer` da engine), `setupThirdPerson` (`main.ts:330`, `HubScreen.ts`). Simultâneos: **1 personagem com várias malhas skinadas** (corpo + traje), mais a cópia no preview do guarda-roupa, cada uma com casca de contorno skinada. Morph: 0. **C++: skinning GPU; várias malhas compartilham uma paleta de ossos.**

**7. Transparência:** `transparent:true` 3 (`scenes/hub.ts:416` névoa unlit com opacidade, `PlasmaPortal.ts:483`, `PortalSign.ts:81`), aditivo no portal (`PlasmaPortal.ts:485`), `depthWrite:false` 3, GLB `BLEND` 80 e `MASK` 8. **C++: blend, alpha-test e ordenação por distância.**

**8. Sprites e partículas:** **0** (sem `ParticleEmitter`, `Sprite`, `Points` ou linha). Placa do portal: quad `MeshBasicMaterial` com textura (`PortalSign.ts:80-118`).

**9. UI:** muito pesada (menus, loja, guarda-roupa, resultados, cinematics em `utils/*Menu.ts`, `LoadingScreen.ts:100`, `Ending.ts:106`). `ui.render()` é chamado à mão nas telas de carregamento. No host **passa pelo three** (`RendererUiBackend`).

**10. Pós-processamento:** `PostFX` por fase (`main.ts:439-451`): bloom (strength, threshold e radius próprios), vinheta (0,55 / 0,32 / 0,75), `fxaa:true`, `ACESFilmicToneMapping`, `exposure`. No host: bloom e vinheta **já são C++**, o FXAA é ignorado (o SSAA cobre). `colorSpace` sRGB em 3 texturas.

**11. Render targets e câmeras:** **segunda cena + segunda câmera**: `WardrobeMenu.ts:213-216` (`new Scene()` + `PerspectiveCamera`) desenhada com `game.renderer.render(three, camera)` (`:757`). **Substitui** o quadro do jogo enquanto a tela está aberta; não é aninhado. Sem RenderTarget, CubeCamera, espelho ou layers. **C++: o renderer tem que aceitar desenhar outra "cena" com outra câmera no quadro** (API `render(scene, camera)` genérica, não um singleton de cena).

**12. Outros:** `DataTexture` 7 (portal), `KTX2` 0, `CanvasTexture` 0. Um nó `mesh` (ProBuilder) em `scene-data-space2.json`. `terrain` só em `scenes/level.json` (template; a fase real vem do TS).

---

## 3. kart-racer @ HEAD (e5046ff)

Corrida estilizada. Quase tudo é dado (`scenes/level.json`, 194 nós `model`) + carros em TS.

**1. Materiais:**
- `level.json`: **193 de 194** nós com `material.type:"toon"`. **133 com `outline`** (o comentário da engine em `Materials.ts:375` diz que o contorno representa "45% dos materiais da cena" no kart). **129 com `preserveGloss`** (metal e polido continuam `MeshStandardMaterial` + IBL). 105 com `gradientSteps`, 22 com `outlineColor`, 130 `matte`.
- Carros: `applyMaterial(model, cortexMaterialConfig)` nas variantes de roda (`entities/createCar.ts:74`), com `mergeSubtree` depois.
- Efeitos (`entities/createKartEffect.ts`): `MeshBasicMaterial` com vertexColors, aditivo, DoubleSide (chama do escapamento, `:40-41`); `MeshStandardMaterial` com mancha de óleo, `DataTexture` 384², transparente, `polygonOffset −2` (`:164-166`); escudo com `MeshBasicMaterial` transparente + **`wireframe:true` aditivo** (`:169-174`); bico do nitro `MeshStandardMaterial` metal 0,8 (`:186`).
- GLBs: **126** arquivos, 607 materiais, só 42 com textura base, 28 com metal/rough map, 0 normalMap, 586 `doubleSided`, **`KHR_materials_clearcoat` em 5 carros usados** (`camaro-blower.glb`, `classic-ss.glb`, `fusca-custom.glb`, `gol-g3.glb`…; vira Physical antes do preset), 2 `KHR_materials_unlit`.
- **C++: toon + outline (maioria), standard com IBL (`preserveGloss`), unlit; wireframe (topologia de linhas ou recurso novo); clearcoat é descartado ou aproximado.**

**2. TSL / shader:**
- **Pós próprio** `systems/SpeedEffectSystem.ts:22-48`: `pass(scene, camera)` + **borrão radial de 12 amostras** a partir do centro, máscara `smoothstep(.24,.62)`, vinheta e `uniform(0)` de força. Montado num `RenderPipeline` do three (`:48`), que substitui o PostFX (`game.setPostFX({render})`, `:51`). FOV também cresce com a velocidade. **C++: WGSL próprio de pós (borrão radial), com uniform de força, encaixado na cadeia de pós do host.**
- Névoa linear `#b5dfff` de 300 a 850 m (`level.json`).
- Céu: **HDRI** `assets/brasilia/ceu-claro.hdr` (`hdriIntensity 0.85`, `hdriBlur 0`) que vira **background equiretangular + PMREM**. Degradê `skyTop/Middle/Bottom` também declarado (o HDRI tem precedência, `SceneBuilder.ts:631`).
- `uniform` do TSL só no pós (`SpeedEffectComponent.ts:6`). Fora isso, nada de UV scroll, vento ou água.

**3. Luzes:** só as do `outdoorLighting`: sol com sombra (intensidade 2,05), hemi (1,05) e ambiente (0,8). Point/Spot: **0**.

**4. Sombra:** **CSM com 1 cascata** de `2048²`, `shadowDistance 160`, `lightMargin 200`, `shadowFade`, `shadowCasterMinRatio 0.15`, bias −0,00015, normalBias 0,025. Rodas com `castShadow=false` (`createCar.ts:70`). `castShadow` em 194 nós, `receiveShadow` em 176. **C++: shadow pass do host + culling por razão angular (SPEC-0197).**

**5. Instancing:** 1 `InstancedMesh` (brasas do escapamento, 14 instâncias, `createKartEffect.ts:54`). O resto é fusão estática da engine.

**6. Skinning:** **0 em runtime** (o único GLB com skin é o template `assets/characters/player.glb`, não usado na corrida). Morph: 0.

**7. Transparência:** `transparent:true` 4, aditivo 4, `depthWrite:false` 4, `renderOrder` 1 (`createKartEffect.ts:167`), `polygonOffset` 1. GLB `BLEND` 2 e `MASK` 8.

**8. Sprites e partículas:** sem `ParticleEmitter`. "Partículas" do kart são `Mesh` com `MeshBasicMaterial` (`components/KartRaceComponent.ts:5`) + as brasas instanciadas. Wireframe do escudo. Linhas e texto: 0.

**9. UI:** `GameUiSystem`/`loadGameUi.ts` (UI da engine). No host passa pelo three.

**10. Pós-processamento:** sem `PostFX` da engine. O pós é o borrão próprio do item 2. Tone mapping é o ACES default. `colorSpace` sRGB na textura do óleo.

**11. Render targets e câmeras:** o `pass()` do borrão é uma **RenderTarget da cena inteira** (o three renderiza a cena num alvo e o pipeline amostra). `renderer.render(scene, camera)` direto quando o efeito está desligado (`SpeedEffectSystem.ts:86`). 1 câmera. Sem espelho, retrovisor, minimapa ou layers.

**12. Outros:** `DataTexture` 1 (óleo), `KTX2` 0, `CanvasTexture` 0, geometria custom de chama (`Float32BufferAttribute`, `createKartEffect.ts:3-40`).

---

## 4. crash-bandicoot-racer @ HEAD (f560970)

Corrida em dados. **Zero material, luz ou TSL criado no código**, exceto `PointLight` e `PostFX`. Todo o look vem dos GLBs + `matte:true` + engine.

**1. Materiais:**
- Cenas: **1631 nós `model`** (`coastal-extension.json` 679, `decoracao.json` 589…), 1627 com `matte`, sem preset toon/unlit/outline (o kit é cartoon por **textura**, não por shader).
- GLBs: **338** arquivos, 1107 materiais, 470 com textura base, **139 normalMap**, 187 metal/rough map, **186 emissivos** (38 com textura), 915 `doubleSided`, 1 `BLEND`.
  - **`COLOR_0` em 147 GLBs usados** (`assets/calcario/arco-natural-grande.glb`, `cachoeira-cascata.glb`…). Gotcha conhecido: vertex color em `MeshStandardMaterial` sai **branco** no export por miscompilação do naga. O renderer C++ resolve isso de graça.
  - **`KHR_texture_basisu` (KTX2) em 42 GLBs** com LOD0/1/2 do `reference-circuit`, carregados pelo streaming (`assets/reference-circuit/mapa.manifest.json:26-98`, `systems/CircuitStreamingSystem.ts:15`).
  - `KHR_materials_clearcoat` em 9 usados (cachoeiras, `assets/kart/kart-laranja.glb`). **`KHR_materials_transmission` em 1 usado** (`assets/personagens/competidores/lira/lira-kart.glb`): no three isso força um **passe extra de transmissão** (cena opaca renderizada numa textura). `_volume` 16 e basisu fora do circuito só em assets não referenciados.
- **C++: material fixo standard com normalMap, metal/rough map, emissiveMap e vertex color**, cobrindo quase tudo. Clearcoat e transmission precisam de decisão (descartar ou aproximar).

**2. Shader / efeitos (todos da engine):**
- **Água `style:"cartoon"` em 3 nós** (`scenes/decoracao.json:8126`, `scenes/reference-circuit.json:63`, `scenes/waterfall-descent.json:3603`), com `waveHeight`, `waveLength`, `waveSpeed`, `foamStrength`, `foamWidth`, `segments` e `follow`. É o `CartoonWaterMaterial` TSL (§0). **C++: WGSL próprio de água.**
- Névoa linear em 3 cenas (`waterfall-descent` 750-1900, `reference-circuit` 1000-2600, `track` 420-780).
- Céu: degradê `skyTop/Middle/Bottom` (vira **PMREM**) e **skybox PNG** no reference-circuit (`assets/reference-circuit/skybox.png`, `fromPanorama`).
- LOD por distância: `scenes/distanceDetail.ts` alterna `visible` entre o modelo reduzido e o completo, com `mergeStaticScene` (`:49`).

**3. Luzes:** sol (com sombra), hemi e ambiente da engine. **6 `PointLight` de preenchimento** (`scenes/coastal-lighting.json`, criadas em `scenes/loadLevel.ts:51`, fora do reference-circuit) + **pool de 4 `PointLight`** que seguem as luzes mais próximas da câmera com fade de 30/55 m (`scenes/nearbyLights.ts:20`, `ACTIVE_LIGHTS=4`). Até **3 + 10 luzes** simultâneas. Point sem sombra. **C++: UBO com até ~12 point lights, sem variante por contagem.**

**4. Sombra:** **CSM com 3 cascatas** de `2048²` em `waterfall-descent` e `reference-circuit` (`shadowDistance 220`, `lightMargin 240`). `track.json` usa mapa único (`shadowArea 170`, 2048²). O sol é reposicionado em `loadLevel.ts:56-62`. `castShadow` e `receiveShadow` em ~1627 nós.

**5. Instancing:** nenhum próprio. A engine faz a fusão estática (`mergeStatic: !isReferenceCircuit`, `loadLevel.ts:39`). O manifest do circuito lista `instances` (61) para o streaming.

**6. Skinning:** **0** (os GLBs não têm skin). Os karts competidores são rígidos.

**7. Transparência:** `opacity` 3 e `blending` 3 (as partículas), GLB `BLEND` 1, transmission 1.

**8. Partículas:** **3 nós `particles`** (`scenes/decoracao.json:8506,8541,8576`) com `max/rate/life/speed/direction/spread/gravity/drag/opacity/blending/loop`, usando o `ParticleEmitter` da engine. Sprites, linhas e texto: 0.

**9. UI:** menu de fases (`scenes/levelMenu.ts:14`, `UiPanel` com `linear-gradient`) e HUD (`scenes/raceHud.ts`). No host passa pelo three, e o gradiente usa o SDF de UI.

**10. Pós-processamento:** `scenes/loadLevel.ts:30-34` usa `fxaa`, bloom fraco (0,05 / 0,82 / 0), vinheta (0,28 / 0,55 / 0,9), **`AgXToneMapping`** e `exposure 0.83`. No host: bloom e vinheta em C++; **AgX e FXAA são ignorados** (o composite aplica ACES). Já existe divergência visual entre o Studio e o export.

**11. Render targets e câmeras:** 1 câmera (`far` por fase, `loadLevel.ts:26`). Sem RT próprio. O three cria RT internas para PMREM, CSM e **transmissão** (o `lira-kart`).

**12. Outros:** KTX2 via streaming (host já transcodifica). `DataTexture` 0. Geometria custom 0 (tudo GLB). FB_ngon_encoding só em GLB não referenciado.

---

## 5. Tabela consolidada: recurso → jogos → como fica no renderer C++

Legenda dos jogos: **D** = DDD 61, **T** = teste4, **K** = kart-racer, **C** = crash-racer.

| Recurso | Jogos (intensidade) | Como fica no renderer C++ |
|---|---|---|
| Unlit (`MeshBasicMaterial`) | D (40 inst.), T (381+ presets), K (efeitos), C (via engine) | **material fixo `unlit`** (map, cor, opacidade, `fog`, `toneMapped`, vertexColors) |
| Lambert (`MeshLambertMaterial` e `MeshLambertNodeMaterial`) | **D** (27 + 3), base da cidade inteira | **material fixo `lambert` NOVO** (o `MaterialDesc` hoje recusa) com map, vertexColors, emissivo/emissiveMap e intensidade em uniform |
| Standard PBR (dos GLBs) | T, K (`preserveGloss`), **C** (quase tudo), D (GLB do Blender) | **material fixo `standard`** + **normalMap** (T 63, C 139), metal/rough map (C 187), emissiveMap (T 198, C 38), **vertex color** (C 147 GLBs) e transformação de UV (T 41 GLBs) |
| Physical (specular, ior, clearcoat, transmission, volume) | D 86, T 388, K 5, C 9+1 | **rebaixar para `standard` na tradução** (specular e ior descartados; clearcoat ignorado ou aproximado). **Transmission** (C, `lira-kart`): decidir entre descartar ou criar recurso novo |
| Toon (rampa de bandas) | K (193 nós), T (55) | **material fixo `toon`** (rampa N bandas) |
| Contorno inverted hull | T (~412), K (133) | **material fixo `outline`** (VS extruda pela normal), **também skinado** (T) |
| Tinta por instância/slot (TSL pequeno) | D (`parkedCars.ts:22`, `playerSkin.ts:178`) | **variante do lambert**: cor de instância × máscara, ou paleta de 5 slots |
| Pessoas por vertex pulling (`peopleGpu`) | **D** | **WGSL próprio do jogo**: textura float32 de geometria, 7×vec4 por instância, paleta, atlas com alpha-test |
| Água cartoon (TSL) | **C** (3 nós) | **WGSL próprio "água"** (ondas, noise, 16 ondulações, espuma, fresnel) |
| Água simples + cáustica | T (5 mundos) | standard + **UV animado no emissiveMap** (material fixo) |
| Terreno splat 4 | (só templates) | material fixo `terrain-splat4`, baixa prioridade |
| Névoa linear | D (dinâmica), T, K, C | **uniform de névoa** em todos os fixos, respeitando `fog:false` |
| IBL / PMREM (environment) | T (skybox), K (HDRI), C (degradê) | **recurso novo: env pré-filtrado** (cubemap/equirect com mips de rugosidade) + `environmentIntensity` |
| Skybox / fundo equiretangular | T, K (HDR), C (PNG) | **recurso novo: passe de céu** (equirect + `backgroundIntensity`/blur) |
| Céu por domo (geometria) | D | unlit + vertexColors + aditivo (nada novo) |
| Directional + Hemisphere + Ambient | todos | UBO de luzes (fixo) |
| Spot (até 8) | **D** | UBO de spots (cone, penumbra, decay), sem sombra |
| Point (até ~10) | **C** | UBO de points (distance, decay), sem sombra |
| Sombra de mapa único | D (próprio, refresh sob demanda 0,4×/3 s), C (`track`) | **já existe no host** (`shadow_pass.cpp`). Faltam a amostragem PCF no material fixo, o refresh sob demanda e a força |
| CSM (1 a 3 cascatas, fade, culling angular) | K (1), C (3), T (3 mundos) | shadow pass do host por cascata + seleção e fade no fragmento |
| Instancing (`InstancedMesh`) | **D** (~20 pontos), K (1), engine (partículas, vegetação) | instancing nativo + **atributos de instância extras** (cor, máscara, vec4s) |
| Skinning | D (1 a 4 bonecos), T (player + trajes no mesmo esqueleto) | **recurso novo: skinning GPU** (paleta de ossos por esqueleto; animação continua no JS) |
| Transparência (blend normal/aditivo, alpha-test, `renderOrder`, `polygonOffset`, `depthWrite:false`, `colorWrite:false`) | D (muito), T, K, C | estado de pipeline + **fila transparente ordenada** (`renderOrder` e depois distância); `colorWrite:false` sai da fila |
| Wireframe | K (escudo) | topologia de linhas ou malha de arestas pré-gerada |
| Partículas da engine | D (2 sistemas), C (3 nós) | unlit instanciado aditivo (billboard já vem da CPU) |
| Marcas de pneu (buffer dinâmico) | D | unlit + upload parcial de vertex buffer |
| Texto/painéis por canvas 2D | D (11 texturas) | **já existe no host** (canvas2d software); o C++ só recebe a textura |
| UI de runtime | D, T (pesada), K, C | composite **já existe** (`__cortexUiLayer`). O desenho do overlay passa pelo three: **WGSL próprio de UI** (retângulo SDF com gradiente/borda, imagem mascarada, quad de texto) |
| Bloom + vinheta | T, C | **já existe no host** (`bloom.cpp`, `bloom.wgsl`) |
| Tone mapping ACES | todos | **já existe** no composite |
| Tone mapping AgX | C | **recurso novo** (curva AgX no composite). Hoje o export ignora |
| FXAA | T, C | ignorado no host; o SSAA (já existe) cobre |
| Pós custom (borrão radial) | **K** | **WGSL próprio de pós** + uniform, com slot na cadeia de pós do host |
| Segunda cena + câmera (substitui o quadro) | T (guarda-roupa) | API `render(scene, camera)` genérica no renderer |
| RenderTarget da cena para pós | K (`pass()`) | o offscreen HDR do host já existe; o pós custom amostra dele |
| Layers / máscara de câmera | D (`FIGURE_PART_LAYER`) | máscara de layer por nó no culling |
| KTX2 / basisu | C (42 GLBs, streaming) | **já existe no host** (transcode) |
| DataTexture (RGBA8 e float32) | D, T, K | upload de textura; float32 com `textureLoad` (D) |
| Geometria custom (BufferGeometry e atributos) | **D** (41), K | vertex buffers arbitrários; layout por material |
| Espelho, retrovisor, minimapa, CubeCamera, Reflector, Sky e Water do examples, Line2, Points, Sprite, Decal, Troika, VideoTexture, morph targets, BatchedMesh | **nenhum jogo** | não precisa |

### As 5 coisas mais difíceis de portar

1. **`peopleGpu` do DDD 61.** Os personagens são montados no vertex shader a partir de uma DataTexture float32, com dobra de membros por 7 vec4 de instância, paletas e atlas de letras com alpha-test. Exige WGSL próprio do jogo e uma API de "material custom" que receba atributos de instância e texturas de dados arbitrários.
2. **Água cartoon (crash).** O grafo TSL tem ondas no VS, `mx_noise_float`, 16 ondulações em uniform array, espuma de margem por textura e fresnel sobre PBR. Precisa de port manual para WGSL, incluindo o noise do MaterialX e a iluminação PBR para ficar em paridade.
3. **UI de runtime.** No host ela passa pelo three: cena ortográfica numa RT com SDF de retângulo arredondado, gradiente CSS, borda, imagem mascarada e texto tingido. Tirar o three exige um renderer 2D próprio (WGSL de UI) com paridade com o DOM do Studio. Afeta os 4 jogos; o teste4 é o que mais usa.
4. **Iluminação baseada em imagem e céu.** O PMREM a partir de degradê, HDRI ou PNG, o skybox equiretangular e o PBR standard com IBL (teste4, kart e crash) precisam de pré-filtragem própria e paridade com o three. Junto vêm as extensões que o GLTFLoader transforma em Physical (specular, ior, clearcoat e o **transmission** do `lira-kart`, que no three é um passe extra).
5. **Pós e sombras com paridade.** O borrão radial do kart roda hoje em `RenderPipeline` do three. O AgX e o FXAA do crash são ignorados no host. A sombra própria do DDD (mapa único com refresh sob demanda, só o chão recebe) e a CSM de 1 a 3 cascatas com fade dos outros jogos precisam caber no shadow pass existente, com amostragem no material fixo. Somam-se o **skinning GPU** com contorno skinado (teste4) e o Lambert com spots (DDD), que não estão no `MaterialDesc` atual.

### Pontos de atenção encontrados

- O `MaterialDesc` (`src/render/MaterialDesc.ts:73-79,151`) recusa hoje **Lambert** (o DDD inteiro), **Physical** (D, T, K e C, via extensões do GLB), `normalMap` (T e C), `alphaTest` (D) e qualquer `*Node`. A cobertura real do DDD e do crash pelo caminho de descrição deve estar baixa.
- O crash declara **AgX** e o host aplica **ACES**: o export já diverge do Studio.
- O vertex color em Standard (**147 GLBs do crash**) sai branco no export atual (gotcha do naga). O renderer C++ elimina isso.
- O `scenes/level.json` do DDD (skybox e terrain) **não é usado** em runtime: o `main.ts:752` passa uma cena inline sem `outdoorLighting`.
- Não verificado: os 9 GLBs do DDD que são ponteiros LFS (não lidos) e se os nós `terrain` dos templates do teste4 e do DDD chegam a aparecer em alguma fase.
