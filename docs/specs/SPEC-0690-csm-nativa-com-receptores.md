# SPEC-0690 — CSM nativa com receptores (sombra do sol em cascatas no renderer próprio)

**Data:** 2026-11-05
**Status:** implementado
**Base:** SPEC-0245 (passe de sombra nativo), SPEC-0545 (sombra do sol no renderer nativo), SPEC-0675 (escalonamento
da cascata distante), SPEC-0688 (`sunShadow` no perf-trace). Decisões em ADR-0691 e ADR-0692.

## Contexto

Com `csm: true` na `outdoorLighting` (o DDD 00 usa 2 cascatas, 100 m, mapa de 2048), o renderer nativo fica **sem
sombra do sol nenhuma**. Medido no export do DDD 00 (volta pelo mapa até a peça 14, `cortexDebug=perf`):

- o `ShadowBlock` (`src/render/native/frame/shadow.ts`) lê `sun.shadow.map`, que com CSM nunca é criado: o
  `CSMShadowNode` do three cria uma `LwLight` por cascata, cada uma com o seu `shadow` e o seu mapa. O bloco reporta
  `mapa-sem-gpu`, põe `enabled = 0` e o `nativeShadow` devolve 1 (luz plena) em todo receptor;
- o `CameraFollowingCSM._desenharPasseDeSombraNativo` já desenha as cascatas em C++ (`drawShadowPass` por cascata),
  mas só roda dentro de `updateBefore`, que o three só chama quando um material desenhado **por ele** usa o nó da
  CSM. Com todos os receptores nativos, nada dispara: nenhuma linha `[shadowPass]` no log, nenhum pipeline de
  `ShadowMaterial`, as cascatas nem são reposicionadas;
- prédios e carros não projetam sombra no export (confirmado pelo usuário).

A travada das cidadezinhas (render 40–58 ms), que antes parecia vir da sombra, não aparece mais desde o ADR-0689
(render máx. 8,5–10 ms nas peças 14–15). Esta SPEC é sobre **devolver a sombra** sem perder o quadro de hoje.

## Comportamento

### 1. Quem atualiza a CSM: o lado nativo, todo quadro

- `CameraFollowingCSM` ganha `updateNative(camera)`: a mesma lógica de `updateBefore` (posição das cascatas,
  `updateMatrices` de cada `shadow`, `_desenharPasseDeSombraNativo`), sem depender do `NodeFrame` do three.
- O `ShadowBlock.update` acha o nó (`sun.shadow.shadowNode` com `isCSMShadowNode`) e chama `updateNative` uma vez
  por quadro, **antes** de escrever os parâmetros.
- Guarda por quadro (`_lastUpdateFrame`): se um receptor do three também disparar `updateBefore` no mesmo quadro,
  a segunda chamada só retorna. Nunca há dois reposicionamentos nem dois desenhos por quadro.
- Com CSM, o `NativeSunShadowPass` e o `updateMatrices` do sol principal (`shadow.ts`) **não** rodam: o sol
  principal não tem mapa. Hoje eles zeram `autoUpdate` e põem `needsUpdate = true` no sol a cada quadro.
- O escalonamento da cascata distante (SPEC-0675, `farCascadeInterval`) passa a valer também no caminho nativo: a
  cascata distante só é redesenhada a cada `farCascadeInterval` quadros, e o receptor lê o mapa e a matriz do
  último desenho (a matriz é guardada junto com o desenho, não recalculada no quadro em que não houve desenho).

### 2. Recusa por cascata

- Cada cascata tem resultado próprio (`assumida[i]`). A recusa de uma não devolve as outras.
- Cascata recusada: o receptor nativo trata **aquela cascata** como desligada no quadro (fator 1, luz plena), e o
  three continua com `autoUpdate = true` nela (se houver receptor do three, ele desenha). O motivo vai para o
  `sunShadow` do perf-trace (item 6).
- `?semPasseDeSombraNativo=1` continua devolvendo tudo ao three (os receptores nativos ficam sem sombra, como hoje).

### 3. Cascata vazia é limpa, não recusada (C++)

O `drawShadowCasters` (`native/src/render/shadow_pass.cpp`) devolve hoje 0 em três casos diferentes. Passa a
distinguir:

| caso | hoje | depois |
|---|---|---|
| a enumeração deu 0 casters | sai sem abrir pass (`:318`): mapa do quadro anterior fica | abre o pass com `loadOp = clear` (profundidade 1) e devolve `kClearedEmpty` |
| há casters, mas algum sem geometria registrada, ou falha de pipeline/uniforme (`:357`) | desenha o que deu, ou 0 → recusa | `kNotReady` → recusa; nada é submetido (o mapa não é limpo nem desenhado pela metade) |
| o shim descartou algum caster (`scene_mirror_shadow_shim.cpp`, `shadowItemFate`: geometria `kNoGeometry`, lote instanciado ausente na store, recorte alfa sem entrada) | silencioso | conta `skipped`; com `skipped > 0` nada é desenhado nem limpo (retorno 0, status `skipped`) e a cascata é recusada com o motivo `descartado` |
| item com `instanceCount == 0` (lote instanciado vazio) | pulado | vazio legítimo: não conta como descarte; se todos forem assim, a cascata é `cleared-empty` |
| gate aceitou, mas não há alvo | `-geometria-ausente` | retorno 0, status `refused`, motivo `sem-alvo` (retorno < 0 fica só para a recusa do gate) |

O drawShadowCasters segue um roteiro puro (`planShadowPass`, `assignShadowSlots` em `shadow_pass_status.h`): os
slots de uniforme começam em 0 a cada chamada e cada cascata submete antes da próxima.

**Contrato com o JS.** O vetor de saída ganha três posições depois das da SPEC-0289 (N = `kShadowGateRefusalCount`):
`kGateOutSkipped` = N+3, `kGateOutExcluded` = N+4 e `kGateOutStatus` = N+5 (`kGateOutFloats` = N+6). O shim
aceita o vetor antigo (N+3) e só escreve as posições novas quando cabe. O slot de status leva o código de
`ShadowPassStatus` **+ 1** (`shadowStatusSlot`): o JS escreve 0 antes da chamada, e 0 depois dela quer dizer host
anterior a esta SPEC (ou vetor zerado).

No JS, `ShadowPassOutcome` (`mirrorBridge.ts`) ganha `skipped`, `excluded` e `status` (`ok | cleared-empty |
not-ready | refused | skipped`). Com host antigo os três ficam ausentes e vale a regra de antes (`drawn === 0` é
recusa). São aceitos `ok` e `cleared-empty`. O motivo vai em `reason`: o do gate, `nao-pronto`, `descartado` ou
`sem-alvo`.

### 4. Personagens com esqueleto ficam fora do passe nativo

- O gate (`native/src/scene/shadow_pass_gate.cpp`) deixa de recusar a cascata por `kSkinnedCaster`: o caster
  skinned é **excluído** da lista e contado em `excluded`.
- Consequência: player e NPCs não projetam sombra no export nesta fase (hoje também não projetam). A sombra dos
  personagens fica para uma SPEC própria (skinning no passe de sombra em C++).
- Os outros motivos do gate (VSM, instanced sem matrizes etc.) continuam recusando a cascata.

### 5. Receptores nativos leem as cascatas

Novo módulo `src/render/native/frame/shadowCsm.ts` (o `shadow.ts` só escolhe o modo):

- **Texturas:** uma `texture_depth_2d` por cascata, nos bindings 10..15 (o 10 é o mapa único de hoje): até
  `CSM_MAX_CASCADES = 6`. A textura é a `shadow.map.depthTexture` de cada cascata (o mesmo alvo onde o C++
  desenha), pega por identidade no backend. Cascata sem GPU ainda liga a textura vazia de 1×1 e fica desligada.
  Toda troca de textura aumenta `version` (o bind group é refeito).
- **UBO** (std140), além dos campos de hoje: por cascata, `mat4` (`shadow.matrix`), `vec4(bias, normalBias,
  enabled, 0)`, `vec2(near, far)` das `_cascades` (frações de `shadowFar`); globais `camera.near`, `shadowFar =
  min(maxFar, camera.far)`, `cascadeCount`, `fade`, `mapSize`, `intensity`.
  Com 2 cascatas: 24 + 2·24 floats.
- **WGSL `nativeShadowCsm(positionWorld, normalWorld, positionView)`:**
  - `depth = viewZToOrthographicDepth(positionView.z, near, shadowFar)`, a mesma fórmula do three;
  - escolhe a cascata pelo intervalo e reaproveita o PCFSoft 3×3 de hoje com o mapa e a matriz dela;
  - com `fade`, mistura duas cascatas vizinhas **exatamente** como o `CSMShadowNode._setupFade` do three
    (mesma margem, mesma curva). Sem `fade`, segue o `_setupStandard`;
  - além da última cascata: fator 1.
- **Ponto de troca:** só `lambert.ts:226` (`litSurfaceWgsl`). `standard` e `terrainSplat` herdam. O WGSL do modo
  único continua igual para quem não usa CSM.
- `receiveShadow = false` continua valendo (o receptor não amostra).

### 6. Perf-trace

O `sunShadow` da SPEC-0688 ganha:

- `cascades: [{ status, drawn, skipped, excluded, ms }]` na amostra em que algum valor mudou. `ms` é o tempo da
  chamada `drawShadowPass` da cascata (ponte + C++), com 1 casa, e 0 nas recusas que acontecem antes da chamada.
  Como o `ms` varia, a lista sai na maioria das amostras;
- `csmReceivers`: draws com `receiveShadow` que o `NativeRenderer` entregou em quadros com a CSM amostrada, somados
  na janela (ausente quando é 0). Conta entregas à lista de desenho, não draws executados na GPU.

Nada novo fora do trace.

### 7. Geometria e UV dos casters com o NativeRenderer (ADR-0692)

Medido na primeira volta com esta SPEC: o gate recusou as duas cascatas em todas as amostras (`geometria-ausente` em
`static-merged-*`, `city-decor-*` e carros; `recorte-alfa` na vegetação). O registro de geometria do passe e a
store de recorte só liam os buffers do three, e o three não sobe os buffers dos objetos que o NativeRenderer desenha.

- **Provedor** (`ShadowGeometrySource`): buffer do `NativeGeometryStore` → buffer do backend do three → upload pelo
  store nativo (só `position` `float32x3` e o índice). O `CsmNativePass` e o `NativeSunShadowPass` pegam o provedor
  do NativeRenderer anexado; sem ele, o provedor é só o three.
- **Cache por fonte** no `NativeGeometryStore` (atributo, `InterleavedBuffer` ou índice): variantes de semantics da
  mesma geometria reaproveitam o buffer. Troca de array refaz o buffer e avisa o registro, que registra de novo.
- **Orçamento:** a varredura sobe até `SHADOW_UPLOAD_BYTES_PER_FRAME` por quadro. Geometria drenada do espelho sobe no
  mesmo quadro.
- **Recorte alfa:** o UV vem do provedor (slot do store com stride e offset); a textura que falta sobe pelo caminho do
  material nativo. O `ShadowAlphaClipSync` reenvia o `set` de quem volta ao mesmo slot depois de um `removeSubtree`.
- **C++:** `GeometryRegistry` e `AlphaClipStore` fazem `AddRef` do buffer que guardam e `Release` ao sobrescrever,
  apagar e limpar.
- **Gate:** `position` fora de `float32x3` ganha o motivo `posicao-nao-float32x3`, no fim do enum (o JS indexa por
  ele).

### 8. Custo por quadro do passe (medido no export do DDD 00)

A primeira versão funcionando custava ~3,5 ms de CPU por quadro no `render`. Dois pontos respondiam por quase tudo:

- **Recorte alfa (1,7 ms):** o sync relia a fonte de todo nó com recorte a cada quadro (consultas ao provedor,
  matriz do UV). Agora o nó já mandado sai pela **chave** do que o objeto carregava: material, mapa e `version`,
  `alphaTest`, wrap, geometria, atributo `uv`, e `offset`/`repeat`/`rotation`/`center` quando a matriz é automática.
  A chave só compara referências e escalares do próprio objeto. A troca de buffer no provedor e o `dispose` do mapa
  ou da geometria sobem uma época que faz todos relerem. Matriz manual (`matrixAutoUpdate = false`) é sempre relida.
- **Uniformes (1,1 ms):** o `drawShadowCasters` fazia uma `wgpuQueueWriteBuffer` por caster. Agora os slots da
  cascata, contíguos, são montados num staging reaproveitado (`shadow_pass_uniforms.h`) e vão numa escrita só, antes
  do primeiro draw.

Depois das duas mudanças, o bloco da sombra custa ~1,4 ms de mediana (0,6 do recorte, 0,6 do desenho).

O perf-trace ganha as seções de CPU `shadowBlock`, `csmNative`, `shadowRegistry`, `shadowAlphaClip` e `shadowDraw`
(`RenderSections`, SPEC-0585), aninhadas no `render`.

## Aceite

1. Uma captura do export do DDD 00 mostra sombra de prédios e carros no chão, nas duas cascatas, e sem emenda
   visível na troca (fade).
2. **Desempenho:** a volta pelo mapa (`tour.sh`, perfil `none`), com o mesmo jogo, comparada a uma volta com a
   engine da `main` rodada logo antes (a `tour-gc07` de 2026-11-04 é de um jogo sem os bandidos da SPEC-0135):
   - mediana no máximo +0,5 ms por área;
   - p95 não piora em nenhuma área.
3. O WGSL compila no export: o pipeline lambert com `receiveShadow` nasce sem erro de shader (naga) e o
   `[nativeShadow]` relata `amostrando`.
4. Depois do aquecimento, as cascatas são aceitas (`ok`/`cleared-empty`) na grande maioria das amostras da volta, e
   `geometria-ausente`/`recorte-alfa` não aparecem fora do aquecimento.
5. No perf-trace, `not-ready` e `refused:*` aparecem só nos quadros de streaming. Nenhuma área tem recusa contínua.
6. `?semPasseDeSombraNativo=1` volta ao estado de hoje sem erro.

## Testes

- **Vitest (`tests/`)**:
  - `updateNative` reposiciona e desenha uma vez por quadro, mesmo com `updateBefore` no mesmo quadro;
  - recusa por cascata: cascata 1 recusa, cascata 0 continua assumida e amostrada;
  - `cleared-empty` é aceito, e `not-ready` é recusa;
  - com `skipped > 0` a cascata é recusada;
  - o `ShadowBlock` em modo CSM escreve uma matriz por cascata e as texturas certas, e aumenta `version` na troca;
  - com CSM, o `NativeSunShadowPass` não toca no `autoUpdate`/`needsUpdate` do sol;
  - escalonamento: a cascata distante redesenha a cada `farCascadeInterval` quadros, com a matriz do último desenho;
  - o WGSL gerado tem `nativeShadowCsm`, declara cada mapa uma vez nos bindings 10..15, tem chaves e parênteses
    equilibrados e declara toda função que chama. O repo não tem validador de WGSL: a compilação real (naga) fica
    no aceite 3.
- **`cortex_host_tests`**:
  - `drawShadowCasters` com 0 casters limpa o alvo (`kClearedEmpty`);
  - com casters não prontos, devolve `kNotReady` sem limpar;
  - o caster descartado no shim conta em `skipped`;
  - skinned é excluído (não recusa a cascata);
  - duas cascatas no mesmo quadro em alvos diferentes, sem reaproveitar o slot de uniforme errado (pelo roteiro
    puro `planShadowPass`/`assignShadowSlots`, que o `drawShadowCasters` segue);
  - o slot de status leva o código + 1.

  A classificação e o roteiro são testados como funções puras; a execução na GPU (o clear e o não-submit) fica
  para o aceite em captura.
- **Fade:** um teste numérico em JS compara a fórmula do `nativeShadowCsm` (portada para uma função pura) com a do
  `_setupFade` do three em pontos da emenda.

## Fora do escopo

- Sombra dos personagens (skinning no passe de sombra).
- `texture_depth_2d_array` ou atlas próprio do C++ (ADR-0691).
- Mudança no número de cascatas ou na distância do DDD 00.

## Chaves de tradução

Nenhuma: não há texto visível ao jogador.
