# SPEC-0642 - Sombra nativa com recorte alfa

**Data:** 2026-10-31
**Status:** aceito — estende a [SPEC-0245](SPEC-0245-passe-de-sombra-nativo.md) e a [SPEC-0289](SPEC-0289-sombra-nativa-com-streaming-e-instancing.md)

## Contexto

O passe de sombra em C++ (SPEC-0245) é depth-only: não tem estágio de fragmento e não amostra textura. Por isso o
gate (`shadow_pass_gate.cpp`) recusava o QUADRO INTEIRO quando um caster tinha recorte alfa (`kNodeAlphaClip`, motivo
`recorte-alfa`) — desenhar a folhagem sem recorte daria a sombra do cartão inteiro.

No Port Hollow (CSM, 3 cascatas) 24 casters têm `alphaTest` (folhas/agulhas das árvores instanciadas da
`Vegetation`, sprites de árvore com material MASK e uma malha fundida estática). O log era
`[shadowPass] DEVOLVEU ao three motivo=recorte-alfa ... [recorte-alfa=24 casters=~160]` em todo quadro, e o `three`
refazia o mapa de sombra em JS: render ~126 ms contra ~16 ms com o passe nativo assumindo, e ~8 MB de lixo por quadro.

## Decisão

O passe nativo passa a desenhar casters com recorte alfa **do mesmo jeito que o `three`**, e o gate só recusa o
caster com recorte cujo recorte o host **não tem** (mesma política "recusar em vez de aproximar" das instâncias,
SPEC-0289).

### 1. O que o `three` faz (r184: `Renderer.renderObject`, `_getShadowNodes`, `NodeMaterial.setupDiffuseColor`)

- O material do passe de sombra recebe `alphaTest` e `alphaMap` do material original.
- Com `material.map`, o alfa da sombra é `map.a`, amostrado no UV padrão (`uv(map.channel)`) **transformado por
  `map.matrix`** (o `TextureNode` liga `updateMatrix` quando não há `uvNode`; com `matrixAutoUpdate` a matriz vem de
  `offset`/`repeat`/`rotation`/`center`).
- A opacidade multiplicada é a do material de sombra (1), não a do original; `colorNode`, `castShadowNode` e
  `maskNode`/`maskShadowNode` do original também entram no alfa.
- Descarta o fragmento quando `alfa <= alphaTest`.

### 2. O que o host reproduz

Só o caso que dá para reproduzir sem compilar TSL: material único com `alphaTest > 0`, `map` presente,
`map.channel === 0`, **sem** `alphaMap`, `colorNode`, `castShadowNode`, `maskNode`, `maskShadowNode`, e geometria
com atributo `uv` `Float32` de 2 componentes, não normalizado (denso ou interleaved). Qualquer outro caso **não
registra** o recorte, e o gate segue recusando o quadro por `recorte-alfa` — como antes.

Shader: variante do pipeline com estágio de fragmento (sem alvo de cor) que amostra `map` com sampler linear
(mipmap linear; `wrapS`/`wrapT` do `three`: repeat, clamp, mirror) e faz `discard` quando `a <= alphaTest`. O UV
viaja num buffer de vértice próprio (o buffer do `three`, emprestado, com passo e deslocamento lidos do atributo).
Vale para malha comum e para `InstancedMesh`.

### 3. Formato

- **Uniforme por caster**: os 256 bytes do slot inteiro (antes 192 usados): `model`, `view`, `projection`
  (3 × `mat4x4f`), `uvTransform` (`mat3x3f` = 3 colunas de `vec4f`) e `alphaTest` (`f32` + 3 de preenchimento).
- **Ponte nova** `__cortexShadowAlphaClip` (`native/src/shims/shadow_alpha_clip_shim.*`):
  - `set(indiceDoNo, textura, bufferUv, passoUv, deslocamentoUv, alphaTest, wrapS, wrapT, uvMatrix: Float32Array(9))
    → boolean` — `textura` é o `GPUTexture` de `backend.get(map).texture`; `bufferUv` o `GPUBuffer` do atributo `uv`
    (ou do bloco interleaved); `wrapS`/`wrapT` são as constantes do `three`. `false` = o host não guardou, e o gate
    recusa o nó.
  - `erase(indiceDoNo)`.
- **Store** `render::AlphaClipStore` (`native/src/render/alpha_clip_store.*`), por nó do espelho, como o
  `InstanceBufferStore`: guarda os handles emprestados e é DONO da `TextureView`, do sampler e do bind group que cria.
  Limpa no `build` do espelho e quando o nó sai (`removeNode`).
- **Gate**: `evaluateShadowPassGate` ganha a consulta `AlphaClipPresence` (ponteiro de função, para seguir puro e
  testável no `cortex_host_tests`). Caster com `kNodeAlphaClip` só cai em `recorte-alfa` se a consulta disser que o
  host não tem o recorte dele. `nullptr` = recusa sempre (comportamento anterior).

### 4. Sincronização no JS (`src/render/ShadowAlphaClipSync.ts`)

- O `NativeSceneMirror` passa a acompanhar os nós marcados com recorte alfa (`alphaClipNodes`) e expõe o índice do
  nó (`nodeIndex`) e uma geração (`generation`, sobe a cada `install`).
- A cada chamada do passe nativo (antes da primeira cascata), para cada nó com recorte: confere elegibilidade, lê os
  handles do backend e a `map.matrix`; só atravessa a ponte quando algo mudou (textura, buffer de UV, passo,
  deslocamento, `alphaTest`, wrap, matriz, índice ou geração). Sem alocação no regime normal.
- Handle sumido (textura ou geometria descartada) → `erase`. É seguro com folga: o `destroy` do host é adiado em 10
  quadros (ADR-0153) e a conferência roda antes de todo passe nativo.
- Chamado pelo `OutdoorLighting` (CSM) e pelo `NativeSunShadowPass` (mapa único do sol).

## Consequências

- Casters com recorte alfa projetam sombra recortada pela textura no passe nativo; o Port Hollow deixa de devolver o
  passe ao `three`.
- Custo: pipelines a mais por `(cull, passo, instanciado)` com recorte e um bind group por nó com recorte; o
  fragmento só roda nesses casters.
- Limitações conhecidas (seguem recusando, não aproximam): `alphaMap`, `colorNode`/`castShadowNode`/máscaras, UV em
  canal ≠ 0, UV quantizado (não `Float32`), material em array, `alphaTest` sem `map` (no `three` o alfa é 1 e só
  descartaria com `alphaTest >= 1`). O filtro da textura é sempre linear (o `three` respeita `minFilter`/`magFilter`);
  a diferença fica no texel da borda do recorte.
