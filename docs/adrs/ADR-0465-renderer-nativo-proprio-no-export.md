# ADR-0465 — Renderer próprio em C++ no export: o `three` sai do caminho de render

**Data:** 2026-10-24
**Status:** aceito (decisão do usuário em 2026-10-24); plano em marcos no PRD-0466. Nada implementado ainda.

Substitui, como **destino**, a decisão do ADR-0404 ("RenderingServer pelo caminho da
**receita**, não do uber-shader") e a alternativa "trocar o renderer / engine própria",
rejeitada no ADR-0228 e no ADR-0330. Absorve o RS2/RS3 do ADR-0404, as alavancas (c)/(d) da
SPEC-0435 e os marcos M5/M7/M8 do ADR-0237. Mantém a premissa de produto do ADR-0237: **o
Studio continua 100% no `three`**. Frente B2 do PRD-0009.

Anexos com o material de base (no repo): `docs/prds/0466-anexos/godot-renderer-rd.md`
(Godot, arquivo:linha), `levantamento-three-jogos.md` (o que cada jogo usa) e
`inventario-host-render.md` (o que o host já tem).

## Contexto

### O que os cortes parciais ensinaram

Todo corte que deixou o `three` dono de materiais, shaders, nós e estados rendeu menos que
o teto: M5 (ADR-0244, ganho zero), SPEC-0362 (rejeitada), b.3 (ADR-0363, ruído) e RS1
(SPEC-0425, −1,1 ms contra −4 exigidos). A causa ficou medida e se repetiu:

- **Custo por estado de shader.** No `three` 0.184, cada `NodeBuilderState` tem os próprios
  nós de luz e o próprio UBO "render", conferidos a cada render (~77 µs por estado no Hermes,
  ~13–54 estados por quadro no DDD 61; SPEC-0425, SPEC-0435). Nada disso é deduplicado
  entre estados.
- **Cada efeito barato no Godot é uma frente aqui.** Tirar as luzes do UBO por estado custou a
  `DynamicLighting` (SPEC-0435, −1,4/−1,7 ms). A sombra do sol custava 3,2 ms porque o filtro
  PCF criava uniformes por material receptor (SPEC-0445, caiu para ~0,4 ms). Cada achado é
  um contorno de um interno do `three`, e cada contorno depende da forma interna de uma
  versão específica do `three`.
- O que sobra hoje (main `20a5d6b3`, DDD 61 `e2be01c`, Full HD): render **~11–12 ms** andando
  (Comercial 12,2, Centro 11,0; dirigindo 10,6, SPEC-0445). A GPU fica em **~1,0–1,3 ms por
  quadro** com o supersampling 2× em 3840×2160 (SPEC-0455). **O render é CPU no Hermes, não
  GPU.**

### Os números que sustentam a decisão

| trabalho | no `three` (Hermes) | em C++ | fonte |
| --- | --- | --- | --- |
| laço por objeto completo | 33,5 µs/draw (55–60 no DDD 61) | **2,2 µs/draw** | ADR-0232, ADR-0330 |
| travessia + culling, 1.300 nós | 8,5 ms | 0,023 ms | ADR-0232 |
| teto "nenhuma malha no laço do `three`" (pagando ainda o trabalho por estado) | render 12,9–16,5 ms | **4,0–5,2 ms** | ADR-0404, modo 1 |
| trabalho por estado de shader | ~1–3 ms/quadro | 0 (dados de cena e luzes num buffer por vista) | SPEC-0425, SPEC-0435, Godot §6 |

O modo 1 do ADR-0404 ainda pagava o trabalho por estado, e um renderer próprio não paga.
O teto realista de um renderer próprio é então **render ≈ 2–4 ms** no DDD 61: submissão
(~0,4 ms) + detecção de mudança de material (~0,3–0,5) + upload dos que se movem
(~0,1) + atualização de esqueleto e lotes (~0,2) + fachada JS.

### Decisão do usuário

"Cortar o `three` do export e ter um renderer próprio em C++, mesmo que seja uma tarefa
complexa e demorada" (2026-10-24). Escopo: **só no export**. Materiais: **conjunto fixo**
no C++ + WGSL próprio para o especial, com os efeitos TSL de cada jogo portados uma vez
(modelo `StandardMaterial3D` + `ShaderMaterial` do Godot).

### Mudança de rumo em relação aos registros anteriores (regra do repo: avisar e registrar)

| registro | o que dizia | o que muda e por quê |
| --- | --- | --- |
| ADR-0228 / ADR-0330 (alternativas) | "trocar o renderer (threepp, engine própria)" rejeitado: sem node materials, backend errado | Não é trocar por outra lib JS/GL: é um renderer C++ **sobre o mesmo WebGPU do host** (wgpu/D3D12), reaproveitando espelho, projeção e passe de sombra que já existem. Os node materials deixam de ser necessários no export porque o conjunto é fixo e o TSL de cada jogo é portado uma vez |
| ADR-0404 (decisão) | caminho da receita; uber-shader "fica como evolução se o `three` precisar sair também da compilação" | É exatamente a condição de reabertura que o próprio ADR deixou: a correção do teto mostrou que o custo restante mora na compilação/estado do `three`. A receita (RS1) continua ligada até o renderer próprio assumir (marco R1) |
| PRD-0009, "Fora do escopo" | "reescrever a engine inteira em C++: só os laços quentes saem do JS" | Continua valendo para a engine. O **render** do export inteiro passa a ser laço quente: a lógica de jogo, o grafo de cena (`Object3D`), a matemática e os loaders do `three` ficam em JS |

## Como o Godot faz × como fazemos aqui × se cabe

Godot `4.7.2-stable`, SHA `ed1daf0b`, renderer Forward+ (`servers/rendering/renderer_rd/`).
Citações completas e conferidas no anexo `godot-renderer-rd.md`.

| tema | Godot (arquivo:linha) | aqui hoje (arquivo:linha) | cabe em wgpu/naga/Hermes/Xbox? |
| --- | --- | --- | --- |
| **Fronteira jogo→render** | RID = índice + geração (`core/templates/rid_owner.h:157-163`); `create` aloca na hora e inicializa na fila (`servers/server_wrap_mt_common.h:58`); `instance_create/set_base/set_transform` (`servers/rendering/rendering_server_default.h:933-941`) | o `three` é dono do grafo; o espelho C++ recebe nós e deltas de transform/visibilidade (`src/core/NativeSceneMirror.ts:675`, `native/src/scene/scene_mirror.h:359-449`), sem material nem textura | **sim.** Handles u32 + buffers de comando em lote por quadro: uma travessia de ponte por quadro, como o `update` do espelho. Sem thread de render no início (o Godot funciona com e sem, `rendering_server_default.cpp:471`) |
| **Instâncias e cull** | transform igual = no-op (`renderer_scene_cull.cpp:992`); lista suja processada 1×/quadro (`:528-541`, `:4357-4364`); cull de câmera = varredura linear de AABB em SoA (`:2892-2930`), em threads acima de um limiar (`:3438-3454`); BVH só para luz/sombra (`:1744-1764`) | projeção do passe principal em C++ (`native/src/scene/main_pass_culler.cpp:24`), linear sobre o espelho, esfera da geometria; padrão no host | **sim, já existe.** O culler atual vira o cull do renderer. Threads ficam para o B5 |
| **Materiais** | `MaterialKey` = bitfield só do que muda o código (`scene/resources/material.h:358-411`), cache global de shaders com refcount (`material.cpp:554`, `:656-689`); cor e números são parâmetro (`material.cpp:2122-2124`); um UBO por material (`storage_rd/material_storage.cpp:1155-1180`); código do usuário injetado num template (`scene_forward_clustered.glsl:122-123`, `:450`, `:1351`) | o `three` gera WGSL por TSL a cada `NodeBuilderState`; `MaterialDesc` (`src/render/MaterialDesc.ts`) e `PipelineKey` descrevem standard/unlit/toon/outline, mas **só em telemetria**; nenhum WGSL de material no host | **sim.** Conjunto fixo de modelos em WGSL-template + feature bits; parâmetros num storage buffer de materiais indexado. O "ShaderMaterial" é o WGSL do jogo registrado com um layout de parâmetros |
| **Pipelines e variantes** | poucas versões compiladas por passe (`scene_shader_forward_clustered.h:77-89`) + constantes de especialização (`:101-133`); pipeline em worker (`pipeline_hash_map_rd.h:151-152`); enquanto não fica pronta, o **ubershader** lê as mesmas constantes de push constant (`render_forward_clustered.cpp:496-534`, `scene_forward_clustered_inc.glsl:42-73`); pré-compila no load (`render_forward_clustered.cpp:4657-4665`) | o `three` cria o pipeline por estado (shim `native/src/webgpu/pipeline.cpp`); `pipeline_cache.h:33-70` existe sem consumidor; travada da 1ª volta já mordeu (memória "travada 1ª volta = pipelines") | **sim, com ressalva.** `override` do WGSL **funciona no naga/D3D12** (SPEC-0238, `override_probe.cpp`). Push constants são feature nativa opcional do wgpu: o ubershader lê as constantes de um storage buffer por draw. Criar pipeline em worker exige confirmar o uso multithread do `WGPUDevice` no wgpu-native (risco R-3) |
| **Lista de draw** | chave de ordenação de 128 bits calculada 1× por superfície (`render_forward_clustered.h:505-531`, `.cpp:4267-4273`); storage buffer de instâncias por lista (`:806-911`); **instancing automático** de chaves iguais consecutivas (`:877-893`); laço que só religa o estado que mudou (`:547-575`) | lote C++ pronto e puro (`native/src/render/draw_batch.cpp:78`, `RecipeStore` + `replay` com eliminação de estado redundante), hoje alimentado por receitas do `three` | **sim, já existe a metade.** O `replay` recebe receitas próprias; `@builtin(instance_index)` inclui `first_instance` no wgpu, o que dispensa push constant para o índice base |
| **Luzes** | clustered: tiles de 32 px, bitmask montada na GPU (`cluster_builder_rd.cpp:281-300`, `:438-539`); omni/spot em storage buffer, ordenados por distância (`storage_rd/light_storage.cpp:692-711`, `:949`); direcionais num UBO à parte (`:740-865`). Mobile: ≤ 8 luzes por objeto, índices no registro de instância (`forward_mobile/render_forward_mobile.h:62`, `scene_forward_mobile.glsl:541-543`) | `DynamicLighting` do `three` agrupa as luzes sem sombra em arrays de tamanho fixo (`src/render/DynamicLightingSwitch.ts`), mas o array ainda vive no UBO de cada estado | **sim.** Começa no modelo **mobile** (≤ 8 locais por objeto + direcional + hemisfério + ambiente, num buffer por vista): o DDD 61 tem 8 spots, o crash até ~13 points no total. Clustered só quando algum jogo exceder, e sem subgroup (naga/wgpu opcional) |
| **Sombras** | cascatas com encaixe em texel (`renderer_scene_cull.cpp:2313-2319`), cull por cascata (`:2417`); atlas para locais com cache por versão e teto por quadro (`light_storage.cpp:2591`, `renderer_scene_cull.cpp:3632`); **material de sombra compartilhado** para opacos (`render_forward_clustered.cpp:4223-4253`); receptor sem custo de CPU (dados no buffer de luzes) | passe de sombra depth-only em C++, padrão no host (`native/src/render/shadow_pass.cpp:299`, WGSL próprio em `:44`/`:62`), com enumerador e gate fiéis ao `three`; splits e ortho do CSM em JS (`src/scene/OutdoorLighting.ts:225-360`); o DDD 61 usa um mapa único próprio (`entities/sunShadow.ts`, 2048², sob demanda) | **sim, já existe o desenho do mapa.** Falta: mapa único com `needsUpdate` (o do DDD 61) e a **amostragem** no material (PCF/PCFSoft com a fórmula do `three` para a paridade) |
| **Pós e ordem** | opaco → céu (depois do opaco, só no fundo) → transparente → TAA → pós (`render_forward_clustered.cpp:1704-2550`); tonemap num passe só (`shaders/effects/tonemap.glsl:854-893`); névoa simples no shader da cena (`scene_forward_clustered.glsl:1102`) | bloom + ACES + vinheta + OETF + composição da UI já nativos (`native/shaders/bloom.wgsl`, `native/src/webgpu/supersample.cpp:428`); SSAA no blit | **sim, já existe o fim da cadeia.** O renderer entrega a cena em HDR linear ou LDR como o `three` entrega hoje; o composite fica. AgX entra no composite (hoje o crash pede AgX e recebe ACES) |
| **Render targets** | viewport = câmera + cenário + alvo; filhos antes do pai (`renderer_viewport.cpp:98-134`) com modo de atualização (`:815-843`); tamanho interno × final e mip bias (`:239-240`, `:284`); texturas nomeadas sob demanda (`storage_rd/render_scene_buffers_rd.cpp:292`) | `Renderer.renderUiLayer`/`renderSceneHDR` desenham pelo `three` em RT própria (`src/core/Renderer.ts`); o teste4 desenha uma 2ª cena com outra câmera (guarda-roupa) | **sim.** Uma "vista" = (câmera, alvo, cena) com a mesma fila; a escala interna já é o SSAA |
| **Transparência** | lista própria, de trás para frente por instância, com prioridade (`render_forward_clustered.h:722-731`) | sort do `three` (`painterSortStable`/`reversePainterSortStable`) reproduzido em C++ na b.3 (arquivada) | **sim.** Para paridade, a chave é a do `three` (`renderOrder`, `z`, `id`), não a do Godot |
| **Skinning** | compute no começo do quadro deforma para um VB por instância (`storage_rd/mesh_storage.cpp:1149-1253`, `shaders/skeleton.glsl`); o shader de cena não sabe de esqueleto | `three` (1–4 personagens no DDD 61; ~80–130 µs cada no Hermes, SPEC-0357) | **sim.** Começa por skinning **no vertex shader** (o que o `three` faz, paridade direta, N pequeno); compute só se o custo de GPU por passe aparecer (sombra + cor = 2 passes hoje) |

**O que não cabe ou não se copia:** a linguagem de shader do Godot (aqui o especial é WGSL
direto); o clustered com subgroup (feature opcional); threads de render já no 1º marco (o
Hermes é thread única e o B5 depende disto); a ordenação do Godot para alfa (a paridade
exige a do `three`).

## Decisão

**No export nativo, o render passa a ser de um renderer próprio em C++ (`RenderingServer`
do host). O `three` continua no JS como grafo de cena, matemática e loaders, e sai do
caminho de render.** O Studio não muda.

### 1. Camadas

```
jogo (JS)  →  three: Object3D/Mesh/Material/Light como DADO  (sem WebGPURenderer no export)
              │
              ├─ NativeRenderer (src/render/native/, TS): mesma superfície da classe
              │   Renderer da engine (init, precompile, render, renderViewport,
              │   renderUiLayer, renderSceneHDR, resize, dispose)
              │   ├─ tradutor de material: Material do three → (modelo, features, parâmetros)
              │   ├─ registro de geometria/textura: BufferGeometry/Texture → handles
              │   └─ deltas por quadro: só o que mudou
              │
ponte      →  __cortexRenderServer (um buffer de comandos por quadro + ArrayBuffers externos)
              │
host (C++) →  native/src/render/server/: RIDs, cull (espelho + main_pass_culler),
              lista e ordenação, pipelines, luzes, sombra, emissão (draw_batch replay),
              vistas e alvos  →  composite/bloom/UI que já existem
```

- **A fachada é a classe `Renderer` da engine** (`src/core/Renderer.ts`), não o
  `WebGPURenderer`: é a superfície que a engine e os jogos chamam. A escotilha
  `renderer.threeRenderer` não existe no modo nativo: uso no jogo vira recusa no censo (R0).
- **O espelho de cena continua sendo o grafo do C++.** As matrizes de mundo em `double`, a
  visibilidade herdada e o cull já moram lá. O renderer acrescenta ao nó o que falta:
  **instância desenhável** = (mesh RID, material RID, flags de passe, camada, `renderOrder`).

### 2. API por deltas (o JS só fala quando algo muda)

| delta | quando | como |
| --- | --- | --- |
| nó criado/removido, transform, visibilidade | já existem (`appendNodes`/`removeNode`, `update`, gancho de `visible`) | espelho |
| instância (mesh + material + flags) | malha entra na cena / troca de geometria ou material | comando `instanceSet` |
| geometria | 1º uso; `attribute.version` mudou (partículas, marcas de pneu, chuva) | `GPUBuffer` criado/reescrito pela fachada com o shim WebGPU (as mesmas chamadas do `three`) e entregue ao C++ por handle (SPEC-0495) |
| textura | 1º uso; `texture.version` (canvas 2D, `DataTexture`) | idem: `GPUTexture` pelo shim (reaproveita KTX2, canvas, `ImageBitmap`) e entregue por handle |
| parâmetro de material | valor mudou | **conferência por material** (não por objeto) contra um instantâneo do bloco de parâmetros do modelo, gerado da mesma tabela que o struct WGSL; ganchos só se a conferência aparecer como gargalo |
| luzes, névoa, câmera, ambiente | por vista, por quadro | um bloco de cena + um buffer de luzes por vista (o Godot: `render_scene_data_rd.cpp:70-74`) |
| `InstancedMesh` | `instanceMatrix.version`/`count`, atributos extras por instância | `setInstances` já existe (sombra); estende a atributos extras (`instanceColor`, `instancePaint`, os 7×vec4 das pessoas) |
| esqueleto | por quadro, se a animação rodou | `skeleton.boneMatrices` (o `three` já calcula em JS) → upload |

**Instância limpa custa zero JS por quadro** (regra do ADR-0404, mantida). O que é por
quadro em JS é O(mudanças) + O(materiais vivos) na conferência.

### 3. Materiais: conjunto fixo + WGSL do jogo

Modelos fixos, cada um um template WGSL com feature bits como `override`:

| modelo | cobre | features (bits do pipeline) |
| --- | --- | --- |
| `unlit` | `MeshBasic(Node)Material`, céu do DDD 61, partículas, sprites | map, vertexColors, alphaTest, fog, instancing, transparent/aditivo |
| `lambert` | `MeshLambert(Node)Material` (o grosso do DDD 61) | map, vertexColors, emissive + emissiveMap, fog, receiveShadow, instancing |
| `standard` | `MeshStandard`, e `MeshPhysical` **só** com `ior`/`specular` (o que o carregador de GLB gera) | map, normalMap, metal/roughness maps, emissiveMap, vertexColors (sem o defeito do naga, R-1), UV transform por textura (`KHR_texture_transform`), env/IBL, fog, sombra, instancing, skinning |
| `toon` | `MeshToon` + `gradientMap` da engine | map, gradiente, fog, sombra, skinning |
| `outline` | casca inverted hull da engine (`OUTLINE_THICKNESS_KEY`) | skinning, instancing |
| WGSL do jogo | `peopleGpu` e as tintas do DDD 61, água cartoon, terreno com splat, pós radial do kart | layout de parâmetros declarado; o material TSL do Studio leva `userData.nativeMaterial = '<nome>'` |

- **Paridade da fórmula:** a matemática de cada modelo é portada do WGSL que o próprio
  `three` 0.184 gera para aquele material (instrumento do R0 que salva esse WGSL), não
  reescrita "de cabeça". BRDF, Lambert, névoa, sombra PCF, tone mapping e espaço de cor
  ficam iguais por construção.
- **Recusar em vez de aproximar** (regra do M1/SPEC-0245): clearcoat, sheen, transmission,
  iridescence, nó TSL sem WGSL registrado, `onBeforeRender` próprio e escotilha
  `threeRenderer` são recusa, nunca rebaixamento. O censo do R0 diz, por jogo, o que recusa.
- **Cor e números não entram na chave do pipeline** (lição do M2 e do Godot): pipeline =
  (modelo, features, layout de vértice, blend/profundidade/cull/`polygonOffset`, formato do
  alvo, amostras).

### 4. Pipelines

- Cache por chave POD de 64 bits (`pipeline_cache.h`, hoje sem consumidor).
- **Pré-compilação no load** a partir das instâncias conhecidas (substitui o
  `compileAsync`/aquecimento do `three`, que no DDD 61 fazia 2.813 lookups em 39,7 s no
  `precompile`).
- Fora do load: a variante nova é compilada fora do laço; enquanto não fica pronta, desenha
  pelo **ubershader do modelo** (as mesmas features lidas de um buffer em vez de
  `override`). Se a compilação em worker não for segura no wgpu-native, a mesma compilação
  roda no início do quadro seguinte com o ubershader no meio (sem travada visível).

### 5. Luzes, sombra e pós

- Um bloco de cena por vista (câmera, tempo, névoa, exposição) e **um buffer de luzes por
  vista**: direcionais, hemisfério, ambiente e até 8 locais (spot/point) por objeto,
  escolhidos no C++ por distância. Luz com intensidade 0 sai do buffer **sem trocar variante**
  (a armadilha da SPEC-0150 do jogo deixa de existir).
- Sombra: o passe depth-only C++ ganha (a) mapa único com `autoUpdate/needsUpdate` (o
  `SunShadow` do DDD 61) além do CSM, e (b) **material de sombra compartilhado** para
  opacos. A amostragem é do material fixo, com a fórmula do filtro que o jogo usa (o DDD 61
  usa **PCFSoft**, imposto pela engine em `SceneBuilder.ts`/`OutdoorLighting.ts`). Os
  parâmetros da sombra (matriz, bias, normalBias, intensidade, mapSize, radius) ficam **só no
  bloco de vista**, nunca por material: uniforme por material foi o que deixava a sombra cara
  no `three` (SPEC-0445).
- Formato do bloco de vista, das luzes e das instâncias: SPEC-0475 (registro de desenho da
  sessão `rendering-server`, branch `claude/rendering-server-2b92ff`), que vira a base da
  SPEC do R1.2.
- Pós: fica o que existe no host (bloom, ACES, vinheta, OETF, composição da UI, SSAA). O
  renderer entrega a cena no mesmo formato que o `three` entrega hoje (HDR linear com
  bloom; LDR com tone mapping no shader sem bloom). AgX e o pós do jogo (borrão radial do
  kart) entram como passes do composite.

### 6. Migração por objeto, sem quadro misto no estado final

Durante a migração (até o R4 do PRD-0466), o renderer próprio desenha **dentro da pass da
cena**, no ponto em que o RS1 já emite hoje (padrão SPEC-0245/SPEC-0425: depois do fundo, na
ordem do `painterSortStable`, intercalado). O que ele ainda não cobre fica com o `three`,
por objeto. Cada etapa sobe a cobertura e é mergeável desligada. O estado final de cada jogo
é **0 recusas**: o renderer próprio é dono da pass (limpa, fundo, cena), e o `three` não
desenha nada do quadro 3D.

### 7. Igualdade de imagem

- `?parityFreeze=<s>` (`src/render/MainPassArm.ts`) alterna, quadro a quadro e na mesma
  execução, renderer próprio × `three` com o jogo congelado. Pares N×N+1 medem a diferença e
  N×N+2 o ruído. Novo alvo `?parityTarget=renderer`. O braço troca o caminho **inteiro**
  e relata quantas trocas fez: na SPEC-0435 trocar só o `renderer.lighting` não trocava nada,
  porque as `RenderLists` do `three` capturam o `lighting` ao nascer, e o instrumento deu 0 em
  tudo. Paridade entre execuções não vale no DDD 61 (o jogo não é determinístico).
- Ganho grande e súbito só vale com paridade por imagem no mesmo par de rodadas: o −6 ms
  falso da SPEC-0435 eram objetos que deixaram de ser desenhados.
- Captura por ponto (`CORTEX_RENDER_PARITY_CAPTURE` + `native/scripts/render-parity.mjs`) em
  Setor O, Centro, Comercial e Águas Claras, **dia e noite** (`?hora=21`), andando e dirigindo.
- **Galeria de materiais:** cena fixa (sem NPC nem trânsito) com um objeto por (modelo,
  feature) e por WGSL de jogo, capturada nos dois caminhos. É o caso de resposta conhecida
  que valida o instrumento antes de qualquer conclusão no jogo.
- **Sonda de pixel por shader novo** no `cortex_host_tests` (render offscreen + leitura): "compilou"
  não prova nada no naga (memória do `COLOR_0` branco).

## Riscos

| id | risco | cobertura |
| --- | --- | --- |
| R-1 | **naga miscompila em silêncio** (precedente: `COLOR_0` + `map` = branco) | sonda de pixel por modelo × feature no `cortex_host_tests`; a galeria de materiais tem vertex color + textura de propósito |
| R-2 | **imagem sutilmente errada** (o modo de falha mais caro desde o ADR-0237) | fórmula portada do WGSL gerado pelo `three`; `?parityFreeze` + galeria + captura por ponto, dia e noite; nenhum marco fecha sem paridade |
| R-3 | travada de pipeline / criação de pipeline fora da thread do device | pré-compilação no load + ubershader; validar o uso multithread do `WGPUDevice` no wgpu-native antes de usar worker |
| R-4 | **divergência Studio × export** (cada efeito existe em TSL no Studio e em WGSL no export) | regra: efeito TSL novo sem WGSL registrado é **recusa no censo** (o export avisa); paridade por efeito na galeria; o modelo fixo é derivado do `three`, então o caminho comum não diverge |
| R-5 | bump do `three` muda fórmula ou layout | `three` pinado (0.184); a galeria roda no bump e o tradutor recusa campo desconhecido |
| R-6 | delta de material faltando (uniforme velho na tela) | o instantâneo cobre todos os campos do bloco de parâmetros do modelo e é gerado da mesma tabela que o struct WGSL; teste de forma |
| R-7 | limites do WebGPU/D3D12 (4 bind groups, storage buffers por estágio, UBO de 64 KB) | instâncias, materiais e luzes em storage buffers; layout fixo de 4 grupos (cena / passe / instâncias+material / texturas) |
| R-8 | **Xbox** | sem risco novo: o renderer usa o mesmo `webgpu.h` que o host já usa, e o laço em C++ é o que o console aceita (JIT proibido). Fica mais fácil trocar o backend por D3D12 direto no futuro, se o wgpu não fechar no GDK |
| R-9 | custo da fachada no Hermes | instância limpa = zero JS (teste com contador); evitar os gotchas conhecidos: `for…of` em `Map` aloca, `let` em closure de `for`, getter via `super` quebrado pelo Babel do export |
| R-10 | constantes de pipeline vindas do JS são descartadas pelo shim (`native/src/webgpu/pipeline.cpp` não lê `constants`) | os pipelines do renderer são criados em C++ (`WGPUConstantEntry` direto); se algum dia vierem do JS, o shim precisa ler e testar |
| R-11 | memória dobrada com dois renderers vivos | só no modo de paridade; no modo normal o `three` só cria os recursos do que ainda desenha |
| R-12 | prazo longo sem entrega | marcos pequenos, cada um com interruptor e critério medido; o R1 sozinho já tira o `three` do quadro 3D do DDD 61 |

## Alternativas consideradas

- **Continuar pela receita (ADR-0404) + contornos por interno do `three`** (DynamicLighting,
  filtro compartilhado, bloco único de luzes no sistema de nós): cada contorno rende 1–2 ms e
  depende da forma interna do `three`; o teto fica em ~1 ms por estado de shader mais o laço
  das recusas. Rejeitada como destino; os contornos já mergeados continuam até o R1 assumir.
- **Uber-shader a partir do `MaterialDesc` atual (o M5 original):** é o embrião desta decisão,
  mas sem fachada nem dono das instâncias. Absorvido.
- **Fork do sistema de nós do `three`** (bloco único de luzes, SPEC-0435 (d)): mexer em
  arquivo vendorizado e manter fork por versão; o custo por objeto continua em JS. Rejeitada.
- **Renderer próprio também no Studio:** dobra o trabalho de paridade com o DOM/TSL e tira o
  editor do ecossistema do `three`. Fora do escopo por decisão do usuário.
- **Static Hermes / JIT:** não é opção (JIT proibido no Xbox; Static Hermes imaturo,
  2026-10-03).

## Consequências

- O export passa a ter dois mundos: Studio no `three` (autoria) e export no renderer próprio
  (jogo), com a paridade **verificada**, não automática. O ADR-0237 já aceitou isso.
- Os caminhos de otimização sobre internos do `three` no export (TransformOnlyRefresh,
  RenderIdRefresh, b.1, b.2 com receitas, RS1, DynamicLighting, SharedShadowFilter,
  projeção que alimenta a RenderList) ficam ligados até o renderer próprio assumir cada jogo,
  e **saem do export** no R5 (no Studio nunca instalaram). Simplifica o código.
- Efeito visual novo em jogo passa a ter custo dobrado (TSL + WGSL), com o censo cobrando.
- O espelho, o culler, o passe de sombra, o lote, o `pipeline_cache`, o `MaterialDesc`, o
  `PipelineKey`, o bloom, o composite e o SSAA deixam de ser peças soltas e viram o renderer.
- O B5 (threads) passa a ter o que paralelizar: cull, lista e gravação de comandos são do C++.
- Docs: o `docs/cortex-native/architecture.md` ganha a seção do renderer quando o R1 entrar
  (este ADR é só plano).
