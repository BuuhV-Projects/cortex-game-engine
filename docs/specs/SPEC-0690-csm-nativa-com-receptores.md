# SPEC-0690 — CSM nativa com receptores (sombra do sol em cascatas no renderer próprio)

**Data:** 2026-11-05
**Status:** proposto
**Base:** SPEC-0245 (passe de sombra nativo), SPEC-0545 (sombra do sol no renderer nativo), SPEC-0675 (escalonamento
da cascata distante), SPEC-0688 (`sunShadow` no perf-trace). Decisões em ADR-0691.

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
| há casters, mas nenhum pronto (pipeline/geometria, `:357`) | 0 → recusa | `kNotReady` → recusa (o mapa não é limpo) |
| o shim descartou algum caster (`scene_mirror_shim.cpp:500-520`: geometria ausente, lote instanciado vazio, recorte alfa sem entrada) | silencioso | conta `skipped`; com `skipped > 0` a cascata é recusada (`skipped:<motivo>`) |

O resultado chega ao JS como `{ drawn, skipped, status }`, e `status` é `ok | cleared-empty | not-ready |
refused:<motivo>`.

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

O `sunShadow` da SPEC-0688 ganha `cascades: [{ status, drawn, skipped, excluded, ms }]` na amostra em que algum
valor mudou, e `csmReceivers` (quantos draws nativos amostraram a CSM na janela). Nada novo fora do trace.

## Aceite

1. Uma captura do export do DDD 00 mostra sombra de prédios e carros no chão, nas duas cascatas, e sem emenda
   visível na troca (fade).
2. **Desempenho:** a volta pelo mapa (`tour.sh`, perfil `none`), comparada a `tour-gc07`:
   - mediana no máximo +0,5 ms por área (base: total 15,5 ms, Port Hollow 20,2 ms);
   - p95 não piora em nenhuma área (base: total 27,7 ms).
3. No perf-trace, `not-ready` e `refused:*` aparecem só nos quadros de streaming. Nenhuma área tem recusa contínua.
4. `?semPasseDeSombraNativo=1` volta ao estado de hoje sem erro.

## Testes

- **Vitest (`tests/`)**:
  - `updateNative` reposiciona e desenha uma vez por quadro, mesmo com `updateBefore` no mesmo quadro;
  - recusa por cascata: cascata 1 recusa, cascata 0 continua assumida e amostrada;
  - `cleared-empty` é aceito, e `not-ready` é recusa;
  - com `skipped > 0` a cascata é recusada;
  - o `ShadowBlock` em modo CSM escreve uma matriz por cascata e as texturas certas, e aumenta `version` na troca;
  - com CSM, o `NativeSunShadowPass` não toca no `autoUpdate`/`needsUpdate` do sol;
  - escalonamento: a cascata distante redesenha a cada `farCascadeInterval` quadros, com a matriz do último desenho;
  - o WGSL gerado tem `nativeShadowCsm` e compila no validador do teste de shaders (o mesmo dos modelos).
- **`cortex_host_tests`**:
  - `drawShadowCasters` com 0 casters limpa o alvo (`kClearedEmpty`);
  - com casters não prontos, devolve `kNotReady` sem limpar;
  - o caster descartado no shim conta em `skipped`;
  - skinned é excluído (não recusa a cascata);
  - duas cascatas no mesmo quadro em alvos diferentes, sem reaproveitar o slot de uniforme errado.
- **Fade:** um teste numérico em JS compara a fórmula do `nativeShadowCsm` (portada para uma função pura) com a do
  `_setupFade` do three em pontos da emenda.

## Fora do escopo

- Sombra dos personagens (skinning no passe de sombra).
- `texture_depth_2d_array` ou atlas próprio do C++ (ADR-0691).
- Mudança no número de cascatas ou na distância do DDD 00.

## Chaves de tradução

Nenhuma: não há texto visível ao jogador.
