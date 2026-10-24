# PRD 0466 - Renderer nativo próprio no export (o `three` sai do caminho de render)

**Data:** 2026-10-24
**Status:** **PLANEJADO** — decisão no ADR-0465; nenhum marco iniciado. Frente B2 do PRD-0009.

Decisão do usuário (2026-10-24): cortar o `three` do render do export e ter um renderer
próprio em C++, "mesmo que seja uma tarefa complexa e demorada". Só no export; o Studio
continua 100% no `three`. Conjunto fixo de materiais + WGSL próprio para o especial, com os
efeitos TSL de cada jogo portados uma vez.

Anexos: `0466-anexos/godot-renderer-rd.md` (Godot 4.7.2, arquivo:linha),
`0466-anexos/levantamento-three-jogos.md` (o que cada jogo usa, com arquivo:linha) e
`0466-anexos/inventario-host-render.md` (o que o host já tem).

## Objetivo e pronto

**Objetivo:** o render do export custar **≤ 4 ms de CPU** no DDD 61 andando e dirigindo
(hoje ~11–12 ms), com imagem igual à do `three`, e o mesmo renderer servir teste4,
kart-racer e crash-racer.

**Pronto** quando, para cada jogo-alvo:

1. o censo do renderer dá **0 recusas** nos pontos medidos;
2. o A/B com autopiloto (walk e drive) atinge o critério do marco **em 1920×1080** (a única resolução de medição, decisão do usuário em 2026-10-24, SPEC-0515);
3. a paridade (`?parityFreeze` + galeria de materiais + captura por ponto, dia e noite) fica
   no nível do controle;
4. `?nativeRenderer=0` volta ao `three` (até o R5), e o Studio segue idêntico.

## Linha de base (main `20a5d6b3`, DDD 61 `e2be01c`)

Kit SPEC-0382, export release, RS1 + `DynamicLighting` + filtro de sombra compartilhado
ligados (SPEC-0445, 2 réplicas):

| ponto | render | quadro med | p95 | p99 | % > 33 ms |
| --- | --- | --- | --- | --- | --- |
| Comercial (walk) | 12,22 | 26,2 | 34,4 | 42,7 | 8,1% |
| Centro (walk) | 10,97 | 21,7 | 28,8 | 39,7 | 1,5% |
| Helio (drive) | 10,59 | 21,6 | 29,5 | 36,6 | 2,1% |

Full HD (SPEC-0455, walk, Comercial): render 12,3 ms (CPU igual ao 1280×720); GPU
**~0,9–1,3 ms/quadro** com o alvo de 3840×2160. O render é CPU no Hermes. O R0 refaz esta
tabela nos 4 pontos + drive, nas duas resoluções, como controle de todos os marcos.

## Levantamento: o que cada jogo usa do `three` hoje

Detalhe com contagens e arquivo:linha no anexo. "Fixo" = modelo do conjunto fixo (ADR-0465 §3).

### DDD 61 (`e2be01c`) — jogo-alvo do R1

| recurso | uso | no renderer próprio |
| --- | --- | --- |
| `MeshLambertMaterial` + `vertexColors` + `map` (atlas) + emissivo animado dia/noite | 27 + 63 menções de emissivo (`entities/city.ts:394,445`, `centro.ts:473`, `car.ts:61`) | fixo **lambert** |
| `MeshBasicMaterial` | 40 (céu `skyDome.ts:113-140`, sinais, luzes de veículo, chuva) | fixo **unlit** (vertexColors, aditivo, `renderOrder −1`) |
| GLBs | 245 arquivos / 515 materiais; 86 `KHR_materials_specular` (viram Physical); 14 `COLOR_0`; 0 normalMap | **standard** com `specular`/`ior` (sem rebaixar) |
| `peopleGpu` — NPCs montados no vertex shader a partir de `DataTexture` float32, 7×vec4 por instância, dobra de membros, paleta + atlas com `alphaTest` | `entities/people/peopleGpu.ts` (262 linhas), `peopleBatch.ts:58,101`, `crowdBatch.ts:41` | **WGSL do jogo** (vertex pulling + atributos de instância) |
| tinta por slot do player / pintura mascarada dos estacionados (`colorNode`) | `playerSkin.ts:178-186`, `parkedCars.ts:21-22` | **WGSL do jogo** pequeno (ou feature de máscara no lambert) |
| luzes | 1 dir (sombra) + 1 hemi + **8 SpotLight** (6 postes + 2 faróis), sempre na cena | buffer de luzes por vista; spot apagada sai do buffer sem trocar variante |
| sombra | própria: mapa único 2048², sob demanda (3 s / 0,4 da meia-largura), só o chão recebe (`entities/sunShadow.ts:18-38,116-158`) | passe de sombra C++ com **mapa único + `needsUpdate`**; amostragem PCF no lambert |
| névoa | `Fog` linear com cor/near/far por hora e chuva (`main.ts:495-497,1366-1370`) | bloco de cena |
| `InstancedMesh` | ~20 pontos (`sharedInstancedMesh.ts:39`), `instanceColor`, `instancePaint` | instancing com atributos extras |
| skinning | `SkinnedMesh` só no player e dublês (1–4), Mixamo ~22–30 ossos | skinning no vertex shader; animação continua em JS |
| transparência | 17 `transparent`, 3 `alphaTest`, 13 aditivos, 21 `depthWrite:false`, 12 `renderOrder`, 2 `polygonOffset` | blend/aditivo/alpha-test, sort do `three`, depth bias no pipeline |
| partículas / marcas de pneu | `ParticleEmitter` (`carDamage.ts:108`, `carWreck.ts:112`), marcas da engine | unlit instanciado aditivo; buffer dinâmico |
| texto em canvas 2D | 11 `Texture(canvas)` (`busSign.ts`, `metroBoards.ts:212`) | já existe no host (pixels em software) |
| `colorWrite:false` (malha só de colisão) | `city.ts:413`, `centro.ts:484` | não vai à fila |
| layers | `FIGURE_PART_LAYER` (`figure.ts:240`), `scene.onBeforeRender` do lote | máscara de camada por instância; o gancho de cena continua em JS |
| pós / RT / renders aninhados | nenhum (ACES do composite) | — |
| UI de runtime | `UiLayer` (16 menções), desenhada **pelo `three`** em RT (`RendererUiBackend.ts`) | WGSL de UI (R2) |

### teste4 (`99ee99a`)

Presets da engine: unlit+outline 381, unlit 79, toon 28, toon+outline 27. GLBs: 684 (63
normalMap, 198 `emissiveTexture`, 386 `ior`/388 `specular`, `KHR_texture_transform` em 41
usados). Contorno também **skinado** (player + trajes num esqueleto). Água simples com
cáustica = `emissiveMap` com offset animado. Skybox PNG equiretangular + **PMREM**
(`main.ts:403-432`). CSM 3 cascatas (aqua/space/underworld). PostFX: bloom, vinheta,
ACES, FXAA (o SSAA cobre). **2ª cena + 2ª câmera** no guarda-roupa (`WardrobeMenu.ts:213,757`).
No renderer: toon, outline (com skinning), standard com normal/emissive/UV transform, IBL,
skybox, vistas genéricas `render(scene, camera)`.

### kart-racer (`e5046ff`)

193/194 nós toon, 133 com outline, 129 `preserveGloss` (standard + IBL). HDRI → background +
PMREM. CSM 1 cascata 2048². Efeitos: chama aditiva com vertexColors, óleo standard
transparente com `polygonOffset`, **escudo `wireframe`**. 5 carros com `clearcoat` (recusa
até decisão). **Pós próprio**: borrão radial de 12 amostras num `RenderPipeline` do `three`
(`systems/SpeedEffectSystem.ts:22-48`). No renderer: toon, outline, standard+IBL, wireframe,
pós do jogo em WGSL encaixado no composite.

### crash-bandicoot-racer (`f560970`)

Tudo em dados: 1631 nós `model`, GLBs com 139 normalMap, 187 metal/rough, 186 emissivos,
**`COLOR_0` em 147 usados** (hoje saem brancos no export, gotcha do naga), KTX2 com LOD no
streaming, clearcoat em 9 e **transmission em 1** (`lira-kart.glb`). **Água cartoon** TSL em 3
nós. Até 3 + 10 `PointLight` sem sombra. CSM 3 cascatas. PostFX com **AgX** (o export hoje
aplica ACES: já diverge do Studio). No renderer: standard completo com vertex color, point
lights, água cartoon em WGSL, CSM, AgX no composite; clearcoat/transmission: recusa até
decisão do usuário.

### Consolidado: as 5 coisas mais difíceis

1. `peopleGpu` do DDD 61 (WGSL do jogo com vertex pulling) — **está no R1**, porque é a
   multidão do passe principal.
2. Água cartoon (ondas no VS, `mx_noise`, 16 ondulações, espuma, fresnel sobre PBR).
3. UI de runtime fora do `three` (retângulo arredondado por SDF, gradiente, borda, imagem
   com máscara, texto tingido) com paridade com o DOM do Studio.
4. IBL (PMREM) + skybox com paridade de PBR.
5. Pós e sombra com paridade: borrão do kart, AgX, mapa único do DDD 61 e CSM de 1–3 cascatas.

Não usados por nenhum dos 4: espelho, retrovisor, minimapa, `CubeCamera`, `Sprite`, `Points`,
`Line`, decal, Troika, morph, `BatchedMesh`, `Reflector`/`Sky`/`Water` dos exemplos. **Não
entram no plano** (YAGNI).

## O que já existe no host e vira base

| peça | onde | papel no renderer |
| --- | --- | --- |
| Espelho da cena (hierarquia, matriz de mundo em `double`, visível, flags, deltas de 12 doubles por nó sujo) | `src/core/NativeSceneMirror.ts:675`, `native/src/scene/scene_mirror.h` | grafo do renderer; falta a instância desenhável (mesh + material) |
| Projeção/cull do passe principal | `native/src/scene/main_pass_culler.cpp:24`, `src/render/NativeMainProjection.ts:219` | cull da vista |
| Passe de sombra depth-only (WGSL e pipelines próprios, variante instanciada, enumerador e gate fiéis ao `three`) | `native/src/render/shadow_pass.cpp:299`, `shadow_math.h`, `native/src/scene/shadow_caster_enumerator.*`, `shadow_pass_gate.*` | passe de sombra; falta o mapa único com `needsUpdate` e o material compartilhado |
| Lote de desenho puro (`RecipeStore` + `replay` com eliminação de estado redundante) | `native/src/render/draw_batch.cpp:78` | laço de emissão, alimentado por receitas próprias |
| Cache de pipeline genérico | `native/src/render/pipeline_cache.h:33-70` (sem consumidor) | cache de pipelines do renderer |
| `MaterialDesc` + `PipelineKey` (5 chaves para 242 materiais no kart) | `src/render/MaterialDesc.ts`, `src/render/PipelineKey.ts` (só telemetria) | ponto de partida do tradutor de material (cresce para lambert, physical-lite, normalMap, alphaTest) |
| Buffer de instâncias do host | `native/src/render/instance_buffer_store.h` | instâncias no passe principal |
| Registro de geometria | `native/src/render/geometry_registry.h` (vínculo com os buffers do `three`) | passa a ser **dono** dos buffers |
| `override` provado no naga/D3D12 | `native/src/webgpu/override_probe.cpp`, SPEC-0238 | features como constantes de pipeline |
| Bloom, ACES, vinheta, OETF, composição da UI em gama, SSAA | `native/shaders/bloom.wgsl`, `native/src/webgpu/supersample.cpp:428` | fim da cadeia, sem mudança |
| KTX2, canvas 2D, raster de texto | `native/src/shims/ktx2*`, `native/js/src/shims/canvas2d/`, `shims/text_raster.*` | fontes de textura |
| `?parityFreeze`, captura, comparador | `src/render/MainPassArm.ts`, `native/src/webgpu/render_parity_capture.h`, `native/scripts/render-parity.mjs` | igualdade de imagem |
| Spike do laço completo sem `three` (2,2 µs/draw, bind group com offset dinâmico) | `native/src/webgpu/render_bench.cpp` | referência de desenho do UBO por objeto |
| Kit de medição + autopiloto + Full HD | `native/scripts/perf/` (`round.sh`/`ab.sh --autopilot walk|drive --window 1920x1080`), SPEC-0382/0414/0455 | critério de cada marco |

## Plano em marcos

Regras para todos (ADR-0465): SPEC antes do código; interruptor próprio; **mergeável
desligado** (padrão só muda no aceite); recusa por objeto ao `three` durante a migração;
teste Vitest + `cortex_host_tests` + sonda de pixel por shader novo; arquivos pequenos e
SOLID no `native/` (ADR-0100); sem números mágicos; `docs/cortex-native/architecture.md`
atualizado na mesma mudança.

**A/B de aceite (todos os marcos):** kit SPEC-0382, intercalado, 2 réplicas × 135 s,
`--autopilot walk` nos 4 pontos do DDD 61 + `--autopilot drive` (Helio), **em 1920×1080** (a única resolução de medição desde 2026-10-24, decisão do usuário, SPEC-0515: o host abre
a janela em 1080p por padrão e o kit não mede abaixo disso). GPU por `CORTEX_FRAME_TIMING`. Métricas: render `cpuAvg`, quadro
mediano, **p95, p99, % > 33 ms**, GPU `gpu-work`. Número maior que o teto do marco =
defeito do instrumento até prova em contrário (regra da SPEC-0435): conferir log
(`THREE.TSL`, erro do renderer) e imagem.

**Paridade de aceite:** `?parityFreeze` renderer × `three` nos 4 pontos, dia e noite
(`?hora=21`): `maxChannelDiff` e % de pixels acima do ruído **no nível dos pares de controle
N×N+2**, e no máximo 0,01% dos pixels acima do ruído; galeria de materiais com o mesmo
limiar.

### R0 — Instrumentos, censo e WGSL de referência (sem renderer)

- **Censo** `?rendererCensus=1`: por material vivo, o modelo + features que o tradutor daria
  ou a recusa com motivo; por quadro, draws por classe; superfície do renderer chamada (inclui
  uso de `threeRenderer`); luzes, sombras, RTs. Saída no perf-trace.
- **WGSL de referência:** salvar o WGSL que o `three` 0.184 gera para cada estado de shader
  do DDD 61 (fonte da fórmula de cada modelo). Agrupar e comparar por **texto normalizado**
  (identificadores renomeados), nunca por hash: o hash do WGSL do `three` não é estável.
- **Galeria de materiais:** cena fixa com um objeto por (modelo, feature) dos 4 jogos.
- **Linha de base:** a tabela acima nos 4 pontos + drive, em 1920×1080.
- **Critério:** censo do DDD 61 classifica 100% dos materiais vivos (cada um num modelo ou
  numa recusa com motivo) nos 4 pontos; galeria capturada nos dois caminhos com o comparador
  acusando uma diferença plantada (o instrumento é validado num caso de resposta conhecida).
- Interruptor: o próprio `?rendererCensus` (desligado).

### R1 — O quadro 3D do DDD 61 no renderer próprio (o menor caminho com imagem igual)

É o menor caminho que tira o `three` do passe principal do DDD 61: o `three` não desenha
nenhum objeto 3D do jogo, e a UI de runtime continua nele (R2). Não dá para ser menor: o mapa
de sombra do sol só é atualizado de dentro do passe principal do `three` (`ShadowNode`), e a
multidão (`peopleGpu`) está no passe principal.

Etapas, cada uma mergeável desligada (`?nativeRenderer=1` liga o conjunto; cada etapa tem
o próprio interruptor para o A/B dela), com cobertura medida pelo censo:

| etapa | o quê | critério da etapa |
| --- | --- | --- |
| R1.1 | servidor + RIDs + fachada `NativeRenderer` + geometria/textura próprias (criadas pelo shim WebGPU no JS, entregues por handle) + `pipeline_cache` + modelo **unlit** opaco (céu, sinais) + emissão no ponto do RS1 — desenho na SPEC-0495 | testes verdes; galeria unlit na paridade; A/B walk sem regressão com a cobertura relatada; JS por instância limpa ≤ a oferta do RS1 (zero só na R1.6) |
| R1.2 | **lambert** e **standard** (com `specular`/`ior`), névoa, emissivo, tone mapping/espaço de cor; bloco de cena + buffer de luzes (dir + hemi + 8 spots) | galeria lambert/standard na paridade, dia e noite; A/B: render cai ≥ draws cobertos × 40 µs (sanidade) |
| R1.3 | sombra: mapa único com `needsUpdate` no passe C++ + material de sombra compartilhado + amostragem **PCFSoft** (o filtro do DDD 61) no lambert, parâmetros só no bloco de vista (SPEC-0475) | paridade da sombra no chão (Setor O, fim de tarde); `?sombra=0` × ligada custa ≤ 0,3 ms de render |
| R1.4 | `InstancedMesh` (+ `instanceColor`/`instancePaint`), transparentes/aditivos ordenados pelo sort do `three`, `alphaTest`, `polygonOffset`, `renderOrder`, layers, partículas e marcas de pneu (buffer dinâmico) | paridade nos 4 pontos com coplanares (`interiores-*`) e transparentes; recusas do censo só em skinned/`peopleGpu`/tintas |
| R1.5 | skinning no vertex shader (player e dublês) + **API de WGSL do jogo** (`userData.nativeMaterial`, layout de parâmetros, atributos/`DataTexture` por instância) + porte de `peopleGpu`, tinta por slot e pintura mascarada (no repo do jogo, com spec própria) | galeria com os 3 WGSL do jogo; **0 recusas** nos 4 pontos |
| R1.6 | o renderer próprio vira **dono da pass** (limpa, fundo, cena; o `three` não é chamado para a cena espelhada); pré-compilação no load + ubershader para variante nova | 0 pipelines criados por quadro em regime; nenhum quadro > 50 ms causado por pipeline na 1ª volta |

**Critério de aceite do R1** (liga `?nativeRenderer=1` por padrão no DDD 61):

- render **≤ 5 ms** (`cpuAvg`) andando nos 4 pontos e dirigindo (hoje 10,6–12,2);
- p95 do quadro **−5 ms ou mais** no Comercial e no drive; **% > 33 ms ≤ 2%** andando;
- GPU (1920×1080) ≤ controle + 0,5 ms;
- paridade de aceite (acima) dia e noite; 0 recusas no censo.

Teto esperado: ~2–4 ms (ADR-0465, Contexto). Abaixo de 5 ms, o critério já paga o marco.

### R2 — UI de runtime e alvos no renderer próprio: o `three` não é criado no export do DDD 61

- WGSL de UI (retângulo arredondado por SDF + gradiente + borda, imagem com máscara, texto
  tingido do raster do host) atrás do `RendererUiBackend`; `renderUiLayer` e `renderSceneHDR`
  na fachada; vistas genéricas `render(scene, camera)`.
- Critério: o `WebGPURenderer` não é instanciado no export do DDD 61 (contador); tempo de
  carga até o 1º quadro jogável e heap JS caem (medir contra o R1; hoje o `precompile` do
  DDD 61 faz 2.813 lookups em 39,7 s); a UI na paridade contra a UI do `three`
  (`?parityTarget=ui`); `ui` do perf-trace não piora.
- Interruptor: `?nativeUi=0|1`.

### R3 — Cobertura dos outros jogos (um sub-marco por jogo; cada um liga o renderer naquele jogo)

| sub-marco | entra no renderer | critério |
| --- | --- | --- |
| R3a teste4 | toon, outline (com skinning; várias malhas num esqueleto), standard com normalMap/emissiveMap/UV transform, **IBL** (PMREM gerado no C++ com o algoritmo do `three`) + skybox equiretangular, CSM 3 cascatas (amostragem), 2ª cena + câmera | 0 recusas nas fases de cada mundo; paridade na galeria + 1 ponto por mundo; render do export −50% ou mais com autopiloto `walk` |
| R3b kart-racer | toon/outline/standard+IBL, wireframe, pós do jogo (borrão radial) em WGSL no composite | 0 recusas (clearcoat: decisão do usuário ou recusa); volta de bench com IA: render −50% ou mais, p95/% > 33 ms melhores |
| R3c crash-racer | standard completo com **vertex color** (corrige o branco de hoje), point lights, **água cartoon** em WGSL, CSM 3 cascatas, **AgX** no composite, KTX2 com LOD | 0 recusas (transmission/clearcoat: decisão do usuário); paridade inclusive da água; render −50% ou mais |

### R4 — Retirar o caminho do `three` do render do export

- O bundle do export deixa de levar `WebGPURenderer`, o sistema de nós de render e os
  contornos sobre internos do `three` (TransformOnlyRefresh, RenderIdRefresh, b.1, b.2 com
  receitas, RS1, `DynamicLighting`, `SharedShadowFilter`, a projeção que alimenta a
  RenderList). O `three` fica como grafo de cena, matemática e loaders.
- Pré-requisito: R1–R3 aceitos nos jogos-alvo e um ciclo de uso sem regressão.
- Critério: bundle e heap menores (medidos), boot mais rápido, todos os jogos-alvo exportam
  e rodam; `?nativeRenderer=0` deixa de existir (a volta passa a ser o build anterior).
- Studio intocado.

### R5 — Depois (só com medição que peça)

- **B5 (threads):** cull, lista e gravação de comandos num worker C++.
- **Luzes clustered** (tiles de 32 px, sem subgroup) se algum jogo passar de 8 luzes locais por objeto.
- **Skinning por compute** se o custo de GPU dos passes com skinning aparecer.
- Resolução interna < alvo + upscale (o modelo do Godot) se a GPU passar a ser o teto.

## Onde este plano substitui ou absorve o ADR-0404 e a SPEC-0435

| item anterior | destino |
| --- | --- |
| RS1 (receita, SPEC-0425) | continua ligado por padrão até o R1 ser aceito; sai do export no R4 |
| **RS2** (`InstancedMesh` e materiais com nó) — suspenso | **absorvido**: `InstancedMesh` no R1.4; materiais com nó viram modelo fixo ou WGSL do jogo (R1.5, R3) |
| **RS3** (transparentes ordenados em C++) — suspenso | **absorvido** pelo R1.4 (sort do `three` em C++) |
| RS4 (sombra do `SunShadow` no passe nativo) — cancelado | volta como R1.3, por outro motivo: sem o `three` no passe, o mapa precisa de dono |
| SPEC-0435 (a) regravar receita no lote da b.1 | obsoleta quando o R1 assumir (a receita deixa de existir) |
| SPEC-0435 (c) menos estados / (d) bloco único de luzes | **absorvidos**: o buffer de luzes por vista é o (d); o número de estados deixa de ter custo por estado |
| ADR-0237 M5 / M7 / M8 | R1 (submissão própria) / paridade de aceite / `?nativeRenderer` |
| ADR-0237 M1–M4 (`MaterialDesc`, cache de pipeline, uniformes por objeto, RenderList) | base do R1 |

## Fora do escopo

- Renderer próprio no Studio (decisão do usuário).
- JIT no host (proibido no Xbox).
- Recursos que nenhum jogo-alvo usa (espelho, CubeCamera, sprites, morph, `BatchedMesh`, decal).
- Clearcoat, sheen, transmission, iridescence: recusa até um jogo-alvo precisar e o usuário decidir.
  **Decidido pelo usuário em 2026-10-24: recusar por enquanto** (vale para R3b/R3c: recusa conta como aceita para esses materiais).
- **Início do R0: decidido pelo usuário em 2026-10-24 — só depois de o RenderingServer (ADR-0404) fechar** os itens restantes, para não disputar a máquina de medição.

## Pendências levadas ao PRD-0009

Registradas no "Backlog de pendências" do PRD-0009, com origem neste PRD.
