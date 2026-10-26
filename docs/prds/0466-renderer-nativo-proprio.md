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

> **Jogo-alvo trocado para `5bbf6a3` (2026-10-26, aceite com direção real).** Conserto das faixas do `cull()`
> (SPEC-0196/0197 do jogo, `?cullRanges=legacy` volta ao antigo), renderer próprio **por padrão** (`nativeRenderer: true`,
> SPEC-0198 do jogo; `?nativeRenderer=0` volta ao `three`) e piloto que dirige na cidade (SPEC-0199), engine `3b3c51f4`
> no vendor. Cópia: `D:/jogos/detetive-brasilia-rs-5bbf6a3` (padrão do `check-stage.sh`); as anteriores ficam.
>
> **Jogo-alvo trocado para `290fcb5` (2026-10-25, aceite do R1).** Frente D: lotes de bonecos com uma varredura por
> quadro (SPEC-0195 do jogo; `onBeforeRender` −0,9 a −1,0 ms nos dois braços). Cópia: `D:/jogos/detetive-brasilia-rs-290fcb5`
> (padrão do `check-stage.sh`); as anteriores ficam por enquanto.
>
> **Jogo-alvo trocado para `f10877e` (2026-10-25).** A Frente D (multidão + tintas no renderer próprio, SPEC-0194
> do jogo, engine revendorizada de `1b69154e`) entrou na main do jogo. Cópia de medição:
> `D:/jogos/detetive-brasilia-rs-f10877e` (padrão do `check-stage.sh`). O aceite final do R1 mede na cópia nova; a
> `rs-e1cede4` e a `rs-e2be01c` ficam por enquanto (backlog do PRD-0009).
>
> **Jogo-alvo trocado para `e1cede4` (2026-10-24).** O usuário viu o jogador atravessar o ônibus nas
> rodadas: a correção (SPEC-0193 do jogo) está em `e1cede4`, que só soma isso e a música da carga
> (SPEC-0192) a `e2be01c`. Cópia de medição: `D:/jogos/detetive-brasilia-rs-e1cede4` (padrão do
> `check-stage.sh`). **A tabela abaixo (`e2be01c`) não vale mais como número absoluto**: o aceite final
> mede o braço `three` na cópia nova, no mesmo par intercalado. Um A/B só vale dentro do mesmo commit do
> jogo — nunca misturar braços de cópias diferentes.

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
| R1.6 | o renderer próprio vira **dono da pass** (limpa, fundo, cena; o `three` não é chamado para a cena espelhada); pré-compilação no load + ubershader para variante nova | 0 pipelines criados por quadro em regime; nenhum quadro > 50 ms causado por pipeline na 1ª volta — desenho e diagnóstico na **SPEC-0585** (frentes P1 pré-compilação ∥ P2 dono da pass → P3 buffer único) |

**R1.6 — item: dados por objeto num buffer único (modelo Godot)** (decisão do usuário, 2026-10-24,
"Sim"). Processo de sempre: Godot primeiro → aplicabilidade → SPEC → medir antes; **só fica se ganhar**.

- **Hoje (grupo 3):** um slot de 256 B por objeto em chunks `native.objects` e **um bind group por
  objeto**, trocado a cada draw no replay C++.
- **Godot (Forward+):** um storage buffer com os dados de todas as instâncias da lista
  (`SceneState::InstanceData`, `render_forward_clustered.h:334-345`), preenchido de uma vez
  (`_fill_instance_data`, `render_forward_clustered.cpp:806-911`) e ligado uma vez por passe; o shader lê
  `instances.data[índice]` com o índice do draw (`scene_forward_clustered.glsl:770-775`). Citações no anexo
  `godot-renderer-rd.md` §5.
- **Equivalente em WebGPU:** um `read-only-storage` com todos os objetos, ligado uma vez; o índice vem do
  `firstInstance` → `@builtin(instance_index)` (somar o offset, sem quebrar o instancing do R1.4); uma
  gravação por quadro para todos os objetos sujos.
- **Ganho esperado (não medido):** menos `setBindGroup` por draw no replay, menos `writeBuffer`, caminho
  para multi-draw.
- **Validar antes:** o comando do lote C++ (`DrawCommand` de 4 inteiros) não leva `firstInstance` hoje —
  a SPEC diz como o índice chega ao draw (campo novo no comando ou base por receita).
- **Critério:** A/B intercalado (2 réplicas, 4 pontos walk + drive, 1080p) mostra ganho de render ou de
  GPU; sem ganho, não entra.

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

### R4 — Retirar o caminho do `three` do render do export **do DDD 61** (depois do R6, se o R6 for aprovado)

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

### R6 — O renderer próprio também no Studio (**recomendado antes do R4**; decisão do usuário pendente)

Pergunta do usuário (2026-10-25): dá para tirar o `three` de vez, até do Studio? Este marco cobre a parte de **renderer**; o `three` como biblioteca (grafo de cena, matemática, loaders, animação) fica fora, ver abaixo. Mudaria a decisão original do ADR-0465 ("só no export; o Studio fica no `three`"), então exige novo ADR e aprovação.

- **Viabilidade:** o `NativeRenderer.ts` e os modelos de material (WGSL) já são TypeScript/WGSL sobre a API WebGPU, e o Studio roda num Chromium com WebGPU. Só o laço de desenho em lote, o cull e a projeção são C++ (host). No Studio, essa parte teria uma versão em JavaScript (com JIT, aguenta).
- **Custo:** o Studio usa o `three` para o editor: gizmos de mover e rotacionar, contorno de seleção, clique em objetos (raycast), grade e linhas de ajuda, camadas de UI. Cada um precisa de equivalente no renderer próprio. Estimativa: **2 a 4 semanas**, depois do R4, só para o DDD 61.
- **Ganho:** o que o Studio mostra passa a ser o que o export mostra (hoje são dois caminhos que divergem, e a paridade já custou vários bugs: `RenderIdRefresh`, `_materialCache`, recusas), e o renderer próprio passa a ser testado no dia a dia, sem export.
- **Fora:** tirar o `three` como biblioteca (`Object3D`, `Matrix4`, `Raycaster`, `GLTFLoader`, `AnimationMixer`, `SkinnedMesh`) por inteiro é reescrever a base da engine e dos jogos: meses, e ganho de fps pequeno (o `three` já não é o gargalo). Só se aparecer outro motivo (por exemplo, tamanho do bundle ou memória no Xbox). Sem data.
- **Ordem recomendada (2026-10-25, a pedido do usuário):** R1 fechado e o renderer próprio ligado por padrão no export → R2 → **R6** → R4. Motivo: enquanto o Studio usa o `three`, existem dois caminhos de render e o trabalho de performance no `three` é descartável (ex.: a investigação do travamento com carro só vale corrigir se a causa também afetar o renderer próprio ou o jogo). A partir do R6 há um caminho só. Por isso, trabalho de otimização exclusivo do caminho do `three` fica **fora** do plano; só entra correção de bug que afete o renderer próprio, o jogo ou a correção do `RenderIdRefresh`.
- **Pré-requisitos:** R1 aceito, R2 concluído, e um ADR com a decisão (muda o combinado "só no export" do ADR-0465).

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

## Aceite final do R1 — medido (2026-10-25)

Engine `2166618b` (main `7c5175c4` + cópia nova), DDD 61 `290fcb5` (`D:/jogos/detetive-brasilia-rs-290fcb5`), mesmo
export nos dois braços, A/B intercalado, 2 réplicas × 135 s, 1080p, `walk` nos 4 pontos + `drive` no Helio;
A = `three`, B = `&nativeRenderer=1&nativeRendererModels=unlit,lambert,standard,wgsl&nativePrecompile=1`. 20/20 rodadas
VÁLIDAS. Rodadas em `D:/jogos/detetive-brasilia/.cortex/stages/r1-accept/`.

| ponto | render A → B (meta ≤ 5) | falta | quadro med A → B | p95 A → B | p99 A → B | > 33 ms A → B (meta ≤ 2%) | GPU A → B (meta ≤ +0,5) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Setor O | 10,55 → **7,91** | 2,91 | 21,85 → 20,25 | 31,40 → 31,65 | 47,55 → 37,35 | 2,95 → **4,23** | 1,01 → 1,04 |
| Centro | 10,30 → **7,69** | 2,69 | 20,55 → 17,80 | 34,30 → 24,60 | 44,35 → **30,50** | 3,04 → 0,36 | 1,04 → 1,01 |
| Comercial | 11,66 → **8,01** | 3,01 | 25,75 → 20,90 | 40,05 → 31,30 | 46,35 → 36,65 | 15,18 → **2,51** | 1,30 → 1,19 |
| AC | 12,69 → **8,38** | 3,38 | 26,55 → 21,25 | 41,60 → 33,55 | 56,40 → 44,75 | 16,89 → **7,69** | 1,22 → 1,13 |
| Helio (drive) | 9,91 → **7,14** | 2,14 | 20,70 → 17,95 | 30,80 → 29,20 | 35,20 → 38,55 | 3,04 → 1,80 | 0,65 → 0,67 |

- **Render:** cai 2,6–4,3 ms em todos os pontos, mas **não fecha ≤ 5 ms** em nenhum (faltam 2,1–3,4 ms).
- **> 33 ms:** fecha no Centro e no Helio; Comercial no limite (2,51%); **Setor O piora** (2,95 → 4,23%) e **AC fica em 7,69%**.
- **GPU:** dentro da meta em todos (de −0,11 a +0,03 ms).
- **GC jovem:** de 30–40 para 8,5–9,7 ms/s em todos os pontos.
- **Pipelines nascidos em jogo:** 0 em todas as rodadas B (todos no quadro 1, inclusive o `playerTint` skinned).
- **Paridade** (`r1-accept-parity`, 4 pontos dia e noite + galeria): PASS 0/0 em tudo; tint FAIL (galeria 65,8%, Setor O dia 89% / noite 54%).
- **Recusas:** 0 no Setor O, Comercial, AC e Helio; **Centro: 1 (`variant:standard`)**, ainda sem nome.
- **p99 do Centro** (o +11,85 do checkpoint pós-R1.2, SPEC-0535): agora **cai** 13,85 ms (44,35 → 30,50). Era ruído.

**Veredito:** não aprovado. Faltam o render ≤ 5 ms (todos os pontos), o > 33 ms no Setor O e no AC, e a recusa do
Centro. O resto fecha.

## O que falta para fechar o R1 (registrado em 2026-10-25, a pedido do usuário)

O aceite acima ficou **parcial**, e um teste real do usuário no export (`C:\Users\buuhb\Documents\builded-ddd-61`, engine pós-R1.6, renderer próprio **desligado**, ou seja, caminho do `three`) expôs um ponto cego. Fica registrado aqui, em ordem de execução. **Decisão do usuário (2026-10-25): o renderer próprio liga por padrão no export do DDD 61 agora**, sem esperar os itens 4–5 ("ele já se provou, mesmo que não tenha atingido o < 5 ms, é melhor que o JIT do studio"): render 7,1–8,4 ms contra 10,3–12,7 no `three`, imagem 0/0, zero recusas, zero shaders em jogo, GPU neutra e, dirigindo, zero picos no nativo contra centenas no `three`. O Studio e os outros jogos continuam no `three`.

**Evidência do teste do usuário** (`perf-trace.jsonl`, 115 s, 1080p): a pé (~3 m/s, 5–40 s) 21,8 ms/quadro e **0** picos; com o carro (~15 m/s) 40,7 ms e **20 de 69** amostras com quadros de 100 ms, cada uma com 13–40 mil `writeBuffer` de uma vez (normal: ~100; `nodesTotal` 8789); depois, 44,2 ms e 12/75 picos; lixo de memória por quadro 0,86 → 1,67 → 2,17 MB. Relato: bom no início, travou muito ao pegar o carro da missão de motorista de app e seguiu travando depois de sair dele. Os picos sobem com a velocidade da câmera (0% parado ou andando devagar, 21% acima de 9 m/s). Não há evento de entrada/saída do carro no trace, então a fase "depois de sair" não está provada.

1. **Investigar o travamento com direção rápida, no `three` e no renderer próprio.** **Causa confirmada (SPEC-0597, Frente C, 2026-10-25):** o `cull()` do `breakableProps.ts` do jogo acumula uma faixa de `updateRange` por instância a cada relayout, e o three sobe 1 `writeBuffer` por faixa quando a malha volta à vista (picos de 6–14 mil escritas). Não é o `RenderIdRefresh` (sem ele, 137 picos). No renderer próprio, 0 picos, mas as faixas crescem para sempre (memória). Conserto no jogo pela Frente D. Texto original: Hipóteses (nenhuma provada): (a) objetos entrando na vista em velocidade disparam refresh completo no `RenderIdRefresh` (correção `ecaf612f`, que faz refresh completo de objeto que pulou quadros); (b) algo da missão de motorista de app no jogo; (c) acúmulo (lixo por quadro subindo). Teste de decisão: direção rápida real, com `?renderIdRefresh=0` × padrão, em três braços (`three`, nativo, nativo sem o refresh). Atribuir os `writeBuffer` por buffer/rótulo. Corrigir na raiz; se for do `RenderIdRefresh`, vale também para o Studio.
2. **Autopiloto `drive` que dirija de verdade** (SPEC-0414). O atual tem velocidade mediana de 1,7 m/s e só 4% das amostras acima de 9 m/s (sessão real: 44%); o aceite não cobriu direção. Critério do instrumento: ≥ 40% das amostras acima de 9 m/s, rota com cruzamentos e curvas, validado num caso de resposta conhecida (a rodada do usuário reproduz o padrão). Liga ao item "perfil `drive` sem desvio" do PRD-0009.
3. **Verificação depois de ligar (não é mais condição):** repetir o aceite do R1 com direção real, com picos de `writeBuffer` e `> 33 ms` como métricas, em três braços no mesmo export (`three` com `?cullRanges=legacy`, `three` com o conserto, nativo; script `r1-accept2.sh`, kit com braço C, SPEC-0382 adendo).
4. **Backlog pós-ligar — travadas `> 33 ms`:** Setor O piorou (2,95 → 4,23%) e AC fica em 7,69% (meta ≤ 2%).
5. **Backlog pós-ligar — recusa do Centro** (`variant:standard`, 1 por amostra, ainda sem nome; cai no `three` por objeto).
6. **Render ≤ 5 ms** (faltam 2,1–3,4 ms): **R2** (UI de runtime fora do `three`, ~5,5 ms no painel do usuário, mais o renderer dono da pass, ~1,3–1,6 ms de `finishRender` e pós) e, só se ainda faltar, o plano B (lista de instâncias em C++, SPEC-0585, 3–5 dias, ADR e decisão do usuário). O `world` (simulação, até ~9,8 ms no painel) entra no radar depois.
7. **AGORA — ligar o renderer próprio (`nativeRenderer` + `nativePrecompile`) por padrão no export do DDD 61** (ADR-0605, SPEC-0606): opção `nativeRenderer: true` do `Game`, só no host nativo; `?nativeRenderer=0` volta ao `three` até o R4. **Depende** do conserto do `cull()` (item 1) na main do jogo: com o nativo ligado, as faixas dos `quebravel-*` crescem sem limpar.
8. **Teste do usuário com o renderer próprio ligado** no export dele, sem alterar a pasta: `CORTEX_LAUNCH_QUERY='?nativeRenderer=1&nativeRendererModels=unlit,lambert,standard,wgsl&nativePrecompile=1'` + `launcher.exe` (se o launcher de um export fora da pasta de medição aceitar a variável; a confirmar). Se travar igual, o problema é anterior ao renderer próprio; se não travar, o renderer próprio resolve.

## Aceite com direção real — medido (2026-10-26, item 3 do "O que falta", verificação depois de ligar)

Engine `35cddd8f` (main `3b3c51f4`), DDD 61 `5bbf6a3` (`rs-5bbf6a3`: conserto do `cull()`, nativo por padrão, piloto
`drive`), **um export**, três braços intercalados (`ab.sh` com braço C): **A** = `three` + `cull()` antigo
(`&nativeRenderer=0&cullRanges=legacy`), **B** = `three` com o conserto (`&nativeRenderer=0`), **C** = nativo
(`&nativeRenderer=1…&nativePrecompile=1`). 1080p, 135 s. Rodadas em `.cortex/stages/r1-accept3/`.

**Rodadas repetidas e por quê:** o `perf` do `tools/validate.sh` do jogo rodava com lock próprio, junto das medições
(janelas informadas: 05:58–08:06). O `walk` inteiro da 1ª passada (05:30–08:40) foi descartado
(`walk-contaminada/`): havia carga também fora das janelas (`world` de 6–10 ms contra ~3 ms). O `walk` foi refeito
(10:27–12:00), e 6 rodadas com `world` > 4,0 ms ficaram de fora como suspeitas (`centro-B-r1/r3`, `comercial-A-r3`,
`comercial-B-r3`, `comercial-C-r2`, `ac-B-r3`). A direção (08:40–10:00) e as réplicas extras r4–r5 ficaram com `world` de 3,0–3,5 ms.

**Dirigindo, Centro** (`&drive=1&hora=18`; válidas: A 3, B 3, C 2 de 5):

| | A | B | C |
| --- | --- | --- | --- |
| render | 13,33 | 9,58 | **7,55** |
| quadro med / p95 / p99 | 23,2 / 98,3 / 100 | 21,0 / 29,2 / 33,4 | **20,2 / 29,7 / 34,3** |
| > 33 ms | 23,1% | 1,58% | **1,83%** |
| `writeBuffer`/amostra máx | 18–20 mil | ≤ 173 | ≤ 114 |

**Censo dirigindo no Centro** (rodada à parte): A tem 133 quadros-pico, maior 28 mil escritas, e faixas pendentes até
3484 (`quebravel-compartilhado-*.instanceMatrix`). B tem 1 pico e ≤ 2 faixas; C tem 1 pico e ≤ 3 faixas.
**AC e Setor O dirigindo:** reprovados pelas regras do kit (SPEC-0595), sem número.
- AC, braço A: não chega à velocidade (o próprio travamento segura o carro).
- AC, braços B e C: densidade < 133 draws em 9 de 10 rodadas; só B-r1 e C-r5 valem.
- Setor O: trânsito à vista < 50%.

**A pé, 4 pontos, só rodadas limpas** (render; > 33 ms):

| ponto | A | B | C |
| --- | --- | --- | --- |
| Setor O (3/3/3) | 10,54; 6,9% | 10,47; 3,4% | **7,78; 1,8%** |
| Centro (3/1/3) | 10,77; 4,4% | 10,14; 1,5% | **8,11; 0,5%** |
| Comercial (2/2/1) | 11,73; 14,5% | 10,66; 8,5% | **7,41; 0,7%** |
| AC (3/2/3) | 12,45; 18,0% | 11,42; 17,4% | **7,77; 2,6%** |

- **Travamento com carro:** some em B e C (Centro: 23% → 1,6–1,8% acima de 33 ms; p95 de 98 para 29–30 ms).
- **Nativo (C):** render 7,4–8,1 ms a pé e 7,55 dirigindo, 2,7–4,7 ms abaixo do `three` com o conserto;
  > 33 ms ≤ 2,6% em todos os pontos a pé (meta ≤ 2%: AC 2,6% no limite).
- **GPU:** 0,9–1,2 ms nos três braços (neutra). Pipelines nascidos em jogo: 0 em todas as rodadas C.
- **Paridade** dia e noite nos 4 pontos: PASS. Tint: FAIL.
- **Recusas:** 0, exceto **Centro = 1** (`variant:standard`, a mesma de antes; os commits do `instanceColor` da Frente A,
  `a3beafdd`/`3bfac7e7`/`29f4397f`, ainda não estão nesta medição).
- **Backlog do kit:** a regra de densidade do `drive` (≥ 133 draws) reprova o AC nos três braços, e o Setor O
  quase não tem trânsito à vista. Revisar os limites por ponto (Frente A, SPEC-0595).
- **Depois, com o `instanceColor` nos iluminados (Frente A, merge `79a3a65c`):** `check-stage ic-int` **sem nenhuma flag
  de renderer** (o jogo liga por padrão), 4 pontos dia e noite + galeria: PASS 0/0; fumaça PASS (render 6,36 ms, > 33 ms
  1%). **Recusas: 0 em todos os pontos, inclusive no Centro** (o `variant:standard` sumiu). Censo dirigindo no Centro
  (`&drive=1&hora=18&rendererCensus=1`, `lit-refusals.sh`): 20 amostras, nenhum material recusado, nenhuma recusa na
  criação. Tint: Setor O FAIL (89% / 54%).

## Estado para retomada (pausa de 2026-10-24, limite semanal)

- **Branch integrada:** `claude/renderer-nativo-45b16a` (worktree `renderer-nativo-45b16a`), A + B + C integradas
  (merges `8c528adc`, `86ccefb4`, `fd65ba1f`), `lambert` instanciado religado; último commit no fim desta pausa
  (ver `git log`). Sem merge na main (merge é da sessão principal).
- **Jogo-alvo:** DDD 61 `5bbf6a3` desde 2026-10-26 (renderer próprio por padrão), cópia `D:/jogos/detetive-brasilia-rs-5bbf6a3` (padrão do `check-stage.sh`); antes `290fcb5`, `f10877e` e `e1cede4`.
  A antiga `rs-e2be01c` só serve para apagar (backlog do PRD-0009).
- **1º passo da retomada:** refazer a checagem integrada NA CÓPIA NOVA:
  `native/scripts/check-stage.sh <wt> r1-int-e1 --flag '&nativeRenderer=1&nativeRendererModels=unlit,lambert,wgsl'`
  e o mesmo com `&nativeTint=1` (tem de dar FAIL). Na cópia antiga (`r1-int-abc`) deu **FAIL no Setor O de dia,
  0,0255%** (limite 0,01%); Comercial dia 0,0092%; o resto PASS. Tint de controle (`r1-int-abc-tint`): FAIL em
  tudo, como deve (pixels do caminho nativo: galeria 4,8%, Setor O dia 44% / noite 29%, Comercial 12% / 18%).
  **FEITO (2026-10-24, `88bf3d45` = integrada + merge de `30a21e64`):** `r1-int-e1` deu PASS 0/0 em tudo
  (galeria, Setor O e Comercial dia/noite; o FAIL de 0,0255% sumiu com a correção do mapa do sol); fumaça PASS,
  render 10,19 ms, > 33 ms 2%. Controle `r1-int-e1-tint`: FAIL em tudo (caminho nativo cobre 52–81% dos pixels do jogo).
  **Depois, com a Frente C (`5799e3cb` = merge de `ecaf612f` + `7e83a021` sobre a main `eb25eaad`):** `r1-int-c2`
  PASS 0/0 em tudo, fumaça render 10,63 ms; tint `r1-int-c2-tint` FAIL em tudo (52–86% dos pixels).
- **Recusas que bloqueiam o aceite (0 recusas) e dono** (recontadas no `r1-int-c2`):
  - ~~`standard` fora de `NATIVE_MODELS`~~ — **resolvido** (Frente A, SPEC-0535 adendo, `dce009ad` + `d7dde846`): emissivo pela Frente C e lascas coplanares por `@invariant` na posição; `std-inv-final` tudo PASS 0,0000%;
  **Com a Frente A (`57abf1ef`, `unlit,lambert,standard,wgsl`):** `r1-int-a2` PASS em tudo (pior: Setor O dia 0,0002%),
  fumaça render 10,17 ms; tint FAIL em tudo (52–85%). Recusas da engine que sobram no jogo: `variant:lambert` = 4 e
  `variant:standard` = 1–4 (mesmo grupo de motivos do `litVariant`); na galeria, `model:toon`/`model:outline` = 2 (fora do DDD 61).
  **Com o alpha da Frente A (`f0831b6f`):** `r1-int-a3` PASS em tudo (pior: Comercial dia 0,0002%), fumaça render
  9,69 ms, > 33 ms 3%; tint FAIL em tudo (52–87%); `lit-refusals.sh` na fumaça: 18 amostras, nenhuma recusa na criação.
  **Recusas da engine no DDD 61: zero.** Sobram só as do jogo (Frente D) e o `skip` da colisão.
  - ~~`variant:lambert` = 4 e `variant:standard` = 1–4~~ — **resolvido** (Frente A, `0cec302e` + `f0831b6f`): `feature:alpha` na criação
    (transparente no quadro da tomada, opaco depois, recusa em cache). Antes era resíduo NÃO identificado (`BackSide`, alpha to coverage,
    luzes fora do bloco ou feature fora da lista) — falta um dump por objeto para nomear; sem dono;
  - ~~`receiveShadow` no `lambert`~~ — resolvido pela Frente B (SPEC-0545, `30a21e64`);
  - tintas TSL do jogo (`node:colorNode`) e `peopleGpu` — Frente D (repo do jogo, `registerNativeMaterial`/`shaderTime`),
    abre depois do merge na main e do re-vendor do jogo;
  - skinned + instanced — Frente C (backlog).
- **Depois:** R1.6 (dono da pass, pré-compilação + ubershader, **dados por objeto num buffer único estilo Godot**,
  só se o A/B mostrar ganho) e o **aceite final** (A/B completo intercalado, 2 réplicas, 4 pontos walk + drive
  helio, 1080p, braço `three` na cópia nova: render ≤ 5 ms, % > 33 ms ≤ 2%, GPU ≤ controle + 0,5 ms, paridade
  dia/noite ≤ 0,01%, 0 recusas).
- **Ônibus (e1cede4):** fumaça no Comercial VÁLIDA (andou 17 m). Capturas de dia (`&hora=12`, quadros 1200 e
  2400 da caminhada, `.cortex/renderer-r1/busday-*.png`): a câmera fica fora do ônibus; no 2400 o jogador está
  ao lado dele, não dentro — duas amostras, não prova exaustiva. A de 18:40 saiu quase preta (inconclusiva).
  A captura do host em janela sai em 1920×1009 (área útil), não 1080.

## Backlog de pendências do R1

Regra do usuário: o que não for resolvido na frente em que surgiu vem para cá, com a origem.

- [ ] **Regras do `drive` apertadas por ponto** (SPEC-0595, dono: Frente A). Em Águas Claras, B e C tiveram menos
      de 133 draws em 9 de 10 rodadas (regra de densidade (b)). No Setor O, quase todas as rodadas reprovam por
      trânsito à vista < 50% (regra (c)). Revisar os limites por ponto. (origem: aceite com direção real,
      `r1-accept3`, 2026-10-26)
- [ ] **Travadas a pé em Águas Claras no nativo:** 2,6% acima de 33 ms (meta ≤ 2%; o `three` com o conserto
      fica em 17,4%). (origem: aceite com direção real, `r1-accept3`, 2026-10-26)
- [ ] **Ligar o `?nativePrecompile=1` por padrão no aceite do R1** (P1 do R1.6, SPEC-0585, Frente C,
      2026-10-25). Com ele: 0 pipelines nascidos em jogo (2 réplicas × 4 pontos `walk` + `drive`),
      `precompile` 16,6 → 7,8 s, paridade PASS. Ponto a ver antes de ligar: o GC jovem caiu de ~40 para
      ~12 ms/s nas rodadas com o interruptor (5 de 5), sem causa explicada. (As recusas que a varredura
      somava, 25, caíram para 0 com o oclusor de profundidade no nativo, SPEC-0585.)

- [ ] **Forçar o redesenho do mapa de sombra à noite derrubou o host** (textura destruída no `submit`). O
      jogo não redesenha à noite; causa não isolada. Origem: SPEC-0545 (Frente B).
- [ ] **Custo da sombra no renderer próprio: +0,55 ms numa rodada curta** (alvo do R1.3: ≤ 0,3 ms). Medir
      no aceite final com o A/B completo antes de concluir. Origem: SPEC-0545.
- [ ] **Frente D — `peopleGpu`, tinta por slot e pintura mascarada no repo do jogo**, pela API
      `registerNativeMaterial` e com `shaderTime` no TSL (não o `time` do TSL). Abre depois do merge na
      main e do re-vendor do jogo. Origem: SPEC-0565 (Frente C).
- [ ] **Paridade dos coplanares `interiores-*`** (standard instanciado) só pode ser conferida depois do
      merge com a Frente A. Origem: SPEC-0555 (Frente C).
- [ ] **Skinned + instanced** continua recusado; o `ParticleEmitter` da engine está coberto na galeria mas
      não apareceu nos pontos medidos do DDD 61. Origem: SPEC-0565.
- [ ] **No `?parityFreeze`, o braço `three` não chama o `beginFrame`** (servidor nulo): um bloco de quadro
      não vê a troca de braço; a sombra contornou com `scene.onAfterRender` só no modo de paridade.
      Origem: SPEC-0545.
- ~~**Vidro emissivo animado no `lambert`**~~ **RESOLVIDO** (2026-10-24, SPEC-0555 "Emissivo animado": era o
  `RenderIdRefresh` deixando o braço `three` velho; emissivo religado). Histórico: (origem: R1.2, SPEC-0535, 2026-10-24). Estado:
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
- ~~**`standard` desligado na R1.2**~~ — **RESOLVIDO** (2026-10-24): as lascas eram precisão da posição entre módulos (`@invariant` no `litVertexWgsl`, `dce009ad`); religado em `d7dde846`, `std-inv-final` PASS 0,0000%. Histórico: a causa da fachada (emissivo animado, 1,17%) foi **resolvida** (SPEC-0555);
  com o `standard` ligado ainda sobram **0,014% (alt 7) em lascas nas linhas da calçada** do Comercial dia (sem ele,
  PASS 0,0059%): outra causa, coplanar. Fica desligado até isolar. Histórico: (origem: R1.2, SPEC-0535, 2026-10-24). O modelo existe
  (`models/standard.ts`, testes), mas saiu de `NATIVE_MODELS`: no Comercial de dia, as fachadas
  de um prédio dão 1,17% de pixels fora da paridade (Setor O passa). Não foi investigado. **Volta
  antes do R1.6** (o aceite final exige 0 recusas). Próximo passo: o mesmo método do vidro
  (isolar o material da fachada, comparar dados e WGSL do estado do `three`).
- **Poça de sangue instanciada ±1–2 no Comercial de dia** (origem: SPEC-0555 "Instâncias compactadas",
  Frente C, 2026-10-24): 0,0273% dos pixels (alt 3), só dentro de `pocas-de-sangue` (lambert
  instanciado, `polygonOffset`); com o lambert instanciado no `three`, PASS. A causa dos fios (cópia de
  instâncias velha no `three`) foi corrigida no `RenderIdRefresh`. Hipótese: sombra do pedestre ferido no asfalto
  (Frente B) aparecendo na borda da poça. Também há pontos esparsos de ±2–6 ao longe, que existem sem
  instância (0,004%). **Fica com a Frente B**; reverificar com `RECEIVE_SHADOW` ligado depois da correção
  dela; poça fixa (determinística) só se o resíduo sobreviver.
- **Fios distantes no Comercial de dia** (origem: R1.2, 2026-10-24): 0,0132% dos pixels, acima
  do limite de 0,01%. Não é cobertura subpixel: num braço o fio some por inteiro (oclusão ou
  ordem), evidência em `native/scripts/perf/coverage-diff.mjs`. Hipótese: ordem do domo do céu
  nativo × malha fundida dos fios (matriz identidade, z na origem). `@invariant` na posição não
  muda.
- [x] (`9e51d3c8`, Frente C) **`lambert` instanciado recusado** (cabos quebráveis com `cull()` que compacta
      as instâncias): a causa era o `RenderIdRefresh` (1 refresh por mudança deixava as matrizes velhas no
      `three`, também no caminho só-`three`); agora 2 refreshes. Reprodução na galeria (`lambert-compacted-*`):
      FAIL alt 35 → PASS 0/0. Religado no integrado.
- ~~**`receiveShadow` no `lambert` recusado — aguarda a paridade da sombra (Frente B)**~~ **resolvido (SPEC-0545):** era o mapa do passe C++ (MVP em double × ordem float do `three`); com a ordem do `three`, 0,0000% nos 4 casos e `RECEIVE_SHADOW = true`. (origem:
  R1.2 após o merge A+B, 2026-10-24; dono: Frente B). Com `SHADOW_READY`, as sombras dos
  pedestres na calçada (Comercial, dia) diferem até 6/255 em 0,0821% dos pixels; com
  `receiveShadow` recusado o Comercial dia dá PASS (0,0030%). O modelo já chama
  `nativeShadow(posMundo, normalMundo)` na ordem do `wgsl-0019`; religar = `RECEIVE_SHADOW = true`
  em `models/lambert.ts`.
