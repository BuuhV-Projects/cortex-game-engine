> **Anexo do PRD-0466 / ADR-0465** (2026-10-24). Estudo do Godot 4.7.2-stable (SHA ed1daf0b) feito por leitura do clone; cada linha conferida com grep/sed nesse SHA. Caminhos de scratchpad citados são locais e temporários; o que vale é o arquivo:linha no repo indicado.

# Como o Godot faz: renderer Forward+ (`servers/rendering/renderer_rd`)

- **Tag:** `4.7.2-stable` (a estável mais nova em `git ls-remote --tags` em 2026-10-24)
- **SHA:** `ed1daf0bf001b61586d9930840f2f1394092c079` (commit de 2026-08-16)
- **Clone (raso, mantido):** `C:\Users\buuhb\AppData\Local\Temp\claude\D---buuhvprojects-js-game-engine--claude-worktrees-renderer-nativo-45b16a\0e95ad36-20a5-45e8-a409-14e6edbb5755\scratchpad\godot`
  (no Windows o checkout precisou de `git config core.longpaths true` + `git restore` + `git reset`; a árvore está limpa)
- Caminhos relativos à raiz do repo do Godot. Toda linha citada foi conferida com `grep -n`/`sed -n` nesse SHA.
- Objetivo: embasar um renderer próprio em C++ (wgpu/D3D12, WGSL via naga) que substitui o three.js no export nativo.

---

## 1. Servidor de render e RIDs

**Citações**
- `servers/rendering/rendering_server_default.h:80`: `CommandQueueMT command_queue;` é a fila de comandos entre threads.
- `servers/rendering/rendering_server_default.h:117`: `ASYNC_COND_PUSH` vale `Thread::get_caller_id() != server_thread`. A chamada só vai pra fila quando vem de outra thread.
- `servers/server_wrap_mt_common.h:58`: macro `FUNCRIDSPLIT`. `xxx_create()` faz `server_name->xxx_allocate()` (o RID nasce **na hora**, na thread que chamou) e manda o `xxx_initialize(ret)` pra fila.
- `servers/rendering/rendering_server_default.h:933-941`: `FUNCRIDSPLIT(instance)`, `FUNC2(instance_set_base, RID, RID)`, `FUNC2(instance_set_transform, RID, const Transform3D &)`. Toda a API de instância é um wrapper gerado por macro sobre `RenderingMethod` (`RSG::scene`, `:923-924`).
- `servers/rendering/rendering_server_default.cpp:415`: `_thread_loop()`, laço `command_queue.flush_all()` (`:420`) na thread de render.
- `servers/rendering/rendering_server_default.cpp:443`: `draw()`. Com thread, empurra `_draw` pra fila (`:449`). Sem thread, chama direto.
- `servers/rendering/rendering_server_default.cpp:76-109`: `_draw()` roda `scene->update()` (`:96`), `particles_storage->update_particles()`, `render_probes()` e `viewport->draw_viewports()` (`:109`), nessa ordem.
- `core/templates/rid_owner.h:157-163`: o RID é `validator(32 bits) << 32 | índice`. O bit `0x80000000` marca "alocado e ainda não inicializado". `get_or_null` (`:191`, checagem em `:215-245`) valida a geração. É um slot map em chunks.
- Lado da cena: `scene/3d/visual_instance_3d.cpp:208` chama `instance_create()`, `:197` chama `instance_set_base`, `:61/:78/:101` chamam `instance_set_transform` (no `NOTIFICATION_TRANSFORM_CHANGED`).
- `servers/rendering/renderer_scene_cull.h:1017`: `RID_Owner<Instance, true> instance_owner{ 65536, 4194304 }` (chunk de 64k, máximo de 4M).

**Como funciona.** O jogo nunca toca em objeto de GPU. Ele fala com um servidor por handles opacos (RID). Cada chamada `set_*` vira um comando serializado numa fila MT, executado pela thread de render. O `create` é dividido em duas fases (alocar agora, inicializar na fila), e por isso o chamador recebe um handle válido sem precisar sincronizar. O RID carrega uma "geração" (validator): usar um handle depois do `free` falha em vez de corromper memória.

**Lição para nós.** A fronteira JS→C++ deve ser uma API de **handles inteiros + comandos** (`instanceCreate()`, `instanceSetBase(h, mesh)`, `instanceSetTransform(h, mat4)`), não um grafo de objetos espelhado. Para o Hermes isso é ótimo: o handle é `uint32 índice | uint32 geração` (ou 2×u32), a alocação é imediata no lado C++ e os `set` podem ir por um **buffer de comandos em lote** por quadro, sem uma chamada nativa por propriedade. Thread de render separada é opcional: o Godot funciona com e sem ela (`create_thread`, `rendering_server_default.cpp:471`). Comecem sem e desenhem a API de modo que a fila possa entrar depois.

---

## 2. Instâncias e culling (`RendererSceneCull`)

**Citações**
- `servers/rendering/renderer_scene_cull.cpp:988-1006`: `instance_set_transform` sai cedo se a transform é igual (`:992`, comentário "worst evil"). Se mudou, só grava e chama `_instance_queue_update` (`:1005`).
- `servers/rendering/renderer_scene_cull.cpp:528-541`: `_instance_queue_update` marca `update_aabb` e põe a instância numa intrusive list (`SelfList`) **uma vez só**.
- `servers/rendering/renderer_scene_cull.cpp:4357-4364`: `update_dirty_instances()` esvazia a lista uma vez por quadro e depois chama `update_dirty_resources()` (materiais, skeletons, multimesh).
- `servers/rendering/renderer_scene_cull.cpp:1605` / `:1732`: `_update_instance` repassa a transform pro `geometry_instance->set_transform(...)` do renderer. `:1709-1714`: se a geometria projeta sombra, **suja a sombra das luzes pareadas**.
- `servers/rendering/renderer_scene_cull.cpp:1744-1764`: o AABB de objeto que se move é **quantizado** em potência de 2 (`:1755`) antes de entrar no `DynamicBVH` (`indexers[INDEXER_GEOMETRY]`/`INDEXER_VOLUMES`, `renderer_scene_cull.h:334`). Mover um pouco não reinsere na árvore.
- `servers/rendering/renderer_scene_cull.h:352-353`: `PagedArray<InstanceBounds> instance_aabbs; PagedArray<InstanceData> instance_data;` guardam os dados de cull em **SoA, separados**. Os bounds ficam num array próprio, porque são lidos primeiro (`:195-198`).
- `servers/rendering/renderer_scene_cull.h:211-225`: `InstanceBounds::in_frustum` é o teste plano×AABB com o "p-vertex" pré-escolhido pelos sinais da normal (`plane_signs_ptr`). Não é SAT completo, e o comentário aceita falso positivo.
- `servers/rendering/renderer_scene_cull.cpp:2892-2930`: `_scene_cull` faz **varredura linear** de `instance_data[p_from..p_to]` com as macros `LAYER_CHECK && IN_FRUSTUM && VIS_CHECK && !OCCLUSION_CULLED` (`:2930`). O frustum da câmera **não usa o BVH**, que fica pra pareamento luz↔geometria e cull de sombra (`convex_query`, `:2417`, `:2568`).
- `servers/rendering/renderer_scene_cull.cpp:3438-3454`: acima de `thread_cull_threshold` (`:4516-4517`, project setting e no mínimo 1 por CPU), o cull é dividido em `WorkerThreadPool::add_template_group_task(... _scene_cull_threaded ...)`, cada thread com seu `InstanceCullResult`, juntados depois com `append_from`.
- `servers/rendering/renderer_scene_cull.cpp:3235`: o resultado é `cull_result.geometry_instances.push_back(idata.instance_geometry)`. `:3706` entrega tudo em `scene_render->render_scene(..., geometry_instances, light_instances, reflections, decals, ...)`.
- `servers/rendering/renderer_geometry_instance.h:40-51`: `RenderGeometryInstance` é a interface que o renderer implementa (`set_transform`, `_mark_dirty`, `pair_light_instances`...).

**Como funciona.** A cena tem dois níveis. (1) `Instance` é o lado "servidor": transform, base, flags e pareamentos. (2) `RenderGeometryInstance` é o lado "renderer", com caches prontos pra desenhar. Mudanças entram por uma lista suja e são processadas uma vez por quadro. O cull de câmera é uma varredura SoA paralela e amigável à cache, sem descida em árvore. A árvore (DynamicBVH com AABB quantizado) serve às consultas espaciais "quem toca em quem" (luz×objeto, cascata×objeto). O pareamento de luzes é incremental, e por isso mover um objeto sem sombra não custa nada às luzes.

**Lição para nós.** (a) Transform igual → *no-op* já na entrada. (b) Lista suja intrusiva, processada uma vez por quadro. (c) Frustum cull = **array SoA de AABB (6 floats) + loop linear**, dividido em N threads acima de um limiar. Com até ~50–100k instâncias isso vence o BVH e é trivial de escrever em C++. (d) BVH só pra consulta espacial (sombra/luz/picking), com **AABB quantizado** pra objetos que se movem. (e) A saída do cull é uma **lista de ponteiros pra caches do renderer**, não de objetos de cena.

---

## 3. Materiais (gerar shader por flags, cache por chave, UBO por material)

**Citações**
- `scene/resources/material.h:358-411`: `struct MaterialKey` é um **bitfield** só de enums/booleans que mudam o *código* (transparency, shading_mode, cull_mode, billboard, feature_mask, flags...). Hash por `hash_djb2_buffer` sobre os bytes (`:395`) e igualdade por `memcmp` (`:399`).
- `scene/resources/material.h:415` / `scene/resources/material.cpp:554`: `static HashMap<MaterialKey, ShaderData> shader_map` é o cache **global** de shaders com refcount `users`.
- `scene/resources/material.cpp:656-689`: `_update_shader()` calcula a chave. Se é igual à atual, não faz nada. Se já existe no mapa, reaproveita o RID (`users++`) e só chama `material_set_shader`.
- `scene/resources/material.cpp:2040-2061`: senão monta a string `code` (texto do shader Godot) e chama `RS::shader_create_from_code(code)` **fora do mutex**. Se perder a corrida pra outra thread, libera o seu e usa o vencedor.
- `scene/resources/material.cpp:2086-2110`: `flush_changes()`/`_queue_shader_change()` adiam a regeneração pra uma lista suja (mudar 10 flags gera 1 shader).
- `scene/resources/material.cpp:2122-2124`: `set_albedo` só faz `_material_set_param(albedo)`. **Cor e valores numéricos não entram na chave**: viram uniform.
- `servers/rendering/renderer_rd/storage_rd/material_storage.cpp:2540-2557`: `material_set_param` grava no `HashMap params` e enfileira (`_material_queue_update`, `:2411`), distinguindo "uniform sujo" de "textura suja".
- `servers/rendering/renderer_rd/storage_rd/material_storage.cpp:2423-2445`: `_update_queued_materials` processa a fila uma vez por quadro (chamado por `Utilities::update_dirty_resources`, `storage_rd/utilities.cpp:252-255`).
- `servers/rendering/renderer_rd/storage_rd/material_storage.cpp:1155-1180`: `update_parameters_uniform_set` cria **um UBO por material** (`uniform_buffer_create`, `:1165`), serializa os params nos offsets do compilador (`:1179`), faz `buffer_update` (`:1180`) e cria o uniform set (UBO + texturas) em `:1244`.
- `servers/rendering/shader_compiler.cpp:1544`: `ShaderCompiler::compile` (linguagem Godot → GLSL). `:674-682` calcula `uniform_offsets` e `uniform_total_size`, alinhado a 16 (std140).
- `servers/rendering/renderer_rd/forward_clustered/scene_shader_forward_clustered.cpp:41`, `:177`, `:234`: `ShaderData::set_code` compila o código do usuário e injeta no *template* via `shader.version_set_code(version, gen_code.code, gen_code.uniforms, ...)`. `:236` faz `ubo_size = gen_code.uniform_total_size`. `:240` limpa o cache de pipelines do shader.
- `servers/rendering/renderer_rd/shaders/forward_clustered/scene_forward_clustered.glsl:122-123` (`#MATERIAL_UNIFORMS`), `:450` (`#CODE : VERTEX`), `:1351` (`#CODE : FRAGMENT`): pontos de injeção no ubershader-template da cena.
- `servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.h:64-67`: uniform sets por frequência: `SCENE=0` (global), `RENDER_PASS=1` (por passe), `TRANSFORMS=2` (skeleton/multimesh), `MATERIAL=3`.

**Como funciona.** Há três camadas. (1) O `StandardMaterial3D` é um **gerador de texto de shader**: as flags formam uma chave POD e o cache global garante 1 shader por combinação de flags, não por material. (2) O servidor compila o texto e injeta num template GLSL único da cena (`#CODE : FRAGMENT`). (3) Cada material só tem um **UBO + texturas** (uniform set 3). Trocar cor é `buffer_update` de alguns bytes, sem recompilar nada.

**Lição para nós.** Separar rigidamente **"o que muda o código"** (chave POD → shader WGSL gerado, cache global com refcount) de **"o que é dado"** (UBO/storage por material). No three.js isso já existe implícito (`program cache key`). No C++ deve ser explícito: `MaterialKey` bitfield → `ShaderModule` (WGSL gerado por template + `#ifdef` resolvido em string) → cache. Parâmetros vão num **bind group 3 por material** (ou, melhor pra wgpu, um storage buffer global de materiais indexado por `material_index`, o que reduz troca de bind group). Montar as atualizações em filas sujas por quadro (material, skeleton, multimesh) num único `update_dirty_resources()`.

---

## 4. Pipelines e variantes (specialization, chave de pipeline, ubershader assíncrono)

**Citações**
- `servers/rendering/renderer_rd/forward_clustered/scene_shader_forward_clustered.h:77-89`: `enum PipelineVersion` (DEPTH_PASS, DEPTH_PASS_DP, ..._WITH_NORMAL_AND_ROUGHNESS, ..._WITH_MATERIAL, ..._WITH_SDF, COLOR_PASS) define as variantes **compiladas** do shader (por passe).
- `scene_shader_forward_clustered.h:68-75`: `ShaderColorPassFlags` (UBERSHADER, SEPARATE_SPECULAR, LIGHTMAP, MULTIVIEW, MOTION_VECTORS) são os únicos bits que geram versão compilada a mais no color pass.
- `scene_shader_forward_clustered.h:101-133`: `ShaderSpecialization` são 3×u32 empacotados (soft shadows, nº de amostras PCF, projector, fog, multimesh/formatos, area light...). Isso vira **specialization constant** e não gera recompilação de shader, só pipeline.
- `scene_shader_forward_clustered.h:191-217`: `PipelineKey` = vertex_format + framebuffer_format + cull + primitive + version + color_pass_flags + specialization + wireframe + ubershader, com `hash()` murmur3. `:219`: `PipelineHashMapRD<PipelineKey,...> pipeline_hash_map` por shader.
- `scene_shader_forward_clustered.cpp:278-322`: `_get_shader_version` mapeia (passe, flags, ubershader) pro índice da variante compilada.
- `scene_shader_forward_clustered.cpp:331` e `:490-508`: `_create_pipeline` monta as spec constants (`constant_id 0/1/2`), chama `render_pipeline_create(...)` e registra com `add_compiled_pipeline(hash, pipeline)`.
- `servers/rendering/renderer_rd/pipeline_hash_map_rd.h:151-152`: `compile_pipeline` enfileira `WorkerThreadPool::add_template_task(..., "PipelineCompilation")` (**compilação em background**). `:179-195`: `get_pipeline(key, hash, wait, source)` devolve `RID()` vazio se não está pronto e `p_wait_for_compilation=false`. `:60-71`: `_add_new_pipelines_to_map` move as prontas da fila (sob mutex) pro mapa.
- `servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.cpp:496-534`: no desenho tenta primeiro a pipeline **especializada** (`ubershader=0`, sem espera). Se vier vazia, faz `pipeline_key.ubershader++` e pede a do **ubershader com espera** (`get_pipeline(..., pipeline_key.ubershader, ...)`, `:523`). O ubershader zera a specialization e usa `cull_mode = DISABLED` (`:511-513`).
- `render_forward_clustered.cpp:587-596`: com ubershader, os valores de specialization e o `cull_mode` vão no **push constant** (`push_constant.ubershader.specialization`).
- `servers/rendering/renderer_rd/shaders/forward_clustered/scene_forward_clustered_inc.glsl:26-37` e `:42-73`: no GLSL, `#ifdef UBERSHADER` faz `sc_packed_0()` ler `draw_call.sc_packed_0` (push constant). Senão, lê `layout(constant_id = 0) const uint pso_sc_packed_0`. **O mesmo código-fonte** serve às duas formas.
- `render_forward_clustered.cpp:4657-4665`: `_mesh_compile_pipeline_for_surface` pré-compila pipelines quando a malha/material é carregada (fonte `PIPELINE_SOURCE_*`), antes do primeiro desenho.
- `servers/rendering/renderer_rd/pipeline_cache_rd.h:70-82`: `PipelineCacheRD` antigo, um cache linear simples (vertex_format, framebuffer, wireframe, render_pass, bools), ainda usado pelos **efeitos** (`effects/copy_effects.h:105`, `effects/bokeh_dof.h:91`).

**Como funciona.** A explosão de variantes é contida em três níveis. **Compilado** (poucos): passe × 5 bits de color pass. **Especializado** (muitos, mas só pipeline): ~96 bits de spec constants. **Estado fixo** (pipeline): formato de vértice/framebuffer, cull e primitiva. A pipeline exata é compilada **assíncrona** em worker. Enquanto isso, o draw usa o **ubershader**, que lê as mesmas "constantes" de push constant com branch dinâmico. Resultado: zero travada na primeira vez que algo aparece, com custo de algum fps enquanto o ubershader está ativo.

**Lição para nós.** Isso ataca direto a "travada da 1ª volta = pipelines" que já medimos. Em wgpu/WGSL: (a) as **spec constants viram `override` do WGSL** (pipeline-overridable constants, suportadas por naga/wgpu) no lugar de `constant_id`. (b) O ubershader é o **mesmo WGSL** com uma flag de pré-processador que troca `override` por leitura de um uniform/push constant (push constants em wgpu são *feature nativa* `PUSH_CONSTANTS`, disponível em D3D12/Vulkan. Alternativa: um u32 por draw num storage buffer). (c) `create_render_pipeline` em thread de worker (o `Device` do wgpu é `Send+Sync`) com mapa `hash→pipeline` alimentado por fila sob mutex. (d) Pré-compilar no load com a mesma chave. Mantenham a chave de pipeline **POD + hash**, e a parte "compilada" do shader no mínimo possível.

---

## 5. Lista de render, ordenação, push constants, instancing automático

**Citações**
- `servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.h:505-531`: `GeometryInstanceSurfaceDataCache::sort` é uma union de **2×u64**. Em `sort_key1`: `lod_index:8`, `uses_softshadow`, `uses_projector`, `uses_forward_gi`, `uses_lightmap`, `depth_layer:4`, `surface_index:8`, `geometry_id:32`, `material_id_hi:8`. Em `sort_key2`: `material_id_lo:24`, `shader_id:32`, `priority:8`. O comentário (`:520-522`) diz que essa ordem foi **medida** como a melhor.
- `render_forward_clustered.cpp:4267-4273`: o preenchimento da chave por superfície (`material_id`, `shader_id`, `geometry_id = p_mesh.get_local_index()`, `priority`) acontece **uma vez**, quando a geometria/material muda, não por quadro.
- `render_forward_clustered.h:694-708`: `SortByKey` compara `sort_key2` e depois `sort_key1` (prioridade > shader > material > geometria > profundidade grossa). `:716` `sort_by_depth` (sombras). `:728` `sort_by_reverse_depth_and_priority` (alpha).
- `render_forward_clustered.cpp:968`: `depth_layer = CLAMP(int(inst->depth * 16 / z_max), 0, 15)`, profundidade grossa em 16 faixas dentro da chave (front-to-back aproximado sem destruir o agrupamento por estado).
- `render_forward_clustered.cpp:1913-1921`: `_fill_render_list(OPAQUE)` → `sort_by_key()` (opaco/motion) → `sort_by_reverse_depth_and_priority()` (alpha) → `_fill_instance_data(...)` pras 3 listas.
- `render_forward_clustered.h:334-345` (`SceneState::InstanceData`: transform 3×4, prev_transform, AABB comprimido, uv_scale, flags, `instance_uniforms_ofs`, `layer_mask`...). `:409`: `instance_buffer[RENDER_LIST_MAX]` (um buffer por lista, `MultiUmaBuffer`, mapeado).
- `render_forward_clustered.cpp:806-911`: `_fill_instance_data` escreve **um InstanceData por elemento** direto no buffer mapeado (`curr_gpu_ptr[...] = instance_data`, `:875`). `:877-893`: se o elemento tem **as mesmas duas chaves** do anterior (e não é multimesh nem skinned, `cant_repeat`), incrementa `repeats`: é o **instancing automático**.
- `render_forward_clustered.h:455`: `MAX_REPEATS = (1 << 20) - 1`.
- `render_forward_clustered.cpp:305-314`: `_render_list_template` liga os sets 0/1/2 **uma vez** por lista e depois itera elementos com estado anterior (`prev_shader`, `prev_pipeline_hash`, `prev_material_uniform_set`, `prev_vertex_array_rd`...), religando só o que mudou (`:547-575`).
- `render_forward_clustered.cpp:596` e `:598-614`: um push constant por draw (`base_index`, `uv_offset`, offsets de motion vectors), `draw_list_draw(..., instance_count)` com `instance_count = element_info.repeat` (`:598`). `:617`: `i += element_info.repeat - 1` (pula os elementos agrupados).
- `render_forward_clustered.cpp:626-640`: `_render_list` é um switch que instancia o template por `<PASS_MODE, color_pass_flags>` (if constexpr), pra tirar os branches do laço quente.
- `servers/rendering/renderer_rd/shaders/forward_clustered/scene_forward_clustered.glsl:770-775`: `instance_index = draw_call.instance_index + INSTANCE_INDEX` (exceto multimesh). Isso indexa `instances.data[]` (storage buffer, `scene_forward_clustered_inc.glsl:369`).

**Como funciona.** Cada superfície visível vira um ponteiro pra um cache pré-montado, já com a chave de 128 bits pronta. Ordena por chave e grava um registro de instância por elemento num storage buffer contíguo. Elementos consecutivos com a chave idêntica (mesma malha+material+shader+LOD) são **fundidos num draw instanciado**: o shader soma `gl_InstanceIndex` ao `base_index` do push constant e lê a transform do storage buffer. Não existe API de "instancing" pro usuário (fora MultiMesh). Ele surge da ordenação.

**Lição para nós.** É o desenho a copiar quase literalmente: (a) **chave de ordenação u64/u128 pré-calculada** por superfície (shader | material | geometria | LOD | profundidade grossa). (b) **Storage buffer de instâncias** reescrito por quadro (mapeado / `queue.write_buffer` único), com índice base por draw. (c) **Instancing automático** por "mesma chave consecutiva". (d) Laço de draw com "estado anterior" pra só religar o que mudou. No wgpu, `base_index` cabe no `first_instance` do `draw_indexed(..., base_instance..base_instance+n)`, e o shader usa `@builtin(instance_index)`, que **já inclui `first_instance`** em D3D12/Vulkan via wgpu. Isso dispensa push constant pro índice. (e) Sort em `std::sort` sobre ponteiros. O comentário do Godot sugere radix como próximo passo.

---

## 6. Luzes: buffers globais, clustering, direcionais separadas

**Citações**
- `servers/rendering/renderer_rd/storage_rd/light_storage.cpp:692-711`: `set_max_lights` cria `omni_light_buffer`/`spot`/`area` como **storage buffers** (`max_lights * sizeof(LightData)`) e `directional_light_buffer` como **UBO** de `MAX_DIRECTIONAL_LIGHTS`.
- `light_storage.cpp:714`: `update_light_buffers` roda por quadro sobre as luzes do cull. As direcionais vão pra `directional_lights[]` (`:740-865`, incluindo `shadow_split_offsets`, `:829`). Omni/spot recebem `depth = distance` (`:889`, `:914`) e são **ordenadas por distância** (`:949`) antes de truncar em `max_lights`.
- `light_storage.cpp:1248` / `:1260`: `buffer_update(omni_light_buffer, ...)` e `buffer_update(directional_light_buffer, ...)`, um upload por quadro.
- `render_forward_clustered.cpp:1410`: cada luz positional chama `current_cluster_builder->add_light(...)` (`cluster_builder_rd.h:236`).
- `servers/rendering/renderer_rd/cluster_builder_rd.h:193`: `cluster_size = 32` (tile de 32×32 px). `cluster_builder_rd.cpp:281-300`: `setup` define `cluster_screen_size = tela/32` e `max_elements_by_type` alinhado a 32 (bitmask), com buffer `w*h*(max/32+32)*ELEMENT_TYPE_MAX*4` bytes.
- `cluster_builder_rd.cpp:438-513`: `bake_cluster` **rasteriza os volumes das luzes** (esfera pra omni, cone pra spot, caixa pra area/decal/probe) num framebuffer de baixa resolução com instancing (`draw_list_draw`). `:523-539`: depois um **compute** (`cluster_store`) empacota em bitmasks por tile + faixas de profundidade (`compute_list_dispatch_threads(cluster_screen_size.x, .y)`).
- `render_forward_clustered.cpp:1646-1674`: no `_pre_opaque_render`, `cluster_builder->begin(...)`, os `add_*` e `bake_cluster()` a cada quadro.
- `servers/rendering/renderer_rd/shaders/forward_clustered/scene_forward_clustered.glsl:1544` (offset do tile) e `:2700-2730`: no fragment, lê o intervalo do tile, faz `subgroupBroadcastFirst(subgroupMin/Max/Or)` (`:2709-2716`) pra **uniformizar o laço na wave** e itera os bits (`findMSB`), com teste de `layer_mask`. `:2665` (`light_compute` das direcionais) é um laço simples sobre o UBO (`:1131`).
- Forward mobile: `servers/rendering/renderer_rd/forward_mobile/render_forward_mobile.h:62` (`MAX_RDL_CULL = 8`), `render_forward_mobile.cpp:2779-2781` (`get_max_lights_per_mesh`), `shaders/forward_mobile/scene_forward_mobile.glsl:541-543` (índices de luz empacotados em 8 bits no `InstanceData`). No clustered, `render_forward_clustered.h:609` retorna `0` (sem limite por objeto), e o cull CPU por objeto (`renderer_scene_cull.cpp:3019-3030`) só roda no mobile.

**Como funciona.** Todas as luzes positional do quadro moram em storage buffers globais, ordenadas por distância à câmera. O cluster é 2D por tiles de 32 px × fatias de profundidade, construído **na GPU rasterizando as malhas de volume das luzes**, com bitmask por tile. O fragment percorre só os bits do seu tile. As direcionais são um caso à parte (UBO pequeno, laço fixo). O mobile faz o oposto: CPU escolhe até 8 luzes por objeto e manda índices no registro de instância.

**Lição para nós.** Pra uma 1ª versão em wgpu, o **modelo mobile (≤8 luzes por objeto, índices no InstanceData) é bem mais simples** e cobre jogos com poucas luzes. O clustered vale quando houver dezenas de luzes pontuais (cidade à noite no DDD 61). Ao fazer o clustered: tile 2D de 32 px + bitmask é simples. A rasterização do volume pode virar um compute que testa esfera×frustum de tile, mais fácil em WGSL. As operações de **subgroup** exigem a feature `SUBGROUP` do wgpu/naga, e há fallback sem elas. Direcional sempre separada, em UBO.

---

## 7. Sombras: cascatas, atlas, cache e atualização parcial

**Citações**
- `servers/rendering/renderer_scene_cull.cpp:2146`: `_light_instance_setup_directional_shadow`. `:2167-2186`: 1/2/4 splits, com distâncias = `min + LIGHT_PARAM_SHADOW_SPLIT_n_OFFSET * range` (offsets configuráveis, **não** a fórmula log/lin automática).
- `renderer_scene_cull.cpp:2313-2319`: **estabilização**. O retângulo da cascata é `Math::snapped(..., unit)` com `unit = (radius+expand)*4/texture_size` (encaixe em texel, que evita "nadar"). `:2359`: `shadow_texel_size` por cascata.
- `renderer_scene_cull.cpp:2417` / `:2568`: cull de casters por cascata/luz com `indexers[INDEXER_GEOMETRY].convex_query(planes...)` (aqui sim usa o BVH).
- `renderer_scene_cull.cpp:3480-3490`: pra cada cascata, `light_instance_set_shadow_transform(..., projection, transform, zfar, split, j, texel_size, ...)` e enfileira em `render_shadow_data` (direcional = **todo quadro**).
- `renderer_scene_cull.cpp:3600-3641`: omni/spot só redesenham se `light->is_shadow_dirty()`, se o volume toca a câmera (`light_culler->prepare_regular_light`) e se `shadow_atlas_update_light(..., coverage, last_version)` disser que precisa (`:3630`), com teto `MAX_UPDATE_SHADOWS` por quadro (`:3632`).
- `servers/rendering/renderer_scene_cull.h:712-749`: `shadow_dirty_count` (2 quadros, ou 1 com múltiplas câmeras). Sujado por geometria que se move (`renderer_scene_cull.cpp:1709-1714`) ou pela própria luz (`:1624`).
- `servers/rendering/renderer_rd/storage_rd/light_storage.cpp:2591`: `shadow_atlas_update_light` escolhe a subdivisão do quadrante pela **cobertura em tela** (`coverage`). `:2649-2650`: só realoca se a subdivisão mudou **e** passou `shadow_atlas_realloc_tolerance_msec` (histerese). Só redesenha se a `version` mudou. `:2402`: `shadow_atlas_set_quadrant_subdivision` (atlas em 4 quadrantes, cada um subdividido em N×N).
- `light_storage.cpp:2753`: `update_directional_shadow_atlas` (textura própria das direcionais). `render_forward_clustered.cpp:2646-2660`: as cascatas são **quadrantes do retângulo da luz** no atlas direcional.
- `render_forward_clustered.cpp:2605` (`_render_shadow_pass`), `:2806` (`_render_shadow_append`: `_fill_render_list(RENDER_LIST_SECONDARY, ...)` + `sort_by_key_range`, `:2847-2849`), `:2882` (`_render_shadow_process`), `:2898` (`_render_shadow_end`): os passes de sombra são acumulados e depois executados em lote. `:1591-1611`: direcionais e spot/omni em sequência dentro do `_pre_opaque_render`.
- `render_forward_clustered.cpp:4223-4253`: material **opaco sem vértice customizado usa o material de sombra compartilhado** (`uses_shared_shadow_material` → `scene_shader.default_material`). Com isso, quase todo objeto cai no mesmo shader/pipeline na sombra e agrupa muito melhor.

**Como funciona.** Direcional: 1–4 cascatas com splits por parâmetro, retângulos encaixados em texel, re-renderizadas a cada quadro, cada cascata com cull convexo próprio via BVH. Omni/spot: um atlas em quadrantes, onde o tamanho do slot segue a cobertura de tela e a sombra é **cacheada** (só redesenha se luz ou caster pareado mudou, com teto por quadro). Na sombra o material é substituído por um padrão sempre que possível.

**Lição para nós.** Bate com o que o PRD-0009 já registra ("sombra do sol fica, e barata"): (a) cascatas com **texel snapping** obrigatório. (b) Cull de casters por cascata (BVH/convex), não reaproveitar a lista da câmera. (c) **Material de sombra compartilhado** pra opacos: na prática todos os draws de sombra viram um pipeline, com instancing automático. (d) Sombra de luz local **cacheada por versão** + teto de atualizações por quadro + atlas por cobertura. Um próximo passo barato pra nós seria atualizar a cascata distante a cada N quadros, coisa que o Godot **não** faz (direcional é todo quadro).

---

## 8. Pós-processamento e ordem das passes

**Ordem em `RenderForwardClustered::_render_scene`** (`servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.cpp:1704`):
1. `:1913-1921`: monta listas, ordena e preenche os instance buffers.
2. `:2071-2081`: `sky.setup_sky` + `sky.update_radiance_buffers` (cubemap/octmap de radiância pra reflexo/ambiente).
3. `:2123-2141`: **depth pre-pass** (opcionalmente com normal+roughness pra SSR/SSAO), `:2146-2154` resolve MSAA de profundidade.
4. `:2182` → `_pre_opaque_render` (`:1517`): sombras (`:1530-1611`), SSAO/SSIL/SSR (`:1614-1640`), **cluster** (`:1646-1674`), **fog volumétrica** (`:1678-1680`).
5. `:2188-2224`: **opaque pass**. `:2245-2250`: motion pass.
6. `:2297-2302`: **sky** depois do opaco (só preenche o fundo pelo depth test).
7. `:2337-2339`: SSS. `:2345`: merge specular. `:2367-2384`: cópia de screen/depth texture (pra shaders que leem a tela).
8. `:2411-2426`: **transparent pass**.
9. `:2463-2504`: FSR2 (temporal), ou `:2539-2540` **TAA** (`effects/taa.cpp:90`).
10. `:2548-2550`: `_render_buffers_post_process_and_tonemap`.

**Pós em `RendererSceneRenderRD::_render_buffers_post_process_and_tonemap`** (`servers/rendering/renderer_rd/renderer_scene_render_rd.cpp:455`): DOF (`:504-548`) → auto-exposure (`luminance_reduction`, `:557-570`) → **glow** (cadeia de downsample/blur gaussiano `gaussian_glow*`, `:581-668`) → **tonemap** (`:676-811`, `tone_mapper->tonemapper`) → SMAA (`:820-858`) → upscale espacial FSR1 (`spatial_upscaler->process`, `:874`) ou cópia bilinear pro alvo (`:882`).

**Tonemap em um passe** (`servers/rendering/renderer_rd/shaders/effects/tonemap.glsl:854`): exposição (`:864`) → **FXAA** (`:873-875`, antes do glow, pra preservar o *bleed*) → glow aditivo/screen/mix (`:878`) → `apply_tonemapping` (`:893`, Reinhard `:93`, Filmic `:99`, ACES `:119`, AgX `:179`) → glow softlight pós-tonemap → color correction por LUT 1D/3D (`:457-465`) → `linear_to_srgb` (`:230`) → dither (`:843`). Variantes por `#define` em `effects/tone_mapper.cpp:45-101`.

**Fog.** A fog simples é **por pixel no próprio shader da cena** (`scene_forward_clustered.glsl:1102` `fog_process`, aplicada em `:1493`), sem passe extra. A volumétrica é uma textura 3D de froxels calculada em compute (`environment/fog.cpp:568` `volumetric_fog_update`) e amostrada no fragment (`scene_forward_clustered.glsl:1091-1099`, `:1501`).

**Lição para nós.** A cadeia mínima viável é **opaco → sky → transparente → [TAA] → (glow) → tonemap+FXAA num único fullscreen pass**. Juntar exposição + FXAA + glow-composite + tonemap + LUT + sRGB + dither num só shader economiza passes e banda (decisão boa pra Full HD). Fog simples no shader da cena, não como pós. Sky depois do opaco com depth test. Pré-passe de profundidade só se houver efeito de tela que o exija ou overdraw medido.

---

## 9. Render targets, viewports, escala de resolução, MSAA

**Citações**
- `servers/rendering/renderer_viewport.cpp:782`: `draw_viewports`. `:98-134`: `_sort_active_viewports` em **ordem topológica**, filhos (SubViewports) antes dos pais, pra que o pai amostre a textura do filho no mesmo quadro. `:815-843`: `update_mode` (DISABLED / ONCE / ALWAYS / WHEN_VISIBLE via `render_target_was_used` / WHEN_PARENT_VISIBLE).
- `renderer_viewport.cpp:136` (`_configure_3d_render_buffers`): calcula `render_width = target_width * scaling_3d_scale` (`:239-240`), com fallbacks por backend do modo de escala (`:143-216`). `:279-300` (`internal_size` em `:279`, `configure` em `:300`): `RenderSceneBuffersConfiguration` com internal_size, target_size, scaling_3d_mode, msaa_3d, screen_space_aa, fsr_sharpness, **texture_mipmap_bias = log2(scale)** (`:284`), use_taa → `render_buffers->configure`.
- `renderer_viewport.cpp:305` / `:332`: `_draw_3d` → `RSG::scene->render_camera(render_buffers, camera, scenario, viewport, internal_size, ...)`.
- `servers/rendering/renderer_rd/storage_rd/render_scene_buffers_rd.cpp:155`: `configure` cria `RB_TEX_COLOR` (`:186`), `RB_TEX_DEPTH` (`:192`) e, com MSAA, `RB_TEX_COLOR_MSAA` (`:199`). `:292` `create_texture(context, name, ...)` e `:391` `get_texture(...)`: **texturas nomeadas por (escopo, nome)** num `HashMap<NTKey, NamedTexture>`, criadas sob demanda por cada efeito (SSAO, glow, TAA guardam as suas).
- `renderer_scene_render_rd.cpp:473-492`: escolhe se pós-processa no tamanho interno ou já no upscalado (FSR2/MetalFX temporal). `:874`/`:882`: upscale espacial ou cópia filtrada pro framebuffer do render target (`render_target_get_rd_framebuffer`, `:787`).
- `servers/rendering/renderer_rd/storage_rd/texture_storage.cpp:4419` (`render_target_create`), `:4263` (`_update_render_target`, formato HDR ou não, `:4283`), `:4711` (`render_target_get_rd_texture`): o render target é a textura final que um ViewportTexture amostra.

**Como funciona.** Viewport = câmera + cenário + render target + `RenderSceneBuffers`. Os buffers da cena são um **dicionário de texturas nomeadas no tamanho interno**, e o resultado é escalado pro tamanho do alvo no fim (espacial) ou no meio (temporal). Viewports secundários (espelho, minimapa, câmera de segurança) são viewports comuns renderizados antes do pai, com políticas de atualização pra não custar todo quadro.

**Lição para nós.** (a) "**internal size × target size**" desde o primeiro dia: render 3D em resolução reduzida + upscale bilinear/FSR1 no blit final é o maior multiplicador de fps barato que existe (e o PRD-0009 já fala de supersampling/Full HD). Lembrar do **mip bias = log2(scale)**. (b) Buffers de cena como **mapa de texturas nomeadas sob demanda**: cada efeito pede o que usa, sem uma struct gigante. (c) Render-to-texture = mesmo caminho do viewport principal, ordenado filho→pai, com `update_mode` (o espelho do DDD 61 se beneficiaria de WHEN_VISIBLE/ONCE).

---

## 10. Transparência e partículas

**Citações**
- `render_forward_clustered.cpp:1145-1150`: superfície com `FLAG_PASS_ALPHA` (ou `force_alpha`) vai pra `render_list[RENDER_LIST_ALPHA]`. A opaca vai pra lista principal. Uma superfície pode estar em ambas (pré-passe de profundidade + alpha).
- `render_forward_clustered.cpp:961`/`:966`: `inst->depth` = distância do centro do AABB (ou ponto de suporte) ao plano near/câmera, com `sorting_offset` do usuário.
- `render_forward_clustered.h:722-731` + `render_forward_clustered.cpp:1916`: alpha é ordenado por `priority`, depois **profundidade decrescente** (trás pra frente), **por instância**, não por triângulo.
- `render_forward_clustered.cpp:2411-2426`: passe transparente separado, sem motion vectors (`:2420-2422`), num framebuffer só de cor. Ele roda depois da cópia de screen texture (`:2367`), e é isso que permite refração.
- `render_forward_clustered.cpp:4212-4219`: material que lê stencil é forçado na fila alpha.
- Partículas (GPUParticles): `servers/rendering/renderer_rd/storage_rd/particles_storage.cpp:785` `_particles_process` (compute `particles.glsl`, dispatch em `:1230`). `:1236` `particles_set_view_axis` faz sort por eixo da câmera: preenche o buffer de sort (`COPY_MODE_FILL_SORT_BUFFER`, `:1270`/`:1328`) e `sort_effects->sort_buffer` (`:1331`, sort em GPU). Depois o compute `particles_copy.glsl` escreve as **transforms de instância** (`COPY_MODE_FILL_INSTANCES[_WITH_SORT_BUFFER]`, `:1339-1350`). `:1442` `update_particles` roda uma vez por quadro (chamado em `rendering_server_default.cpp:103`). O cull só pede processamento se visível (`renderer_scene_cull.cpp:2994-3005`, `particles_request_process` em `:3000`).

**Como funciona.** Transparência = lista própria, ordenada por instância de trás pra frente, desenhada depois do opaco/sky, sem gravar motion. Partículas são simuladas em compute e desenhadas como um multimesh cujo buffer de instâncias foi escrito pela GPU (com sort em GPU quando pedido).

**Lição para nós.** Sort por instância (centro do AABB) + `sorting_offset`/`priority` editável resolve 95% dos casos. Transparente sem escrever motion/depth. Partículas: começar em CPU escrevendo o mesmo **storage buffer de instâncias** do tópico 5 (mesmo caminho de draw). Compute + sort GPU só se a contagem justificar.

---

## 11. Skinning (skeleton storage + compute)

**Citações**
- `servers/rendering/renderer_rd/storage_rd/mesh_storage.cpp:2389`: `skeleton_bone_set_transform` grava na `skeleton->data` (CPU) e chama `_skeleton_make_dirty` (`:2331-2335`, lista encadeada de sujos).
- `mesh_storage.cpp:2361`: o skeleton tem um **storage buffer** `data.size()*sizeof(float)`. `:2490-2508`: `_update_dirty_skeletons` faz **um `buffer_update` por skeleton sujo por quadro** (chamado de `storage_rd/utilities.cpp:256`).
- `mesh_storage.cpp:1063-1064`: cada `MeshInstance` (malha + skeleton) tem **vertex buffers próprios** criados com `BUFFER_CREATION_AS_STORAGE_BIT` (destino do compute).
- `mesh_storage.cpp:1149-1253`: `update_mesh_instances` abre **uma compute list** (`:1166`), percorre `dirty_mesh_instance_arrays` e, por superfície, liga o pipeline `skeleton_shader.pipeline[2D|3D]` (`:1203`), os sets instance/surface/skeleton (`:1205-1210`) e o push constant (has_normal/tangent/skeleton/blend_shape, `:1215-1218`). Termina com `compute_list_dispatch_threads(vertex_count)` (`:1253`). Chamado pelo cull antes de render/sombras (`renderer_scene_cull.cpp:3468`, `:2442`).
- `servers/rendering/renderer_rd/shaders/skeleton.glsl:7` (`local_size_x = 64`), `:12-37` (dst_vertices, blend_shape_weights, src_vertices, src_bone_weights, src_blend_shapes, bone_transforms), `:123` main: aplica blend shapes (`:134-151`) e depois 4 ossos com pesos (`:161-162`), reescrevendo posição/normal/tangente no buffer destino.
- `render_forward_clustered.cpp:503-504`: no draw, se a superfície tem `mesh_instance`, usa `mesh_instance_surface_get_vertex_arrays_and_format` (os vértices **já deformados**). Pro shader da cena é uma malha estática comum.
- `render_forward_clustered.cpp:877`: `cant_repeat = ... || inst->mesh_instance.is_valid()`. Malha skinned **nunca entra no instancing automático** (cada uma tem seu buffer).

**Como funciona.** Skinning é um pré-passe de compute: ossos (CPU) → storage buffer → compute deforma os vértices pra um vertex buffer por instância → o shader de cena não sabe que existe skeleton. Isso mantém o shader de cena e as variantes de pipeline sem a dimensão "skinned", e a malha deformada é reaproveitada em todos os passes (profundidade, sombra × cascatas, cor, motion).

**Lição para nós.** Ótimo encaixe com wgpu: **um compute pass** no começo do quadro pra todos os personagens sujos, em vez de skinning no vertex shader repetido em cada passe (com 4 cascatas + pré-passe + cor, o vertex skinning roda 6×). Custo: VRAM de um vertex buffer por instância skinned e nada de instancing pra elas. Pros NPCs instanciados do DDD 61 (bake), que já fogem disso, manter o caminho de lote baked separado. Uploads de osso: um `write_buffer` por skeleton sujo, ou um buffer de ossos global com offsets.

---

## Resumo das escolhas que mais pesam pro nosso renderer

| Tema | Godot faz | Para wgpu/WGSL |
|---|---|---|
| Fronteira JS→nativo | RID (índice+geração) + fila de comandos | handles u32 + buffer de comandos em lote |
| Cull de câmera | array SoA de AABB, laço linear, multithread acima de limiar | idem; BVH só pra sombra/luz |
| Material | chave POD de flags → shader gerado (cache global); params em UBO | WGSL gerado por template + cache; params em storage/UBO |
| Variantes | poucas compiladas + spec constants + ubershader async | `override` do WGSL + ubershader com uniform; pipelines em worker |
| Draw | sort key 128 bits + storage buffer de instâncias + instancing automático por chave igual | idem; `first_instance` como índice base |
| Luzes | clustered (tile 32 px, bitmask), direcional em UBO | começar com ≤8 luzes por objeto (modelo mobile) |
| Sombra | cascatas com snap; atlas por cobertura com cache; material de sombra compartilhado | idem |
| Pós | um passe: exposição+FXAA+glow+tonemap+LUT+sRGB+dither | idem |
| Resolução | internal × target + upscale; mip bias | desde o 1º dia |
| Skinning | compute pré-passe → VB por instância | idem |
