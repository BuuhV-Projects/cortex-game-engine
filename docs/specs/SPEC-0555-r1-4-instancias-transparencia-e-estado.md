# SPEC-0555 — R1.4: instâncias, transparência e estado de pipeline no núcleo do renderer nativo

**Data:** 2026-10-24
**Status:** implementado (2026-10-24, `d91fce5e`), desligado por padrão (`?nativeRenderer=1`).
"Como ficou" (abaixo) vale sobre o desenho onde diverge.

## Como ficou

- Tudo como no desenho, mais uma correção: a projeção não oferece objeto com
  `material.visible = false` ao servidor (antes o renderer próprio desenharia o que o `three`
  esconde).
- `check-stage r1-4-nucleo`: galeria PASS (0/0), Setor O e Comercial **noite PASS**, fumaça PASS
  (render 12,6 ms); **dia FAIL** só no céu (domo `ceu`: `unlit` opaco, vertex color, `renderOrder −1`,
  1º objeto com cor de vértice reescrita a cada quadro que o renderer próprio desenha). Diagnóstico
  na seção "Céu de dia" abaixo.

Etapa R1.4 do PRD-0466 (ADR-0465), Frente C. Base: R1.1 (SPEC-0495, "Como ficou"). Arquivos
exclusivos da frente: `NativeRenderer.ts`, `models/NativeModel.ts`, `models/unlit.ts`,
`RendererClassifier.ts`, `RenderServer.ts`, `NativeMainProjection.ts` e os testes deles.

## Escopo

Entra no núcleo (vale para todo modelo, inclusive os da Frente A):

- `InstancedMesh`: `instanceMatrix` e `instanceColor`, `count` lido por quadro;
- estado de pipeline: `transparent`, aditivo, `depthWrite: false`, `polygonOffset`, `renderOrder`;
- **lista de transparentes** emitida dentro de `_renderTransparents` com a chave do
  `reversePainterSortStable`, intercalada com os transparentes do `three`;
- transparente `DoubleSide` em **duas passadas** (trás e depois frente), como o `three`;
- buffer dinâmico: `attribute.version` (já existia) + `drawRange` e `count` por quadro
  (marcas de pneu, partículas);
- no modelo `unlit`: `alphaTest`, alfa real quando não é opaco e `instanceColor`.

Fica fora:

- `instancePaint`: é um atributo do jogo lido por `colorNode` TSL (carros estacionados,
  `parkedCars.ts:22`). Entra pela API de WGSL do jogo no R1.5 (SPEC-0565); o núcleo do R1.4 já
  aceita `InstancedBufferAttribute` da geometria com `stepMode: 'instance'`;
- `premultipliedAlpha`, `alphaToCoverage`, `stencilWrite`, `depthTest: false`, `CustomBlending`:
  recusa com motivo. O censo do DDD 61 não usa nenhum deles.

## O que o DDD 61 usa (censo do R0, 5 pontos)

Classes `unlit` que dependem do núcleo (amostras somadas):
`additive+instanceColor+instanced+map+noDepthWrite+renderOrder+transparent` (10),
`additive+doubleSide+fog+noDepthWrite+renderOrder+transparent` (10),
`noDepthWrite+noToneMap+renderOrder(+transparent)+vertexColors` (10, céu e nuvens),
`instanceColor+instanced` (5), `doubleSide+fog+noDepthWrite+polygonOffset+renderOrder+transparent`
(5, marcas), `fog+instanced+noDepthWrite+polygonOffset+transparent` (4, `tiro-marca`) e outras.
Lambert/standard instanciados (`interiores-*`, portas) ficam com a Frente A: o núcleo já entrega
a instância, e o modelo só precisa aceitar a variante.

## Como o Godot faz (4.7.2 `ed1daf0b`, clone do anexo `docs/prds/0466-anexos/godot-renderer-rd.md` §5, §10)

- Transparência numa lista própria (`render_list[RENDER_LIST_ALPHA]`,
  `render_forward_clustered.cpp:1145-1150`), ordenada por `priority` e depois por profundidade
  decrescente, **por instância** (`render_forward_clustered.h:722-731`). Sem desempate por id.
- Blend e escrita de profundidade são estado de pipeline vindo de `render_mode`
  (`scene_shader_forward_clustered.cpp:100-111`: `blend_add`, `blend_mix`, `depth_draw_never`…).
- Instâncias: um storage buffer de instâncias por lista, lido por `instance_index`
  (`scene_forward_clustered.glsl:770-775`); multimesh e skinned nunca são fundidos
  (`render_forward_clustered.cpp:877`).
- Partículas: o compute escreve o mesmo buffer de instâncias, e o desenho é o de multimesh
  (`particles_storage.cpp:1339-1350`).

## Como fazemos aqui

- O RS1 (`RenderServer.ts`) já intercala as entradas nativas com o `three` pela chave do
  `painterSortStable` (`groupOrder`, `renderOrder`, `z`, `id`), mas só na lista opaca e só com
  `renderOrder` 0. A projeção já oferece `InstancedMesh`/`SkinnedMesh` via `offerNative`
  (`JsCull`).
- O `three` 0.184 (`Renderer._renderObject`) desenha transparente `DoubleSide` sem
  `forceSinglePass` duas vezes: `BackSide` e depois `FrontSide`, por objeto. A `transparentDoublePass`
  só vale para transmissão (`RenderList.needsDoublePass`).
- Fórmulas do WGSL de referência (`renderer-r0/wgsl/ac/wgsl-0054.txt`, `-0048`, `-0056`, `-0004`):
  - `positionLocal = (instanceMatrix * vec4(position, 1)).xyz`, **depois** `(view * model) * positionLocal`;
  - `normalLocal = m3 * (normal / vec3(dot(m3[0], m3[0]), dot(m3[1], m3[1]), dot(m3[2], m3[2])))`,
    `m3` = 3×3 da `instanceMatrix`;
  - `diffuse = vec4(color, 1) * map * vertexColor`; com `instanceColor`, `vec4(ic, 1) * diffuse`;
    `diffuse.a *= opacity`; `alphaTest`: descarta `diffuse.a <= alphaTest`; opaco
    (`transparent == false && blending == Normal`): `diffuse.a = 1`;
  - saída `max(vec4(rgb, a), 0)`, névoa só no rgb.
- Blend (`WebGPUPipelineUtils._getBlending`, não pré-multiplicado): normal = `src-alpha,
  one-minus-src-alpha` / alfa `one, one-minus-src-alpha`; aditivo = `src-alpha, one` / alfa
  `one, one`. Só há blend se `blending != Normal || transparent`. `depthBias = polygonOffsetUnits`,
  `depthBiasSlopeScale = polygonOffsetFactor`, `depthBiasClamp = 0`.
- `getDrawParameters`: `instanceCount = max(0, object.count)` (0 = não desenha);
  `first = max(drawRange.start, 0)`, `count = min(start + drawRange.count, itens) − first`.

## Validação de aplicabilidade

- **Ordem dos coplanares:** a ordem do Godot (sem id) trocaria empates entre transparentes
  coplanares (marcas de pneu e poças `luz-lojas` sobre a calçada). Aqui vale a chave do `three`, com
  `id`. Por isso, o núcleo ordena as nativas com a mesma função e intercala nas duas listas.
- **Instância como vertex buffer (`stepMode: 'instance'`), não storage:** é o que o `three` emite
  no WGSL de referência (`nodeAttribute0..3` + `nodeAttribute4`). Reaproveita o caminho de
  `attribute.version` sem binding novo, e a receita C++ já aceita 8 VBs. O storage por
  `vin.instance` do brief ficaria com a mesma imagem, mas exigiria um layout de grupo 3 por
  modelo instanciado.
- **Instância no `nativeLocal`, não no `nativeModel`:** o `three` aplica a instância na posição
  local antes de `(view * model)`. Pôr no `nativeModel` mudaria a ordem do produto em float.
  As assinaturas de `nativeModel`/`nativeLocal`/`nativeLocalNormal` não mudam: os modelos da
  Frente A ganham instâncias sem tocar no código deles.
- **wgpu/naga:** `discard`, `stepMode: 'instance'`, `depthBias` e blend são o que o `three` já
  usa no host. `drawIndexed` com `instances = 0` não é emitido (entrada pulada).
- **Hermes:** nada de `for…of` em `Map` no caminho por quadro; os arrays paralelos do RS1 são
  mantidos.

## Desenho

### 1. Contrato dos modelos (extensões, nada removido)

- `VertexSemantic` ganha `'instanceColor'`. O núcleo lê esse atributo do objeto
  (`InstancedMesh.instanceColor`, `stepMode: 'instance'`), não da geometria.
- Os modelos recebem a feature de material **`alpha`** quando o material não é opaco
  (`transparent || blending != Normal`). Com ela, o modelo escreve o alfa real; sem ela, alfa 1.
  Modelo que não conhece `alpha` recusa a variante, e o objeto fica com o `three` (recusa em vez de
  aproximação).
- `coreWgsl(semantics, frameWgsl, core?)`: o 3º parâmetro opcional `{ instanced }` acrescenta ao
  `VIn` as 4 colunas da `instanceMatrix` (locations depois das do modelo) e aplica a instância
  em `nativeLocal`/`nativeLocalNormal`. Quem chama é só o núcleo.

### 2. Núcleo (`NativeRenderer.ts`)

- `CORE_SUPPORTED` += `instanced`, `transparent`, `additive`, `noDepthWrite`, `polygonOffset`,
  `renderOrder`.
- Recusas novas: `core:premultipliedAlpha`, `core:alphaToCoverage`, `core:stencil`.
- Estado por instância: blend (nenhum/normal/aditivo), `depthWrite`, `depthBias`,
  passadas (`[cull]` ou, no transparente `DoubleSide`, `['front', 'back']`, isto é, a face de
  trás primeiro). Tudo entra na chave do pipeline.
- Buffers por objeto (`instanceMatrix`, `instanceColor`) num conjunto de VBs da instância,
  depois dos da geometria. `InstancedBufferAttribute` da geometria vira `stepMode: 'instance'`.
- Por `take` (já roda por quadro): `count`/`first` do `drawRange`, `instances` do `count`, troca
  de `array` de um atributo → reconstrói a instância; `material.version` diferente → reconstrói (a
  classificação pode ter mudado); `instanceColor` que apareceu depois (`setColorAt` cria tarde) →
  reconstrói.

### 3. Lista (`RenderServer.ts`)

- `NativeEntry` ganha campos opcionais `instances` (padrão 1), `passes` (padrão 1) e
  `transparent`. `NativeDrawer.recipeFor(entry, ctx, pass = 0)`.
- `offerNative` aceita `renderOrder ≠ 0`. A entrada guarda `renderOrder` e a fase (opaca ou
  transparente, a mesma escolha do `RenderList.push`: `material.transparent`).
- Ordem total: opacas pela chave do `painterSortStable`, depois transparentes pela do
  `reversePainterSortStable` (`z` decrescente, desempate por `id`).
- Emissão:
  - no `_renderObjects` da lista opaca do dono, antes de cada item, as opacas de chave menor;
    no fim, **só** as opacas restantes;
  - no `_renderTransparents` do dono, as opacas que sobraram; depois, no `_renderObjects` da lista
    transparente do dono, as transparentes de chave menor antes de cada item e as restantes no fim;
  - `finishRender` emite o que sobrou: as transparentes, quando o `three` não tem nenhuma.
- Uma entrada com `passes = 2` grava dois comandos seguidos; sem receita em alguma passada, a
  entrada inteira volta ao `three` no lugar dela. Com `instances = 0` ou `count = 0`, a entrada é
  pulada (o `three` também não desenha).

### 4. `unlit`

- Aceita `alphaTest`, `alpha`, `instanceColor`. Bloco de parâmetros: + `alphaTest` (uma linha
  std140; 20 floats).

## Testes

- Vitest `NativeRenderer`: instanciado (VBs de instância com `stepMode`, `count` por quadro, troca
  de `instanceColor`); estado de pipeline (blend normal/aditivo, `depthWriteEnabled`, `depthBias`);
  `DoubleSide` transparente com 2 passadas e cull `front` antes de `back`; `drawRange`;
  `material.version` reconstrói; recusas novas.
- Vitest `unlit`: WGSL com `discard`/alfa/`instanceColor`; `alphaTest` no bloco.
- Vitest `NativeModel`: `coreWgsl` instanciado aplica a instância em `nativeLocal`.
- Vitest `RenderServer`: transparentes nativas intercaladas com as do `three` em `z` decrescente,
  empate por `id`; opacas restantes antes dos transparentes; `renderOrder`; 2 passadas = 2
  comandos; `instances` no comando; entrada vazia pulada; `finishRender` emite as transparentes
  sem itens do `three`.
- Galeria (fim da lista `entries`): transparente, aditivo, transparente `DoubleSide`, instanciado
  com `instanceColor`, partículas (instanciado aditivo `DoubleSide`), coplanares opacos
  (empate por `id`), coplanares transparentes com `polygonOffset` e `renderOrder`, e `drawRange`.

## Critério de aceite

- testes verdes;
- `check-stage.sh <wt> r1-4 --flag '&nativeRenderer=1&nativeRendererModels=unlit'` = PASS (galeria +
  Setor O + Comercial dia e noite + fumaça). No Comercial, as poças `luz-lojas` (unlit instanciado,
  `renderOrder` 1, coplanar com a calçada) e as transparentes do céu/tiro são o caso real de
  coplanar e transparente;
- `&nativeTint=1` = FAIL na galeria;
- os `interiores-*` (standard instanciado) entram na paridade quando a Frente A for mesclada: o
  núcleo já entrega a instância.

## Céu de dia (diagnóstico e correção)

- **Sintoma:** no `check-stage`, Setor O e Comercial de dia davam FAIL só no céu (≈ 6/255, 8–11% dos
  pixels); à noite, PASS.
- **Provas:**
  - tirar só o domo `ceu` do renderer próprio → PASS (0/0);
  - `?escala=0` (relógio do jogo parado; o céu não muda) → PASS (0/0);
  - log de versão do atributo `color` do domo: o renderer próprio reescreve a cada quadro, e forçar
    o reenvio não muda nada;
  - o braço `three` mostra **a cor da hora do spawn** (17:30, igual à rodada `escala=0`), não a do
    congelamento (17:37, que o renderer próprio mostra).
- **Causa:** o `three` não reenviou a cópia dele do atributo que deixou de desenhar enquanto o renderer
  próprio era o dono. Quando o objeto volta ao `three` (braço de paridade, ou recusa no meio do
  jogo), ele desenha dado velho. Não é o renderer próprio que erra; o erro afetaria qualquer
  volta ao `three` de um buffer dinâmico.
- **Correção:** ao reescrever um buffer de vértice cuja versão mudou, o núcleo também escreve na
  cópia do `three`, se ela existir (`backend.get(atributo).buffer`). O custo é uma escrita a mais
  por buffer dinâmico que o `three` já criou, e some quando o `three` sair do caminho (R1.6/R4).
  O índice fica de fora (quase nunca muda, e `uint16` ímpar não é múltiplo de 4 bytes).

## Instâncias compactadas (fios do DDD 61) — diagnóstico e correção

- **Sintoma (Frente A, com lambert instanciado ligado):** no Comercial de dia, o braço nativo desenha um
  fio que o `three` não mostra (`fios-quebraveis`, `InstancedMesh` lambert; o `cull()` compacta as
  instâncias por distância: `setMatrixAt` nas n primeiras, `count = n`, `addUpdateRange(0, n·16)`,
  `needsUpdate`, e só roda quando a vista muda).
- **Reprodução:** galeria, `lambert-compacted-ubo` (300 instâncias) e `lambert-compacted-interleaved`
  (1280, o caminho que o DDD 61 sempre usa: `sharedInstancedMesh` alarga para 1025), compactando a cada
  quadro de jogo → FAIL (alt 35). Com `nativeTint` o braço **nativo** é o certo; o `three` desenha as
  matrizes do `precompile`. Com `?renderIdRefresh=0` → PASS (0/0).
- **Causa (no `RenderIdRefresh`, SPEC-0325 — afeta também o caminho só-`three`):** o `three` sobe a
  geometria (`_geometries.updateForRender`) **antes** de o `InstanceNode.update()` sincronizar a versão
  do buffer intercalado (`_nodes.updateForRender`). Na mudança, o `RenderIdRefresh` fazia **um**
  refresh (o upload não vê a mudança; a versão é sincronizada depois) e, nos renders seguintes,
  pulava o refresh: o upload pendente só saía na **próxima** mudança. Um instanciado que muda e
  para (fios depois do `cull`, `?parityFreeze`, objeto que volta do renderer próprio) ficava com as
  matrizes da mudança anterior.
- **Correção:** cada mudança de `instanceMatrix`/`instanceColor` força **2** refreshes do `three`
  (`INSTANCE_REFRESHES`), independentemente do observador do `three`.
- **Verificação:** `check-stage r1-4-compact-fix` (`unlit,lambert`): galeria (com a reprodução) PASS 0/0,
  Comercial noite PASS, fumaça PASS; **Comercial dia FAIL alt 3 / 0,0273%** (era alt 223 com os fios).
  O resto está todo **dentro de uma poça** (`pocas-de-sangue`, lambert instanciado opaco com
  `polygonOffset −2/−2`, `blood.ts`): o nativo sai +1–2 de vermelho na área da poça, e o asfalto em volta
  é idêntico. Com o lambert instanciado devolvido ao `three` (diagnóstico temporário) → PASS
  (alt 3 / 0,0040%). Ainda não isolado: fórmula de posição, normal e instância bate com o WGSL de
  referência (`ac/wgsl-0032.txt`, o mesmo objeto); suspeitas são precisão do sombreamento do `lambert`
  com instância ou do viés de profundidade contra o asfalto. Pendência no backlog do PRD-0466.
- **Teste da sombra (2026-10-24):** a poça não recebe sombra (`receiveShadow = false` no `blood.ts`).
  Com o `RECEIVE_SHADOW = false` da Frente A (só essa mudança), o Comercial dia deu alt 6 / 0,0135%,
  mas **sem poça na rodada** (as poças nascem de evento). Sobram pontos esparsos de ±2–6 ao longe, que já
  existiam com o lambert instanciado no `three` (0,004%). O viés de profundidade nativo é o do `three`
  (`depthBias = units`, `slope = factor`, `clamp = 0`), e a ordem é a mesma. Inconclusivo; hipótese:
  sombra de pedestre (Frente B) aparecendo na borda da poça. Reverificar quando a sombra fechar.
