# SPEC-0495 — R1.1: servidor de render, handles, formato de material e modelo `unlit`

**Data:** 2026-10-24
**Status:** **desenho, sem código.** A implementação espera o R0 (que só começa depois que
o RenderingServer fechar os itens restantes, decisão do usuário em 2026-10-24). Se o censo
do R0 mudar algo daqui, este registro é atualizado antes do código.

Etapa R1.1 do PRD-0466 (ADR-0465). Formato do bloco de vista e das luzes: SPEC-0475.

## Escopo

Entra: o servidor (RIDs, fila de comandos, cache de pipeline), a ponte, a parte da fachada
que traduz material/geometria/textura e o modelo **`unlit` opaco**: céu, sinais e
letreiros do DDD 61. Tudo emitido dentro da pass do `three`, no ponto em que o RS1 já
emite. Fica com o `three`, por objeto: todo o resto, inclusive `unlit` transparente ou
aditivo (vai para o R1.4).

## Como o Godot faz (arquivo:linha no anexo `docs/prds/0466-anexos/godot-renderer-rd.md`, §1, §3, §4)

- RID = índice + geração; `create` aloca na hora (`core/templates/rid_owner.h:157-163`,
  `servers/server_wrap_mt_common.h:58`).
- Material = chave POD de flags + bloco de parâmetros; cor não entra na chave
  (`scene/resources/material.h:358-411`, `material.cpp:2122-2124`,
  `storage_rd/material_storage.cpp:1155-1180`).
- Pipeline por chave POD com especialização (`scene_shader_forward_clustered.h:101-133`,
  `:191-217`).

## Como fazemos aqui

O RS1 (`src/render/RenderServer.ts`) oferece cada instância elegível, confere o instantâneo
da b.1 e anexa 4 inteiros por instância à lista nativa, emitida em trechos intercalados com
o `three` pela chave do `painterSortStable`. O lote C++ (`native/src/render/draw_batch.*`)
emite receitas = (pipeline, até 4 grupos, até 8 VBs, índice) com eliminação de estado
redundante. As receitas são handles do `three`.

## Validação de aplicabilidade

- **wgpu/naga:** pipelines e WGSL criados em C++, como o passe de sombra já faz
  (`shadow_pass.cpp`); `override` provado (SPEC-0238). Shader novo só vale com sonda de pixel.
- **Hermes:** a fachada chama a ponte por quadro uma vez, com um buffer de comandos; nada de
  `for…of` em `Map`, `let` em closure de `for` nem getter via `super`.
- **Xbox:** nada fora do `webgpu.h` que o host já usa.

## Desenho

### 1. Handles

- `u32` = `índice (24 bits) | geração (8 bits)`. Cabe num `Int32Array` e num `number` do JS
  sem perda.
- Um dono por tipo: `mesh`, `texture`, `material`, `instance`, `view`. O slot é liberado na
  lápide, e a geração sobe. Handle velho é recusado com contador (`staleHandle`), nunca
  desreferenciado.
- Criação é **síncrona** (é rara e devolve o handle na hora). Mutação por quadro vai pela
  fila (§3).

### 2. Geometria e textura: criadas pelo shim WebGPU no JS, entregues por handle

- A fachada cria o `GPUBuffer` (`device.createBuffer` + `writeBuffer`) e a `GPUTexture`
  (`createTexture` + `copyExternalImageToTexture`/`writeTexture`) com as **mesmas chamadas
  que o `three` faz hoje**. Isso reaproveita sem código novo KTX2 (BC7 com mips), canvas 2D,
  `ImageBitmap`, `DataTexture` e atributos intercalados (GLB cozido, memória
  "GLB cozido vem interleaved").
- `meshCreate(layout, buffers[], index?)` e `textureCreate(gpuTexture, sampler)` entregam os
  objetos ao C++, que os desembrulha como o `__cortexUiLayer` já faz e guarda com `AddRef`.
- `layout` = por atributo: semântica (`position`, `normal`, `uv`, `color`), formato, stride,
  offset e índice do buffer. Atributo desconhecido = recusa do objeto.
- Mudança: `attribute.version` / `texture.version` → reescrita pelo shim (`writeBuffer` /
  cópia) no mesmo handle; troca de tamanho → handle novo.

### 3. Fila de comandos por quadro

Um `ArrayBuffer` externo (memória do C++, como o `syncBuffer` do espelho) com dois trechos
(`Int32Array` de cabeçalhos e `Float32Array` de dados). O JS escreve e chama
`__cortexRenderServer.flush(nCommands)` **uma vez por quadro**, antes do render.

| opcode | carga | quando |
| --- | --- | --- |
| `INSTANCE_SET` | instance, nó do espelho, mesh, material, flags (`castShadow`, `receiveShadow`, layer), `renderOrder` | malha entra na cena; troca de geometria/material |
| `INSTANCE_FREE` | instance | malha sai da cena |
| `MATERIAL_PARAMS` | material, deslocamento e quantidade de floats no trecho de dados | conferência acusou mudança (§4) |
| `VIEW_SET` | view, nó da câmera, near/far/fov, alvo | por vista por quadro (dados da SPEC-0475) |

Transform e visibilidade **não** passam por aqui: já estão no espelho (`update`).

### 4. Formato de material

- `MaterialKey` (64 bits, entra na chave do pipeline): modelo (`u8`), features (`u32`: `map`,
  `vertexColors`, `alphaTest`, `fog`, `toneMapped`) e estado (blend, cull, `depthTest`,
  `depthWrite`, `polygonOffset`).
- **Bloco de parâmetros** por modelo, `std140`, fonte única num header C++
  (`material_layout.h`). A fachada lê os deslocamentos do host na instalação
  (`__cortexRenderServer.layout('unlit')`) e **recusa instalar** se não baterem com a tabela
  TS. É o mesmo padrão de "instalar recusando" da b.1.
  - `unlit`: `color` (vec3) + `opacity`; `mapTransform` (3 × vec4, a `uvTransform` que o
    `three` compõe de offset/repeat/rotation/center); `alphaTest`.
- Tradutor (`MaterialDesc` estendido): `MeshBasicMaterial` / `MeshBasicNodeMaterial` sem nó →
  `unlit`. Qualquer nó, `envMap`, `alphaMap`, `lightMap`, `aoMap`, `specularMap`,
  `wireframe`, `transparent`, `blending` ≠ normal, `onBeforeRender` ou material em array →
  recusa com motivo (vai para o censo).
- **Detecção de mudança:** por material vivo (referenciado por instância viva), um
  instantâneo do bloco em `Float32Array`, recomposto e comparado por quadro. Diferença →
  `MATERIAL_PARAMS`. `material.version` mudou → retradução (pode trocar a chave e o pipeline).
  Orçamento: ≤ 2 µs por material vivo (medido no R1.1 com contador; acima disso, ganchos).

### 5. Grupos e shader

Layout fixo para todos os modelos (alinhado com a SPEC-0475):

| grupo | conteúdo | frequência |
| --- | --- | --- |
| 0 | bloco de vista (UBO) + instâncias da lista (storage: `mat4` mundo + 3 × `vec4` normal) | 1×/vista/quadro |
| 1 | luzes (storage + contagem); vazio no `unlit` | 1×/vista/quadro |
| 2 | bloco do material (UBO com offset dinâmico num buffer de materiais) + texturas + sampler | por troca de material |

- A instância é lida por `@builtin(instance_index)` (inclui `first_instance` no wgpu).
- A matriz de mundo vem do espelho (double), convertida para float **como o `three` faz no
  upload** (paridade antes de precisão; relativo à câmera fica para quando um jogo pedir).
- A fórmula do `unlit` (cor × map × vertex color, alphaTest, névoa linear, tone mapping e
  espaço de cor de saída conforme `toneMapped`/estado da vista) é portada do WGSL que o
  `three` 0.184 gera para os estados `unlit` do DDD 61 (instrumento do R0).

### 6. Pipelines

- Chave = `MaterialKey` + layout de vértice + formato de cor/profundidade + amostras do alvo
  da pass em que vai emitir. `pipeline_cache.h` (hoje sem consumidor) é o cache.
- R1.1 cria na 1ª necessidade, fora da emissão (no `flush`), e conta `pipelineCreated` por
  quadro. Pré-compilação no load e ubershader são da R1.6.

### 7. Emissão (ainda dentro da pass do `three`)

- O C++ monta a lista: instâncias com nó visível no cull do quadro (`main_pass_culler`), com
  a chave do `painterSortStable` (`renderOrder`, `z`, `id`).
- A fachada intercala a lista com a RenderList do `three` pela mesma chave, pelo mecanismo de
  trechos do RS1. Cada trecho vira um `__cortexDrawBatch.flush` com receitas próprias
  (pipeline e grupos do servidor), o que reaproveita `RecipeStore`/`replay` sem mudança.
- Custo JS por instância limpa na R1.1: ≤ o da oferta do RS1 (~5,5 µs; um inteiro por
  instância no intercalado). Zero JS por instância limpa só na R1.6, quando o servidor for
  dono da pass.
- Instância do servidor não vai à RenderList do `three` (não tem render object nem estado de
  shader no `three`). Recusa por objeto = o `three` desenha como hoje.

### 8. Interruptores

- `?nativeRenderer=0|1` (padrão **0** até o aceite do R1).
- `?nativeRendererModels=unlit` limita os modelos ligados (A/B por etapa).
- `?nativeRenderer=1` exige `?renderServer=1` e `?nativeMainPass=1` (usa a projeção e o
  intercalado); com eles desligados, não instala e loga o motivo.
- Studio: nada instala (sem ponte).

## Testes

- Vitest: tradutor (`unlit` aceito; cada recusa com motivo); instantâneo do bloco (mudança de
  cor/opacidade/offset gera `MATERIAL_PARAMS`, parado não gera); codificação da fila;
  instalação recusa com layout divergente.
- `cortex_host_tests`: dono de handles (geração, lápide, handle velho recusado); decodificação
  da fila; chave de pipeline (cor fora da chave); `material_layout.h` × deslocamentos
  esperados.
- Sonda de pixel do `unlit` (render offscreen + `mapAsync`): cor, `map` com transform, vertex
  color **com** `map` (o caso que sai branco no naga), alphaTest, névoa.

## Critério de aceite da etapa (mergeável desligada)

- testes verdes;
- galeria de materiais `unlit` na paridade (`render-parity.mjs`, ruído dos pares de controle);
- A/B walk (Comercial e Centro, 2 réplicas) com `?nativeRenderer=1&nativeRendererModels=unlit`
  × controle: render sem regressão, com o censo relatando quantas instâncias foram ao servidor
  (número esperado: ≈ draws `unlit` opacos do censo do R0);
- `?parityFreeze` + `?parityTarget=renderer` no Setor O e no Comercial no nível do controle,
  com o instrumento relatando as trocas;
- `pipelineCreated` = 0 por quadro em regime; `staleHandle` = 0.

## Riscos

| risco | cobertura |
| --- | --- |
| formato do alvo da pass muda (amostras, HDR com bloom) | o formato entra na chave; um pipeline por formato; sonda nos dois |
| desembrulhar `GPUBuffer`/`GPUTexture` do shim com vida diferente do `three` | `AddRef` no C++; a fachada só libera depois do `INSTANCE_FREE` de quem usa (o `destroy` do host já é adiado em 10 quadros, ADR-0153) |
| tradução recusa demais e o ganho some no ruído | o A/B relata a cobertura; o ganho da R1.1 sozinha pode ser pequeno (o `unlit` opaco é minoria no DDD 61). O critério é "sem regressão + cobertura", não ganho |
