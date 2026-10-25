# SPEC-0545 — R1.3: sombra do sol no renderer nativo

**Data:** 2026-10-24
**Status:** **implementado** (2026-10-24), desligado por padrão (vive dentro de
`?nativeRenderer=1`). O desenho abaixo foi a proposta. **"Como ficou"**, logo a seguir, registra
o que mudou e vale sobre o desenho onde os dois divergem.

Etapa R1.3 do PRD-0466. Bloco de quadro e grupo 1: SPEC-0495 ("Como ficou") e SPEC-0475.
Passe de sombra C++: SPEC-0245. Filtro do DDD 61: SPEC-0445.

## Como ficou (implementação)

- **Núcleo, 2 linhas** (combinado com a Frente C, commit isolado): a `FrameBlockFactory` recebe
  o host do `three` (`(device, host)`). Sem acesso global ao renderer, era o único jeito de achar
  o `GPUTexture` do `shadow.map`.
- **Parte 1** (`frame/shadow.ts`, `ShadowBlock`): como no desenho. A busca da luz é por
  `traverse` com cache (DDD 61: a `DirectionalLight` do sol). O teste do WGSL confere 16
  comparações, o mesmo número da referência `wgsl-0019`. `SHADOW_READY = true`.
- **Parte 2** (`shadow/NativeSunShadowPass.ts`): sem C++ novo. No DDD 61 o passe C++ **assume**
  o redesenho (`[nativeSunShadow] ASSUMIU` no Setor O e no Comercial), e o gate aceitou os casters
  do `markShadowCasters`.
- **Paridade da parte 2: o desenho original não comparava nada.** No braço `three` do
  `?parityFreeze`, a projeção não entrega servidor, então o `beginFrame` (e o bloco) não rodam e
  a troca de braço é invisível daqui. Na 1ª rodada os dois braços amostraram o MESMO mapa
  (desenhado pelo C++ antes de congelar): PASS sem valor, e o plantado não daria FAIL. Correção:
  no modo de paridade o passe redesenha em todo quadro nativo, e um `scene.onAfterRender`
  (instalado só nesse modo) religa o `needsUpdate` para o `three` redesenhar no braço dele.
  Agora cada par compara mapa C++ × mapa `three`.
- **Armadilha medida:** forçar o redesenho a cada quadro **à noite** derrubou o host (`Texture …
  has been destroyed` no `wgpuQueueSubmit`, Setor O e Comercial às 21h). Com
  `?nativeShadowPass=0` a noite passa. O jogo nunca redesenha à noite (o `SunShadow` só pede com o
  sol aceso), então o modo de paridade passou a seguir a mesma regra (`light.intensity > 0`). A
  causa exata (qual textura) não foi isolada e ficou como pendência.
- **Galeria:** a cena não liga o `renderer.shadowMap` (relato `shadowMap-desligado`), então não
  exercita a sombra. Ela vale aqui só como prova de que o WGSL do bloco compila no naga junto do
  `unlit`.

### Vereditos (`check-stage.sh`, 1920×1080, flag `&nativeRenderer=1&nativeRendererModels=unlit`)

| rodada | resultado |
| --- | --- |
| `r1-3-sombra-c` (completo) | **PASS**: galeria 0%, Setor O dia 0,0001% (1 par alterna), Setor O noite 0%, Comercial dia 0,0042% (4 pares), Comercial noite 0%, fumaça PASS (render 12,71 ms) |
| `r1-3-sombra-plant2` (`&nativeShadowPassShift=1`, Setor O) | **FAIL** como esperado: Setor O dia 9,12% dos pixels (52 alternados). À noite PASS: com o sol apagado não há sombra a comparar |
| `r1-3-sombra-nopass` (`&nativeShadowPass=0`, Setor O) | PASS dia e noite (isolou a armadilha da noite) |
| `cortex_host_tests` | 529 checks, 0 falhas |

### Custo (rodada curta)

`ab.sh`, Setor O, `--autopilot walk`, 1 réplica intercalada, export `r1-3-sombra-c`, ambos
com `&nativeRenderer=1&nativeRendererModels=unlit`:

| | sombra ligada | `?sombra=0` | diferença |
| --- | --- | --- | --- |
| render | 11,16 ms | 10,61 ms | **+0,55 ms** |
| quadro p95 | 29,1 ms | 26,8 ms | +2,3 |
| % > 33 ms | 1,65% | 0% | +1,65 |
| draws | 159 | 155 | +4 |

Fica **acima** do alvo de ≤ 0,3 ms, mas com 1 réplica (a SPEC-0445 mediu 0,37 ms com 2 réplicas
no Comercial). E não mede ainda o que a R1.3 promete: nesta branch todos os receptores são do
`three`, então o número é a sombra do `three` mais o redesenho no C++. O custo que conta (receptor
nativo amostrando 1× por vista) só aparece com o lambert da Frente A. A conferência do alvo fica
para o aceite final do R1, como manda o PRD.

### Receptor nativo (após a integração com a Frente A, 2026-10-24)

Com o lambert nativo recebendo sombra, o Comercial de dia divergia até 6/255 (a Frente A mediu
0,0821%, e a reprodução aqui deu 0,0097%) em **bordas de sombra finas no asfalto** (postes). Não
eram pedestres: o `markShadowCasters` do jogo exclui o que é instanciado ou dinâmico.

- **Isolamento:** com `&nativeShadowPass=0` (os dois braços amostram o mesmo mapa do `three`), a
  divergência some: **0,0000%** no Setor O e no Comercial, dia e noite. A amostragem nativa é bit a
  bit igual à do `three`; o que diferia era o **conteúdo do mapa** desenhado pelo C++.
- **Causa:** o passe C++ da SPEC-0245 compõe `viewProj × model` em double e manda um MVP só. O
  `three` faz `clip = P · vec4(((V · M) · p).xyz, 1)` em float, no shader. Na silhueta de um caster
  fino, a diferença de arredondamento muda a cobertura de texels da borda, e o PCFSoft espalha
  isso em 1–6 níveis.
- **Correção (na raiz):** o passe C++ passou a receber P, V e M em float e a multiplicar na ordem
  do `three` (`shadowCasterMatrices` em `shadow_math.h`, shaders do `shadow_pass.cpp`, inclusive
  o instanciado: `(inst · p).xyz` antes). O JS manda `[viewProj, P, V]` (48 doubles); com 16 o
  caminho antigo (MVP em double, o CSM) continua. **Troca deliberada:** para o mapa do sol vale a
  paridade com o `three` (mesma precisão dele), não a precisão extra do double.
- `RECEIVE_SHADOW = true` no lambert. Resultado (`r1-3-sombra-e`, `unlit,lambert`): galeria,
  Comercial e Setor O, dia e noite, todos **0,0000%**, e fumaça PASS. Plantado
  `&nativeShadowShift=1` (`r1-3-sombra-e-plant`): Comercial dia **FAIL** (6,98%).
- `cortex_host_tests`: 625 checks, 0 falhas (+2 testes de `shadowCasterMatrices`).

### O que ficou pendente

- ~~Paridade da amostragem nativa e plantado `?nativeShadowShift=1`~~: feitos com o lambert da
  Frente A (seção acima).
- Causa exata do crash ao redesenhar o mapa à noite (só acontece forçando: o jogo não redesenha
  à noite).
- Mapa próprio para quando o `three` não criar o dele (R1.6), ver Consequências.

## Escopo

Duas partes, cada uma desligável:

1. **Amostrar** o mapa da sombra do sol (o `SunShadow` do DDD 61: `DirectionalLightShadow`
   2048², `autoUpdate = false`, `needsUpdate` sob demanda) nos modelos nativos, com o filtro
   **PCFSoft** do `three` 0.184. Parâmetros no bloco do grupo 1 (bindings 8–15), nunca por
   material. Entrega a função WGSL `nativeShadow(positionWorld, normalWorld)` que os modelos
   da Frente A (lambert/standard) chamam no termo direto do sol, e liga `SHADOW_READY`.
2. **Desenhar** esse mapa no passe de sombra C++ (o do CSM, SPEC-0245) quando ele precisar
   ser refeito. É isso que segura a sombra quando os receptores forem todos nativos e o
   `ShadowNode` do `three` deixar de rodar.

Fica de fora: CSM (o DDD 61 não usa; o caminho do `OutdoorLighting` segue como está), VSM e
PCF simples (só o PCFSoft, que é o tipo que a engine impõe, SPEC-0445), luz pontual/spot
com sombra (nenhum jogo-alvo tem), mapa próprio quando o `three` nunca criou o dele (ver
Consequências).

## Como o Godot faz (clone 4.7.2 `ed1daf0b`)

| o quê | onde |
| --- | --- |
| atlas da sombra direcional ligado **uma vez por passe**, no set 1 | `servers/rendering/renderer_rd/shaders/forward_clustered/scene_forward_clustered_inc.glsl:388` (`directional_shadow_atlas`) |
| sampler de comparação **único**, criado uma vez | `servers/rendering/renderer_rd/forward_clustered/render_forward_clustered.cpp:5159-5160` (`compare_op`), ligado no set 0 `scene_forward_clustered_inc.glsl:176` |
| matriz, bias, normal bias e opacidade da sombra no buffer das direcionais (1×/quadro) | `servers/rendering/renderer_rd/shaders/light_data_inc.glsl:72-87` |
| filtro PCF por *kernel* do bloco de cena | `servers/rendering/renderer_rd/shaders/scene_forward_lights_inc.glsl:318-360` |
| passe de sombra com **material compartilhado** para opacos sem vértice customizado | `render_forward_clustered.cpp:4223-4253` (`uses_shared_shadow_material`) |
| sombra só redesenhada quando suja (luzes locais) | `renderer_scene_cull.cpp:3600-3641`, `renderer_scene_cull.h:712-749` |

## Como fazemos aqui

- **Amostragem:** hoje é o `three`. Cada estado de shader receptor tem um grupo "render" com
  `shadowMatrix`, `normalBias`, `bias`, `mapSize` e `intensity` (WGSL de referência
  `D:/jogos/detetive-brasilia/.cortex/renderer-r0/wgsl/setorO/wgsl-0019.txt`,
  `lambert+fog+receiveShadow`). Depois da SPEC-0445, esse grupo voltou a ser compartilhado.
- **Desenho do mapa:** o `ShadowNode.updateBefore` (`three.webgpu.js:44708`) redesenha quando
  `needsUpdate || autoUpdate`, com `renderer.render(scene, shadow.camera)` e `overrideMaterial`.
  Só roda se algum objeto que o `three` desenha usa o nó de sombra. O passe C++ da SPEC-0245
  (`native/src/render/shadow_pass.*`, gate `native/src/scene/shadow_pass_gate.*`) já faz isso
  para o CSM. Ele recebe uma câmera ortográfica qualquer (planos + `viewProj` em double), o
  `GPUTexture` alvo por identidade e um pipeline depth-only único (o material de sombra
  compartilhado do Godot, por construção).

## Validação de aplicabilidade

- **Fórmula** (`wgsl-0019`): `c = M · (p + n·normalBias)`, `c = c.xyz / c.w`,
  `coord = (c.x, 1 − c.y, c.z + bias)`. Dentro de `[0,1]² × (z ≤ 1)`, 9 grupos de
  `textureSampleCompare`, com o bilinear à mão (`fract(uv·mapSize + 0,5)`, `mix`) e soma × 1/9.
  Fora, 1. Resultado: `mix(1, pcf, intensity)`, multiplicando só o termo direto do sol.
- **naga / uniformidade:** o `three` chama `textureSampleCompare` dentro de um `if` não
  uniforme e desliga o diagnóstico com `diagnostic(off, derivative_uniformity)`. Essa diretiva
  tem de vir no topo do módulo, e o bloco é concatenado depois do núcleo. Por isso usamos
  `textureSampleCompareLevel(…, 0)`: sem derivadas e sem exigência de uniformidade. Num mapa
  de um nível só (a `DepthTexture` não tem mips), dá o mesmo resultado.
- **Sampler:** a `DepthTexture` da sombra usa `compareFunction = LessEqual` (`:44276`; o
  `GreaterEqual` só vale com `reversedDepthBuffer`, que o DDD 61 não usa), filtro nearest
  (padrão da `DepthTexture`) e clamp. Criamos um sampler igual, uma vez.
- **Ordem no quadro:** o `beginFrame` do servidor (e o `update` do bloco) roda na **projeção**,
  antes do `updateBefore` do `ShadowNode`, que roda no desenho. No quadro em que o mapa é
  refeito, a matriz lida no `beginFrame` seria a do mapa anterior. Por isso o bloco chama
  `shadow.updateMatrices(light)` nesse quadro, a mesma chamada que o `renderShadow` faz
  (`:44559`), e o par matriz/mapa fica casado.
- **Passe C++ para mapa único:** os argumentos do `drawShadowPass` são os mesmos do CSM.
  `minRatio = 0` desliga o filtro angular (`shadow_caster_enumerator.cpp:12`), porque o DDD 61
  marca os casters ele mesmo (`markShadowCasters`). `sceneNodeCount = −1` pula a divergência
  de nós. **Nenhum C++ novo.** A ordem de submissão (passe nativo antes da leitura) já foi
  provada pela SPEC-0245 no mesmo caminho.
- **Hermes:** nada de `for…of` em `Map`, `let` em closure de `for` nem getter via `super`. Por
  quadro: um `writeBuffer` de 24 floats, e só quando muda.

## Desenho

### 1. Bloco do grupo 1 (`frame/shadow.ts`)

| binding | recurso |
| --- | --- |
| 8 | UBO `NativeShadowParams` (24 floats) |
| 9 | `sampler_comparison` (less-equal, nearest, clamp) |
| 10 | `texture_depth_2d`: o `GPUTexture` de `light.shadow.map.depthTexture` (via `host.backend.get`), ou uma textura 1×1 vazia enquanto ele não existe |

`NativeShadowParams` (std140): `matrix` (mat4, floats 0–15), `normalBias` (16), `bias` (17),
`mapSize` (18–19), `intensity` (20), `enabled` (21), `uvShift` (22–23).

- A fábrica recebe o host do `three` (2 linhas no núcleo, combinadas com a Frente C:
  `FrameBlockFactory = (device, host)`).
- A luz: a `DirectionalLight` da cena com `castShadow`, achada por `traverse` e guardada. Se
  não houver nenhuma, a busca é refeita a cada `LIGHT_RESCAN_FRAMES`.
- `enabled = 0` (e `nativeShadow` devolve 1) quando: não há luz com sombra, o `shadowMap` do
  renderer está desligado, o tipo não é PCFSoft, ou o mapa ainda não tem `GPUTexture`.
- O `GPUTexture` trocou (o `three` recria ao mudar o `mapSize`): `version++`, e o servidor
  refaz o grupo 1.

### 2. Passe C++ do mapa único (`shadow/NativeSunShadowPass.ts`)

Chamado pelo bloco no `update`, antes de escrever os parâmetros:

- **Quer redesenhar** quando `needsUpdate`, quando assumiu um `autoUpdate = true` (guarda
  isso e baixa o `autoUpdate`), ou quando o braço do `?parityFreeze` trocou.
- **Braço `three`** (`mainPassArm.three`) ou recusa (gate, sem espelho, sem alvo): devolve ao
  `three` (`needsUpdate = true` e, se assumiu o `autoUpdate`, `autoUpdate = true`). O pior
  caso é não ganhar o redesenho, nunca perder a sombra (mesma regra do CSM).
- **Braço nativo:** `updateMatrices` → `viewProj` em `Float64Array` → registro de geometria
  dos casters (`CasterGeometryRegistry`, com `drainNewGeometries`) →
  `activeSceneMirror().drawShadowPass(...)` no `GPUTexture` do mapa → `needsUpdate = false`
  (o `ShadowNode` do `three` não redesenha).
- Relato `debug('perf', '[nativeSunShadow] ASSUMIU|DEVOLVEU motivo=…')`, só quando muda.

### 3. Interruptores (só dentro de `?nativeRenderer=1`)

- `?nativeShadow=0` desliga a parte 1 (`enabled = 0`).
- `?nativeShadowPass=0` desliga a parte 2 (o `three` desenha o mapa como hoje). A parte 2 vem
  ligada dentro do `?nativeRenderer=1`, que já é desligado por padrão.
- Casos de resposta conhecida (a paridade tem de dar FAIL):
  - `?nativeShadowShift=1`: desloca em `SHIFT_TEXELS` a amostragem dos receptores
    **nativos** (parte 1);
  - `?nativeShadowPassShift=1`: desloca em `SHIFT_TEXELS` o `viewProj` do passe C++, ou seja,
    o **mapa** (parte 2).

## Testes

- Vitest (`tests/render/native/shadow.test.ts`):
  - o WGSL do bloco tem as 16 comparações e a mistura por `intensity` da referência (o porte
    em TS do PCFSoft previsto no desenho saiu: só provaria a si mesmo, e a prova da fórmula é a
    paridade no host);
  - bloco: parâmetros escritos da luz, `enabled = 0` em cada condição, `version` sobe quando
    a textura troca, `updateMatrices` chamado só no quadro de redesenho;
  - passe: decisão de redesenho (`needsUpdate`, `autoUpdate`, troca de braço), devolução ao
    `three` na recusa e no braço `three`, `needsUpdate = false` quando assume, deslocamento
    do plantado.
- `cortex_host_tests`: sem C++ novo; a suíte do passe de sombra tem de seguir verde.

## Critério de aceite da etapa

- `SHADOW_READY = true`; testes verdes.
- `check-stage.sh <wt> r1-3 --flag '&nativeRenderer=1&nativeRendererModels=unlit'` PASS
  (galeria + Setor O/Comercial dia e noite + fumaça), com o passe C++ do mapa assumindo no
  braço nativo (relato `ASSUMIU` no `run.log`).
- O mesmo com `&nativeShadowPassShift=1`: FAIL.
- Paridade da amostragem nativa no chão (parte 1) e `&nativeShadowShift=1` FAIL: **dependem
  do receptor lambert da Frente A**. Ver "Como ficou".
- Custo: rodada curta `?sombra=0` × ligada; o alvo de ≤ 0,3 ms de render é conferido no
  aceite final do R1.

## Consequências

- Os modelos da Frente A chamam `nativeShadow(positionWorld, normalWorld)` (normal de mundo
  normalizada) e multiplicam **só** o termo direto do sol, como o `three`.
- ponytail: sem mapa próprio. Se o `three` nunca criou o `shadow.map` (nenhum receptor dele
  foi desenhado), não há o que amostrar nem onde desenhar, e a sombra fica desligada
  (`enabled = 0`). Hoje isso não acontece no DDD 61: há receptores do `three` até o fim do
  R1.5. Quando a R1.6 tirar o `three` da cena, o bloco cria a `DepthTexture` própria (no
  `mapSize`) e o passe C++ desenha nela.
- `reversedDepthBuffer` não é suportado: o passe C++ já limpa em 1 e compara com `Less`.
