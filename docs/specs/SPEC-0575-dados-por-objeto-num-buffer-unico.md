# SPEC-0575 — R1.6: dados por objeto num buffer único (modelo Godot)

**Data:** 2026-10-24
**Status:** proposta (estudo). **Não implementado.** Entra no R1.6, depois que as recusas do R1
fecharem; **só fica se ganhar** no A/B (decisão do usuário, PRD-0466, item do R1.6).

Etapa do R1.6 do PRD-0466 (ADR-0465). Base: SPEC-0495 (grupos fixos, bloco do objeto), SPEC-0555
(instâncias do R1.4).

## Contexto

Cada objeto que o renderer próprio desenha tem hoje o **seu** bind group no grupo 3. O replay C++
(`native/src/render/draw_batch.cpp`) elimina estado redundante, mas o grupo 3 muda a cada draw por
definição: um `setBindGroup` por objeto, mais a criação desse bind group quando o objeto entra. O
Godot faz o contrário: um buffer com os dados de todas as instâncias, ligado uma vez, e o draw só
diz o índice.

## Como o Godot faz (clone 4.7.2 `ed1daf0b`, `servers/rendering/renderer_rd/`)

- **O dado:** `SceneState::InstanceData` (`forward_clustered/render_forward_clustered.h:334-348`):
  transform 3×4, AABB comprimida, `uv_scale`, `flags`, offsets (uniformes por instância, GI), `layer_mask`,
  transform anterior (vetores de movimento), `lightmap_uv_scale`.
- **Um storage buffer por lista de render:** `instance_buffer[p_render_list]`, que só cresce
  (`grow_instance_buffer`, `render_forward_clustered.cpp:790-800`; mínimo
  `INSTANCE_DATA_BUFFER_MIN_SIZE = 4096` elementos, `render_forward_clustered.h:75`), ligado no
  conjunto do passe (`render_forward_clustered.cpp:3422-3429`).
- **Preenchido inteiro a cada quadro:** `_fill_instance_data` (`render_forward_clustered.cpp:805-913`)
  percorre os elementos da lista, escreve um `InstanceData` por elemento num ponteiro mapeado
  (`map_raw_for_upload`, `:819`) e dá um `buffer_flush` no fim (`:912`). **Não há rastreio de sujos**:
  o custo é linear e sem ramificação.
- **O índice:** push constant `base_index = i + element_offset` (`render_forward_clustered.cpp:355`;
  campo em `render_forward_clustered.h:327`); no shader, `uint instance_index = draw_call.instance_index`
  (`shaders/forward_clustered/scene_forward_clustered.glsl:770`), e o buffer é
  `layout(set = 1, binding = 2, std430) buffer restrict readonly InstanceDataBuffer { InstanceData data[]; } instances`
  (`scene_forward_clustered_inc.glsl:369-372`), lido como `instances.data[instance_index]` (`:256`, `:367`, …).
- **Multimesh** (instâncias de verdade) usa outro buffer, indexado pelo `gl_InstanceIndex` do draw.

## Como fazemos hoje

- **Grupo 3 (bloco do objeto):** `mat4` do modelo + matriz normal (3 × `vec4`) = 112 B usados num
  slot de 256 B (`UNIFORM_ALIGN_BYTES`), em chunks `native.objects` de 256 slots
  (`OBJECT_SLOTS_PER_CHUNK`, `NativeRenderer.ts`). **Um bind group por objeto** (com offset fixo no
  chunk), criado em `_build`; o skinned usa outro layout, com o storage de ossos no binding 1.
- **Escrita:** por objeto que se moveu, um `writeBuffer` de 112 B (`_refreshInstance`,
  `NativeRenderer.ts:608`): N escritas pequenas por quadro.
- **Instâncias do R1.4:** `instanceMatrix`/`instanceColor` como **vertex buffers**
  `stepMode: 'instance'` (`_instanceSet`); o modelo lê `nativeModel(vin)` com as 4 colunas.
- **Comando do lote:** 4 inteiros (receita, `count`, instâncias, `first`), sem `firstInstance`
  (`draw_batch.h:52`, `DrawBatch.ts:253-264`).

## Validação de aplicabilidade (WebGPU / wgpu / D3D12 / naga / Hermes)

- **Um storage `read-only-storage` no grupo 3, ligado uma vez por passe:** dentro dos limites
  padrão do WebGPU (`maxStorageBuffersPerShaderStage` 8, uso no vértice permitido;
  `maxStorageBufferBindingSize` 128 MiB = ~1,2 M objetos de 112 B). No grupo 3 passa a haver **um**
  bind group (mais um para o skinned, com os ossos).
- **O índice por `firstInstance` → `@builtin(instance_index)`:** o WebGPU não tem push constant, e o
  `firstInstance` do `draw`/`drawIndexed` chega ao shader somado ao `instance_index`. No D3D12, o
  `SV_InstanceID` **não** inclui o `StartInstanceLocation`; o wgpu/naga compensa com uma constante
  especial no HLSL (premissa já usada na SPEC-0495 §5). **Isso exige sonda de pixel antes do código**
  ("compilou não prova nada no naga"). Custo: uma raiz constante por draw no backend D3D12, coberta
  pela medição.
- **Instâncias do R1.4 somam ao mesmo esquema:** os dados de instância saem do vertex buffer e entram
  no **mesmo storage**, numa faixa contígua `[base, base + count)`. O draw usa `firstInstance = base`
  e `instanceCount = count`, e `instance_index` já é o índice certo da instância. Objeto comum é o
  caso `count = 1`. Restrição do WebGPU: com `firstInstance ≠ 0`, um vertex buffer `stepMode: 'instance'`
  também seria deslocado. Por isso as instâncias precisam sair do vertex buffer (vão para o storage)
  **na mesma mudança**. O `instanceColor` vai junto (mais um `vec4` por instância, ou uma faixa
  paralela).
- **Comando do lote:** precisa de um 5º inteiro (`firstInstance`), ou de uma receita por
  `firstInstance`. O 5º inteiro é o menor (C++ `DrawCommand`, `kCommandInts = 5`, emissor com
  `firstInstance`) e mantém uma receita por pipeline + geometria, e não por objeto. Isso também tira
  do JS a criação de bind group por objeto.
- **Escrita por quadro:** um `writeBuffer` só, cobrindo as faixas sujas contíguas (ou o array
  inteiro, como o Godot, se a medição mostrar que é mais barato que o rastreio: 3000 objetos ×
  112 B ≈ 336 KB por quadro). O espelho já sabe quem se moveu (SPEC-0234/0322): um `Float32Array`
  JS com o layout do storage, `set` por objeto sujo e uma cópia no fim do quadro.
- **Hermes:** nada de `for…of` em `Map` nem closure de laço no caminho por quadro; o laço de sujos é
  sobre arrays tipados.
- **Ordem do three e paridade:** o índice não entra na chave de ordenação (o `painterSortStable` não
  muda); a receita deixa de ser por objeto, e o replay continua emitindo na mesma ordem.

## Desenho

1. **Storage `native.objects`** (grupo 3, binding 0, `read-only-storage`, vértice): array de
   `struct NativeObject { model : mat4x4<f32>, normal : mat3x3<f32> }` (112 B, `std430`; o `mat3x3`
   ocupa 3 × `vec4`). Capacidade que dobra; trocar o buffer reconstrói o único bind group e invalida
   as receitas (o mecanismo de geração que já existe).
2. **Alocador de faixas:** objeto comum = 1 slot; `InstancedMesh` = `count` slots contíguos (realoca
   quando `count` cresce). Lápide e reuso como os slots de hoje.
3. **WGSL do núcleo:** `nativeModel(vin)` = `objects[vin.instance].model`;
   `nativeNormalMatrix(vin)` = `objects[vin.instance].normal`. O instanciado deixa de ter atributos de
   instância no `VIn`. Os modelos não mudam (a costura da SPEC-0495 já isola isso).
4. **Comando:** `(receita, count, instâncias, first, firstInstance)`; o `DrawBatch.ts` e o
   `draw_batch.*` passam a usar 5 inteiros.
5. **Interruptor:** `?nativeObjects=storage|ubo` (padrão `ubo` até o A/B aprovar), para a medição
   alternar sem dois builds.

## Ganho esperado e como medir

- **Esperado (a confirmar):** some 1 `setBindGroup` por draw nativo no replay (~100 draws/quadro nos
  pontos do DDD 61 no checkpoint da R1.2) e N `writeBuffer` pequenos viram 1. Na CPU de render, da
  ordem de décimos de ms por quadro; a memória por objeto cai de 256 B para 112 B. Na GPU, ler
  storage em vez de UBO com offset é neutro ou levemente pior; por isso a medição olha também o tempo
  de GPU.
- **Medição (kit SPEC-0382):** A/B intercalado com o mesmo export (`?nativeObjects=ubo` × `storage`),
  2 réplicas, 4 pontos `walk` + `drive` no Hélio, 1080p, jogo no mesmo commit nos dois braços.
  **Critério:** queda de `render` (CPU) ou do tempo de GPU acima do ruído das réplicas, sem piorar
  `frameMs` p95. Sem ganho, o item sai (não fica "por arquitetura").
- **Antes do A/B:** sonda de pixel do `firstInstance` no D3D12 (um quad com `firstInstance = 5`
  tem de ler `objects[5]`), galeria e check-stage na paridade com o interruptor ligado.

## Testes (na implementação)

- Vitest: alocador de faixas (1 slot, faixa de instâncias, crescimento, lápide), codificação de 5
  inteiros, layout `std430` do `NativeObject` × offsets do `Float32Array`, uma escrita por quadro com
  sujos espalhados.
- `cortex_host_tests`: `DrawCommand` com `firstInstance` e o emissor repassando o valor.
- Paridade: galeria (com instâncias e skinned) e `check-stage` PASS; `nativeTint` FAIL.

## Riscos

| risco | cobertura |
| --- | --- |
| `firstInstance` não chega ao `instance_index` no D3D12/naga | sonda de pixel antes do código; sem ela, o item para |
| instância com vertex buffer deslocado por `firstInstance` | as instâncias vão para o storage na mesma mudança |
| reescrever o array inteiro custa mais que os sujos | as duas estratégias medidas (é um parâmetro, não uma decisão de desenho) |
| ganho dentro do ruído | o critério é ganho medido; sem ganho, o item sai |
