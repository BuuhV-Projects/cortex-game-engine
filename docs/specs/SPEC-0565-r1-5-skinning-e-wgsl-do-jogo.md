# SPEC-0565 — R1.5: skinning no núcleo e API de WGSL do jogo no renderer nativo

**Data:** 2026-10-24
**Status:** implementado (2026-10-24), desligado por padrão (`?nativeRenderer=1`).

## Como ficou

- Como no desenho. Diferença achada no export: o `three` **alarga em lugar** o `skinIndex`
  (`Uint16`/`Uint8` não normalizado → `Uint32Array`) quando sobe o buffer dele
  (`WebGPUAttributeUtils.createAttribute`); o núcleo aceita `uint32xN` (`cf62a990`).
- `check-stage r1-5-nucleo` (`unlit,wgsl`, em `fda92deb`): galeria, Setor O e Comercial dia e noite
  PASS 0/0, fumaça PASS; galeria de novo em `cf62a990` com `wgsl-wave` e `unlit-skinned` desenhados
  pelo renderer próprio: PASS 0/0; `&nativeTint=1`: FAIL (alt 21), como deve.

Etapa R1.5 do PRD-0466 (ADR-0465), Frente C. Decisões e alternativas: **ADR-0566**. Base: R1.4
(SPEC-0555).

## Escopo

Entra no núcleo:

- `SkinnedMesh`: ossos num storage buffer no grupo 3; os modelos não mudam (`nativeLocal` e
  `nativeLocalNormal` aplicam o skin);
- **API de WGSL do jogo**: `registerNativeMaterial(nome, def)` + `userData.nativeMaterial = nome`
  no material TSL. O `def` é um `NativeModelDef` com:
  - atributos próprios (`attributeTypes`: nome → tipo WGSL), lidos da geometria;
    `InstancedBufferAttribute` vira `stepMode: 'instance'` (o caso do `instancePaint`);
  - texturas próprias, inclusive `DataTexture` float lida no vertex shader;
  - bloco de parâmetros próprio;
- **relógio de shader** `view.time` (vertex shader animado: o mar), com o uniforme TSL `shaderTime`
  para o lado `three` do mesmo material;
- um exemplo de WGSL do jogo na galeria, que prova a API.

Fica fora: o porte de `peopleGpu`, das tintas por slot e da pintura mascarada (repo do jogo,
Frente D); skinned + instanced (recusa `core:skinnedInstanced`, como no `three`); morph.

## Como o Godot faz (4.7.2 `ed1daf0b`, clone do anexo `docs/prds/0466-anexos/godot-renderer-rd.md` §11)

- `TIME` = soma do passo de jogo já escalado por `time_scale` (`main/main.cpp:4936-4940`, passado ao
  `draw`), acumulado no compositor com *rollover* (`renderer_rd/renderer_compositor_rd.cpp:126-132`,
  `rendering/limits/time/time_rollover_secs`), no UBO de cena (`storage_rd/render_scene_data_rd.cpp:151`,
  `shaders/scene_data_inc.glsl:76`); o shader de usuário lê `TIME` → `global_time`
  (`forward_clustered/scene_shader_forward_clustered.cpp:736`).
- Shader de usuário: o motor embrulha o código do usuário e entrega os *built-ins*
  (`INSTANCE_ID` → `INSTANCE_INDEX`, `INSTANCE_CUSTOM`: `scene_shader_forward_clustered.cpp:725`,
  `:772`, `:834`).
- Skinning: pré-passe de compute que deforma os vértices num VB por instância
  (`storage_rd/mesh_storage.cpp:1149-1253`, `shaders/skeleton.glsl:123-162`); o shader da cena não
  sabe que existe esqueleto.

## Como fazemos aqui

- `three` 0.184 `SkinningNode` (`nodes/accessors/SkinningNode.js:124-176`):
  - posição: `bindMatrixInverse * Σ (boneᵢ * wᵢ) * (bindMatrix * pos)`, somando na ordem x, y, z, w;
  - normal: `M = bindMatrixInverse * (Σ wᵢ * boneᵢ) * bindMatrix`, `n' = normalize((M * vec4(n, 0)).xyz)`;
  - `skeleton.update()` uma vez por quadro por esqueleto (`update`, com `frameId`).
- Ordem do `NodeMaterial.setupPosition`: skinning ou instância primeiro, `positionNode` depois. Ou
  seja, o `positionNode` do jogo vê a posição local já deformada, que é o que o `nativeLocal(vin)`
  entrega ao modelo do jogo.
- O `time` do TSL (`nodes/utils/Timer.js:10`) é o `NodeFrame.time`, relógio do renderer: não para no
  `?parityFreeze` (ADR-0566 §2).

## Validação de aplicabilidade

- **Skinning no VS e não em compute:** no DDD 61 são 1–4 malhas, desenhadas uma vez no passe
  principal; a fórmula fica a do `three` (paridade direta). Compute só se vierem dezenas (ADR-0566 §3).
- **Tempo:** o relógio do jogo congela no `?parityFreeze` (o `Game._update` não roda), então
  objeto animado na galeria não sobe o ruído dos pares de controle. O *rollover* evita perder
  precisão no `sin` em float32 depois de horas de jogo.
- **wgpu/naga:** storage `read` no VS (o passe de sombra C++ e o `three` já usam), `textureLoad` em
  `texture_2d<f32>` com `sampleType: 'unfilterable-float'` (RGBA32F não filtra), formatos
  `uint16x4`/`uint8x4` para o `skinIndex` (vira `vec4<u32>`).
- **Hermes:** registro num `Map` consultado só no `_build` (uma vez por objeto), nunca por quadro.

## Desenho

### 1. Contrato (extensões; nada do que existe muda)

- `NativeModelDef.attributes()` passa a devolver `readonly string[]`: os `VertexSemantic` de sempre
  e os nomes declarados em `attributeTypes?: Readonly<Record<string, string>>` (nome do atributo da
  geometria → tipo WGSL do `VIn`). Um modelo da Frente A que devolve `VertexSemantic[]` continua
  válido.
- `CoreVertexOptions.skinned`: o núcleo acrescenta `skinIndex : vec4<u32>` e `skinWeight : vec4<f32>`
  ao `VIn`, depois dos atributos do modelo, e o storage `skin` (grupo 3, binding 1):
  `struct Skin { bind : mat4x4<f32>, bindInverse : mat4x4<f32>, bones : array<mat4x4<f32>> }`.
- Bloco de vista: `time : f32` logo depois de `fogFar` (o bloco continua com 40 floats).
- Texturas do grupo 2 ficam visíveis em VS e FS. Textura `FloatType` → `sampleType:
  'unfilterable-float'` e sampler `non-filtering`; o layout do grupo 2 tem chave pelo tipo de cada
  textura.

### 2. Registro (`src/render/native/GameMaterials.ts`, público)

```ts
registerNativeMaterial('mar', marDef);    // marDef: NativeModelDef
material.userData.nativeMaterial = 'mar'; // o classificador dá 'wgsl:mar'
```

- O núcleo procura `wgsl:<nome>` no registro no `_build`. Sem registro: recusa `model:wgsl:<nome>`
  (o `three` desenha o TSL).
- `?nativeRendererModels=` aceita o nome completo (`wgsl:mar`) ou `wgsl` (todos os do jogo).

### 3. Relógio (`src/render/native/ShaderClock.ts`, público)

- `shaderTime`: uniforme TSL (`uniform(0)`); `advanceShaderTime(dt)` soma e aplica o *rollover*
  (`SHADER_TIME_ROLLOVER_S`). O `Game._update` chama a cada quadro de jogo.
- O `NativeRenderer.beginFrame` copia `shaderTime.value` para `view.time`.

### 4. Skinning no núcleo

- `CORE_SUPPORTED` += `skinned`; skinned + instanced → `core:skinnedInstanced`.
- Grupo 3 do skinned = UBO do objeto + storage `skin` próprio (`(2 + ossos) × 64` bytes). A cada
  quadro: `skeleton.update()` uma vez por esqueleto e escrita do `skin` (bind, bindInverse,
  `boneMatrices`).

### 5. Exemplo na galeria (fim da lista `entries`)

- `wgsl-wave`: `InstancedMesh` de quads com material TSL (`MeshBasicNodeMaterial`, `fog: false`):
  - `positionNode` = onda em y com `shaderTime`;
  - deslocamento por instância lido de uma `DataTexture` float (`textureLoad` pelo índice da instância);
  - `colorNode` = `mix(branco, tint, mask)`, com `tint` (`InstancedBufferAttribute`, o caso do
    `instancePaint`) e `mask` (atributo de vértice, o caso do `paintMask`);
  - `userData.nativeMaterial = 'galleryWave'` + o WGSL equivalente registrado.
- `unlit-skinned`: `SkinnedMesh` de 2 ossos com o osso de cima girado (pose fixa), material `unlit`.

## Testes

- Vitest: registro (`wgsl:` achado; sem registro, recusa); `attributeTypes` no `VIn` e `stepMode`
  do `InstancedBufferAttribute`; textura float com layout `unfilterable-float` visível no VS;
  `view.time` escrito no `beginFrame`; `advanceShaderTime` com *rollover*; skinning (VIn com
  `skinIndex`/`skinWeight`, storage no grupo 3, escrita por quadro, `skeleton.update` uma vez por
  esqueleto, recusa com instância); `vertexFormat` `uint16x4`/`uint8x4`.
- Galeria: `wgsl-wave` e `unlit-skinned` na paridade.

## Critério de aceite

- testes verdes;
- `check-stage.sh <wt> r1-5 --flag '&nativeRenderer=1&nativeRendererModels=unlit,wgsl'` = PASS;
  `&nativeTint=1` = FAIL;
- a API pronta para a Frente D portar `peopleGpu` e as tintas (no repo do jogo, com spec própria).
