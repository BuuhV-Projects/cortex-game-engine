# PRD 0466 - Renderer nativo próprio no export (o `three` sai do caminho de render)

**Data:** 2026-10-24
**Status:** **EM ANDAMENTO** — decisão no ADR-0465; **R0 concluído** (2026-10-24, SPEC-0505); **R1.1 concluído** (SPEC-0495, desligado por padrão); próximo: R1.2–R1.5 em frentes paralelas. Frente B2 do PRD-0009.

Decisão do usuário (2026-10-24): cortar o `three` do render do export e ter um renderer
próprio em C++, "mesmo que seja uma tarefa complexa e demorada". Só no export; o Studio
continua 100% no `three`. Conjunto fixo de materiais + WGSL próprio para o especial, com os
efeitos TSL de cada jogo portados uma vez.

Anexos: `0466-anexos/godot-renderer-rd.md` (Godot 4.7.2, arquivo:linha),
`0466-anexos/levantamento-three-jogos.md` (o que cada jogo usa, com arquivo:linha) e
`0466-anexos/inventario-host-render.md` (o que o host já tem).

## Objetivo e pronto

**Objetivo:** o render do export custar **≤ 4 ms de CPU** no DDD 61 andando e dirigindo
(hoje ~11–12 ms), com imagem igual à do `three`. **O jogo-alvo é só o DDD 61**: teste4,
kart-racer e crash-racer ficaram fora do escopo por decisão do usuário (2026-10-24; ver
"Fora do escopo") e continuam exportando com o `three`, pela recusa por jogo.

**Pronto** quando, no DDD 61:

1. o censo do renderer dá **0 recusas** nos pontos medidos;
2. o A/B com autopiloto (walk e drive) atinge o critério do marco **em 1920×1080** (a única resolução de medição, decisão do usuário em 2026-10-24, SPEC-0515);
3. a paridade (`?parityFreeze` + galeria de materiais + captura por ponto, dia e noite) fica
   no nível do controle;
4. `?nativeRenderer=0` volta ao `three` (até o R5), e o Studio segue idêntico.

## Linha de base — medida no R0 (SPEC-0505), controle de todos os marcos

Engine `ea10181e` (main + instrumentos do R0, desligados), **host compilado na worktree**, DDD 61
`e2be01c`, **1920×1080** (SPEC-0515), RS1 + `DynamicLighting` + filtro de sombra compartilhado
ligados por padrão. A/A (o mesmo export nos dois braços, 1 réplica cada), autopiloto; média dos
dois braços. GPU = mediana do `gpu-work` por quadro.

| ponto | render | quadro med | p95 | p99 | % > 33 ms | GPU | draws |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Setor O (walk) | 11,55 | 22,7 | 30,6 | 39,3 | 3,8% | 0,86 | 166 |
| Centro (walk) | 11,95 | 22,9 | 36,0 | 40,2 | 8,6% | 0,92 | 162 |
| Comercial (walk) | 12,77 | 26,7 | 37,5 | 43,2 | 12,1% | 1,30 | 162 |
| Águas Claras (walk) | 14,01 | 28,3 | 42,5 | 55,0 | 23,3% | 1,00 | 166 |
| Helio (drive) | 9,92 | 20,2 | 28,2 | 42,8 | 1,7% | 0,80 | 171 |

Ruído do A/A (diferença entre braços idênticos): render 0,15–0,87 ms; p99 até 9,4 ms;
`% > 33 ms` até 6,5 pp (Comercial). Por isso o aceite usa 2 réplicas intercaladas. O render é
CPU no Hermes: a GPU fica em ~0,8–1,3 ms por quadro com o alvo de 3840×2160.

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

**Quando roda o A/B completo (decisão do usuário, 2026-10-24, para acelerar):** sub-etapa do
R1 (R1.1–R1.6) **não** tem A/B completo — entra desligada, então o fps dela só importa quando o
conjunto liga. O critério de sub-etapa é paridade (`?parityFreeze` + galeria), testes verdes e
uma **rodada de fumaça**: 1 ponto, 1 réplica, `--autopilot walk`, 1080p, `validate.sh` VÁLIDO e
nenhum erro no `error_log.txt`/log do renderer. O A/B completo roda só em dois momentos: o
**checkpoint depois do R1.2** (alerta cedo: o render tem de cair na proporção dos draws
cobertos) e o **aceite final do R1**. Marcos depois do R1 (R2, R4) fazem o A/B completo no aceite.

**A/B completo:** kit SPEC-0382, intercalado, 2 réplicas × 135 s,
`--autopilot walk` nos 4 pontos do DDD 61 + `--autopilot drive` (Helio), **em 1920×1080** (a única resolução de medição desde 2026-10-24, decisão do usuário, SPEC-0515: o host abre
a janela em 1080p por padrão e o kit não mede abaixo disso). GPU por `CORTEX_FRAME_TIMING`. Métricas: render `cpuAvg`, quadro
mediano, **p95, p99, % > 33 ms**, GPU `gpu-work`. Número maior que o teto do marco =
defeito do instrumento até prova em contrário (regra da SPEC-0435): conferir log
(`THREE.TSL`, erro do renderer) e imagem.

**Paridade de aceite:** `?parityFreeze` renderer × `three` nos 4 pontos, dia e noite
(`?hora=21`): `maxChannelDiff` e % de pixels acima do ruído **no nível dos pares de controle
N×N+2**, e no máximo 0,01% dos pixels acima do ruído; galeria de materiais com o mesmo
limiar.

### R0 — Instrumentos, censo e WGSL de referência (sem renderer) — **CONCLUÍDO** (2026-10-24, SPEC-0505)

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
- **Resultado:** censo 100% classificado; cobertura dos modelos fixos 85–89% nos 5 pontos; as recusas são só nós TSL do jogo (`colorNode` ~14/amostra: tintas do player e dos carros; `colorNode+normalNode+positionNode` 1–2,5: `peopleGpu`) — exatamente o que o R1.5 cobre. Galeria: A×A′ = 0, plantio acusado. Linha de base na tabela acima. Detalhes na SPEC-0505.

### R1 — O quadro 3D do DDD 61 no renderer próprio (o menor caminho com imagem igual)

É o menor caminho que tira o `three` do passe principal do DDD 61: o `three` não desenha
nenhum objeto 3D do jogo, e a UI de runtime continua nele (R2). Não dá para ser menor: o mapa
de sombra do sol só é atualizado de dentro do passe principal do `three` (`ShadowNode`), e a
multidão (`peopleGpu`) está no passe principal.

Etapas, cada uma mergeável desligada (`?nativeRenderer=1` liga o conjunto; `?nativeRendererModels=` isola
os modelos de cada etapa), com cobertura medida pelo censo. Critério de toda etapa, além da coluna: testes verdes + paridade + rodada de fumaça (regra acima). **Paralelização:** o R1.1 vem sozinho e fecha a interface central (servidor, RIDs, fachada, registro de material e pipeline, ponto de emissão); depois R1.2, R1.3, R1.4 e R1.5 correm em sessões paralelas, cada uma na sua worktree e nos seus arquivos; o R1.6 fecha junto com o aceite.

| etapa | o quê | critério da etapa |
| --- | --- | --- |
| R1.1 | servidor + RIDs + fachada `NativeRenderer` + geometria/textura próprias (criadas pelo shim WebGPU no JS, entregues por handle) + `pipeline_cache` + modelo **unlit** opaco (céu, sinais) + emissão no ponto do RS1 — desenho na SPEC-0495 | testes verdes; galeria unlit na paridade; fumaça com a cobertura relatada pelo censo; JS por instância limpa ≤ a oferta do RS1 (zero só na R1.6) |
| R1.2 | **lambert** e **standard** (com `specular`/`ior`), névoa, emissivo, tone mapping/espaço de cor; bloco de cena + buffer de luzes (dir + hemi + 8 spots) | galeria lambert/standard na paridade, dia e noite; **checkpoint: A/B completo** — o render cai ≥ draws cobertos × 40 µs (sanidade) |
| R1.3 | sombra: mapa único com `needsUpdate` no passe C++ + material de sombra compartilhado + amostragem **PCFSoft** (o filtro do DDD 61) no lambert, parâmetros só no bloco de vista (SPEC-0475) | paridade da sombra no chão (Setor O, fim de tarde); custo da sombra conferido no aceite final (alvo ≤ 0,3 ms de render, `?sombra=0` × ligada) |
| R1.4 | `InstancedMesh` (+ `instanceColor`/`instancePaint`), transparentes/aditivos ordenados pelo sort do `three`, `alphaTest`, `polygonOffset`, `renderOrder`, layers, partículas e marcas de pneu (buffer dinâmico) | paridade nos 4 pontos com coplanares (`interiores-*`) e transparentes; recusas do censo só em skinned/`peopleGpu`/tintas |
| R1.5 | skinning no vertex shader (player e dublês) + **API de WGSL do jogo** (`userData.nativeMaterial`, layout de parâmetros, atributos/`DataTexture` por instância) + porte de `peopleGpu`, tinta por slot e pintura mascarada (no repo do jogo, com spec própria); a API aceita vertex shader animado (o mar do DDD 61) | galeria com os 3 WGSL do jogo; **0 recusas** nos 4 pontos |
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

### ~~R3 — Cobertura dos outros jogos~~ — fora do escopo

**Removido por decisão do usuário (2026-10-24)**, depois de uma estimativa de 2–4 semanas só
para ele. Volta como **plano próprio** quando o usuário retomar teste4, kart-racer e
crash-racer. O levantamento desses jogos fica no anexo `levantamento-three-jogos.md` como
referência (toon, outline skinado, IBL/PMREM, skybox, CSM, água cartoon, wireframe, pós
radial, AgX, point lights, vertex color).

### R4 — Retirar o caminho do `three` do render do export **do DDD 61**

- No export do DDD 61, o `WebGPURenderer` e o sistema de nós de render do `three` deixam de
  ser usados e de ser carregados; o `three` fica como grafo de cena, matemática e loaders.
- Os outros jogos continuam exportando com o `three` (recusa por jogo). Por isso os contornos
  sobre internos do `three` (TransformOnlyRefresh, RenderIdRefresh, b.1, b.2 com receitas,
  RS1, `DynamicLighting`, `SharedShadowFilter`, a projeção que alimenta a RenderList)
  **continuam na engine e no bundle desses jogos** enquanto algum jogo usar o `three` no
  export.
- Pré-requisito: R1–R2 aceitos no DDD 61 e um ciclo de uso sem regressão.
- Critério: no export do DDD 61, bundle e heap menores (medidos) e boot mais rápido;
  `?nativeRenderer=0` deixa de existir para ele (a volta passa a ser o build anterior).
- Studio intocado.

### Evolução prevista do DDD 61 (fora dos marcos atuais)

O usuário (2026-10-24): "O DDD61 possivelmente terá o que o R3 quer corrigir, mas isso será
mais pra frente pois pretendo incluir um mar no jogo, carros com vidro transparentes". Nada
disto muda os marcos; cada item entra com SPEC antes, quando o jogo precisar.

- **Mar:** WGSL do jogo pela API do R1.5. Referência: a água cartoon do crash-racer
  (`CartoonWaterMaterial`, anexo `levantamento-three-jogos.md`). Consequência para o R1.5: a API
  de WGSL do jogo tem de aceitar **vertex shader animado** (ondas no VS, uniforme de tempo),
  não só o caso do `peopleGpu`.
- **Vidro dos carros:** transparente com alpha-blend já é coberto pelo R1.4. Refração real
  (`transmission`) continua recusada até nova decisão do usuário.
- **O que vinha do R3 e o DDD 61 venha a usar** (IBL/PMREM, CSM, etc.): etapa própria, com
  SPEC antes, quando o jogo precisar.

### R5 — Depois (só com medição que peça)

- **B5 (threads):** cull, lista e gravação de comandos num worker C++.
- **Luzes clustered** (tiles de 32 px, sem subgroup) se algum jogo passar de 8 luzes locais por objeto.
- **Skinning por compute** se o custo de GPU dos passes com skinning aparecer.
- Resolução interna < alvo + upscale (o modelo do Godot) se a GPU passar a ser o teto.

## Onde este plano substitui ou absorve o ADR-0404 e a SPEC-0435

| item anterior | destino |
| --- | --- |
| RS1 (receita, SPEC-0425) | continua ligado por padrão até o R1 ser aceito; sai do export do DDD 61 no R4 (fica para os jogos que exportam com o `three`) |
| **RS2** (`InstancedMesh` e materiais com nó) — suspenso | **absorvido**: `InstancedMesh` no R1.4; materiais com nó do DDD 61 viram modelo fixo ou WGSL do jogo (R1.5) |
| **RS3** (transparentes ordenados em C++) — suspenso | **absorvido** pelo R1.4 (sort do `three` em C++) |
| RS4 (sombra do `SunShadow` no passe nativo) — cancelado | volta como R1.3, por outro motivo: sem o `three` no passe, o mapa precisa de dono |
| SPEC-0435 (a) regravar receita no lote da b.1 | obsoleta quando o R1 assumir (a receita deixa de existir) |
| SPEC-0435 (c) menos estados / (d) bloco único de luzes | **absorvidos**: o buffer de luzes por vista é o (d); o número de estados deixa de ter custo por estado |
| ADR-0237 M5 / M7 / M8 | R1 (submissão própria) / paridade de aceite / `?nativeRenderer` |
| ADR-0237 M1–M4 (`MaterialDesc`, cache de pipeline, uniformes por objeto, RenderList) | base do R1 |

## Fora do escopo

- Renderer próprio no Studio (decisão do usuário).
- **teste4, kart-racer e crash-racer (o antigo R3): fora do escopo por decisão do usuário
  (2026-10-24)**; voltam como plano próprio quando ele retomar esses jogos. Até lá exportam
  com o `three`.
- JIT no host (proibido no Xbox).
- Recursos que nenhum jogo-alvo usa (espelho, CubeCamera, sprites, morph, `BatchedMesh`, decal).
- Clearcoat, sheen, transmission, iridescence: recusa até um jogo-alvo precisar e o usuário decidir.
  **Decidido pelo usuário em 2026-10-24: recusar por enquanto** (o objeto fica no `three`).
- **Início do R0: decidido pelo usuário em 2026-10-24 — só depois de o RenderingServer (ADR-0404) fechar** os itens restantes, para não disputar a máquina de medição.

## Pendências levadas ao PRD-0009

Registradas no "Backlog de pendências" do PRD-0009, com origem neste PRD.

## Backlog de pendências do R1

- **Vidro emissivo animado no `lambert`** (origem: R1.2, SPEC-0535, 2026-10-24). Estado:
  `lambert` + `emissiveMap` fica **recusado** (vai para o `three`); o Standard com `emissiveMap`
  passa. Sintoma: com o relógio do DDD 61 andando (rampa do anoitecer, ~17:37), o vidro das
  janelas do `plasterMat` (`lambert+emissiveMap+fog+map+vertexColors`) sai no renderer próprio
  com ~22% a menos do emissivo do `three`, e a diferença é aditiva e constante nos painéis
  (Setor O 1,48%, Comercial 3,9% dos pixels). Com hora fixa (`?hora=17.6&escala=0`, mesmo `ei`)
  dá PASS. Descartados, cada um medido no jogo: dados de sol, hemisfério e spots (iguais aos do
  `three`, lidos lado a lado); bloco de parâmetros (valor atual, escrito todo quadro); textura e
  sampler do `emissiveMap` (os mesmos objetos que o `three` usa, versão constante); nível de mip
  (`textureSampleLevel(…, 0)` não muda nada); receita velha (regravar ao mudar parâmetro não
  muda nada); a cópia de atributo do `three` (correção 04d07194 da Frente C já na branch);
  `doubleSide`; clima (`setWet` só mexe no asfalto). Hipótese em aberto: algo que acompanha a
  rampa e que o `three` aplica ao emissivo e o modelo não — por exemplo um estado do
  `NodeMaterialObserver` / do `renderGroup` que fica entre o degrau do `night` e o
  congelamento. Próximo passo: reproduzir na galeria com rampa de `emissiveIntensity`
  **depois** do primeiro quadro (a tentativa feita mudava antes do `precompile`) e capturar o
  WGSL e os uniformes reais do estado do `three` naquele objeto.
- **`standard` desligado na R1.2** (origem: R1.2, SPEC-0535, 2026-10-24). O modelo existe
  (`models/standard.ts`, testes), mas saiu de `NATIVE_MODELS`: no Comercial de dia, as fachadas
  de um prédio dão 1,17% de pixels fora da paridade (Setor O passa). Não foi investigado. **Volta
  antes do R1.6** (o aceite final exige 0 recusas). Próximo passo: o mesmo método do vidro
  (isolar o material da fachada, comparar dados e WGSL do estado do `three`).
- **Fios distantes no Comercial de dia** (origem: R1.2, 2026-10-24): 0,0132% dos pixels, acima
  do limite de 0,01%. Não é cobertura subpixel: num braço o fio some por inteiro (oclusão ou
  ordem), evidência em `native/scripts/perf/coverage-diff.mjs`. Hipótese: ordem do domo do céu
  nativo × malha fundida dos fios (matriz identidade, z na origem). `@invariant` na posição não
  muda.
