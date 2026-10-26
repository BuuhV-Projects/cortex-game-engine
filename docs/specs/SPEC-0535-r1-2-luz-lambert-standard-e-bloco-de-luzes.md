# SPEC-0535 — R1.2: luz no renderer nativo (`lambert`, `standard` e bloco de luzes)

**Data:** 2026-10-24
**Status:** **implementado** (2026-10-24), desligado por padrão (`?nativeRenderer=1`). O
desenho abaixo foi a proposta; **"Como ficou"** registra o que mudou e vale sobre ele.

## Como ficou

- **Entregue:** bloco de luzes (`frame/lights.ts`: UBO com sol + hemisfério + 8 spots,
  conferido valor a valor contra o `SpotLightDataNode`/`HemisphereLightDataNode` e o
  `lightPosition`/`lightTargetPosition` do `three` no jogo) e o modelo `lambert`. Galeria com 9
  esferas iluminadas sem `receiveShadow`.
- **Recusas temporárias** (cada uma com dono e pendência no backlog do PRD-0466; voltam antes do
  R1.6, porque o aceite final exige 0 recusas):
  - `standard` **fora de `NATIVE_MODELS`** (o modelo e os testes ficam): fachadas do Comercial de
    dia com 1,17% fora da paridade. Dono: Frente A, depois do checkpoint;
  - `lambert` com **emissivo não preto**: com o relógio andando, o vidro das janelas sai ~22%
    abaixo do emissivo do `three`; com hora fixa bate. Descartados por medição: dados de luz,
    parâmetros, textura/sampler, mip, receita, cópia de atributo do `three`, `doubleSide`, clima;
  - `lambert` **instanciado**, aguardando a correção de instâncias da Frente C. Os "fios
    distantes" eram os cabos quebráveis do DDD 61 (`InstancedMesh` compactado a cada `cull()`:
    `setMatrixAt` nas `n` primeiras, `count = n`, `addUpdateRange`). A ordem foi descartada: a
    chave nativa e o `painterSortStable` batem campo a campo, e o z do C++ também vai para a
    `RenderList` do `three`. Com `nativeTint`, quem desenha o fio é o braço nativo; com o
    instanciado recusado, o "alt 223" some;
  - `lambert` com **`receiveShadow`** (`RECEIVE_SHADOW = false`), aguardando a paridade da sombra
    da Frente B: depois do merge A+B, as sombras dos pedestres na calçada diferem até 6/255
    (0,0821%); sem `receiveShadow`, o Comercial de dia passa (0,0030%). O modelo já aplica
    `nativeShadow` só ao sol, na ordem do `wgsl-0019`.
- **Veredito** (`check-stage r1-2-luz-final`, `unlit,lambert,standard` com as recusas acima):
  galeria PASS 0/0 · Setor O dia PASS 0,0001% · Setor O noite PASS 0/0 · Comercial dia PASS
  0,0041% · Comercial noite PASS 0/0 · fumaça 1080p PASS (render 11,61 ms). Prova de resposta
  conhecida `&nativeTint=1` (`r1-2-luz-tint`): FAIL em todas as rodadas, no jogo também (Setor O
  dia 44,4%, Comercial dia 11,5%, galeria 4,7%).
- **`@invariant` na posição do vértice** foi testado e não mudou nada (saiu).
- **Instrumentos novos:** `native/scripts/perf/coverage-diff.mjs` (separa diferença de
  cobertura e de cor numa captura de paridade); `.cortex/renderer-r1/checkpoint-r1-2.sh`,
  `taken-per-frame.sh` e `rs1-per-frame.sh` (resumo de uma linha).
- **Checkpoint A/B** (código anterior às recusas: B = `unlit,lambert,standard`, com standard e
  instanciado ligados; intercalado, 2 réplicas, 1080p, 0 inválidas):

  | ponto | render A → B (ms) | B−A | lista do servidor B−A (draws/quadro) | esperado × 40 µs |
  | --- | --- | --- | --- | --- |
  | setorO (walk) | 11,22 → 9,08 | −2,14 | +37 | 1,48 |
  | centro (walk) | 11,18 → 9,53 | −1,66 | +51 | 2,04 |
  | comercial (walk) | 12,31 → 10,89 | −1,42 | +44 | 1,74 |
  | ac (walk) | 12,35 → 9,34 | −3,00 | +31 | 1,24 |
  | helio (drive) | 10,10 → 8,75 | −1,35 | +32 | 1,28 |

  Soma esperada ≈ 7,8 ms contra 9,6 ms medidos: coerente (só o que sai do `three` puro ganha
  ~40 µs; o que o RS1 já desenhava custa pouco). `frameMs` med −1,35 a −3,40 ms; GC de −71 a
  −468 KB/quadro. O p99 do centro (+11,85) é ruído de 2 réplicas, a conferir no aceite.

Etapa R1.2 do PRD-0466 (ADR-0465), Frente A do R1. Base: SPEC-0495 (R1.1, contrato de modelo,
grupos fixos e costuras) e SPEC-0475 (dado global de luz).

## Contexto

O Lambert é o grosso do DDD 61 (`lambert+emissiveMap+fog+map` ≈ 18–20 draws/amostra no Setor O)
e o Standard vem dos GLB (carros, placas). Censo do R0 (18 amostras por ponto, 5 pontos): os
Lambert/Standard **sem** feature de núcleo (instância, transparência, estado) e **sem**
`receiveShadow` somam ≈ 72 draws/amostra no Setor O, 58 no Hélio, 49 no Centro, 45 no AC e 44
no Comercial — é o que esta etapa pode tirar do `three`. Com o custo medido de ~40 µs por draw
do `three`, o render deve cair ≈ 1,8 a 2,9 ms conforme o ponto.

Classes cobríveis no censo (soma das 18 amostras × 5 pontos): `lambert+fog+map+vertexColors` 86,
`lambert+emissiveMap+fog+map+vertexColors` 86, `lambert+fog+vertexColors` 83,
`lambert+doubleSide+fog+vertexColors` 69, `standard+doubleSide+fog+map` 62,
`lambert+emissiveMap+fog+map` 60, `standard+fog` 59, `standard+fog+map` 52,
`standard+doubleSide+emissiveMap+fog+map` 41, `lambert+fog` 7, `lambert+fog+map` 1.

`specularIor` (Physical do GLB) aparece **0 vezes** nos 5 pontos, e não há WGSL de referência
para ele: fica recusado (YAGNI; volta quando um jogo tiver). `alphaTest` só aparece junto de
`transparent` (núcleo, R1.4), mas entra nos dois modelos porque é uma linha e o R1.4 vai precisar.

## Como o Godot faz (clone 4.7.2 `ed1daf0b`; anexo `docs/prds/0466-anexos/godot-renderer-rd.md` §6)

- `servers/rendering/renderer_rd/storage_rd/light_storage.cpp:692-711` (`set_max_lights`): omni,
  spot e área em **storage buffers** de `max_lights`; direcionais num **UBO** de
  `MAX_DIRECTIONAL_LIGHTS`.
- `light_storage.cpp:714` (`update_light_buffers`): uma escrita por quadro sobre as luzes do cull;
  as locais são ordenadas por distância e truncadas no máximo.
- `shaders/forward_clustered/scene_forward_clustered.glsl:1131`: as direcionais são um laço
  simples sobre o UBO até `directional_light_count`; as locais passam pelo cluster.
- Mobile (`render_forward_mobile.h:62`, `MAX_RDL_CULL = 8`): até 8 luzes por objeto, sem cluster.

## Como fazemos aqui (o `three` no host)

O host liga a `DynamicLighting` do `three` (SPEC-0435, `src/render/DynamicLightingSwitch.ts`:
máx. 2 direcionais, 8 pontuais, 8 spots, 1 hemisfério). No WGSL que o `three` 0.184 gera para o
DDD 61 (R0, `D:/jogos/detetive-brasilia/.cortex/renderer-r0/wgsl/`):

- o **sol** projeta sombra, então **não** entra no lote (`canBatchLight` exige `castShadow=false`):
  vira uniforme do estado — posição e alvo em mundo, direção = `normalize((view * (pos − alvo, 0)).xyz)`,
  cor = `color × intensity`;
- o **hemisfério** é um laço até a contagem (`HemisphereLightDataNode`): céu e chão × intensidade,
  direção = posição em mundo normalizada, `mix(chão, céu, dot(normalMundo, dir)·0,5 + 0,5)`. O laço
  **zera** a irradiância a cada volta (só o último vale; com máx. 1 não faz diferença) — portado igual;
- os **spots** são um laço até a contagem (`SpotLightDataNode`): posição em vista + `distance`,
  direção (posição − alvo) em vista + `decay`, cone `cos(angle)` / `cos(angle·(1 − penumbra))`,
  atenuação `getDistanceAttenuation` e `smoothstep` do cone;
- as luzes vêm da projeção (`renderList.pushLight`), ordenadas por `id` (`sortLights`), e a
  contagem é cortada no máximo configurado.

O DDD 61 tem exatamente isso: 1 sol com sombra, 1 hemisfério, 6 postes + 2 faróis (spots sem
sombra). As luzes nascem no carregamento e nunca saem: acendem/apagam pela `intensity`.

## Validação de aplicabilidade

- **Cluster (Godot clustered):** não se aplica. São 8 spots; o laço até a contagem é o que o
  `three` já faz. Cluster só se um jogo tiver dezenas de luzes locais (PRD-0466, evolução).
- **Storage × UBO:** a SPEC-0475 propôs storage para as locais; com teto fixo de 8 (igual ao do
  `three`), **um UBO** de tamanho fixo basta e é o que o `three` usa (`uniformArray`). Um buffer,
  uma escrita por quadro, nenhuma variante por contagem (acender poste não recompila — o problema
  da SPEC-0150 do jogo).
- **Sol no bloco de luzes (grupo 1), não no de vista:** o R1.1 fixou o grupo 1 = blocos de
  quadro, com luzes nos bindings 0–7. Sol + hemisfério + spots no mesmo UBO.
- **Lista de luzes do quadro:** o `beginFrame` do núcleo roda no início da projeção, antes de o
  `three` coletar as luzes (o `lightsArray` da `RenderList` é zerado no `begin()` e reenchido
  durante a projeção). O bloco então **varre a cena** à procura de luzes só quando a cena muda
  (outra raiz ou outro nº de filhos da raiz) e, por quadro, filtra as visíveis (cadeia de `visible`
  + `layers` da câmera) e ordena por `id`. No DDD 61 é exato (luzes fixas desde o load). Costura
  ideal, pendente na Frente C: o núcleo entregar ao bloco as luzes do quadro depois da projeção.
- **Recusa em vez de aproximação:** luz que o bloco não reproduz (pontual, ambiente, área, sonda,
  mais de uma direcional, spot com sombra/`map`/`colorNode`) ou `scene.environment` presente →
  o bloco marca o quadro como não suportado e os modelos **recusam** objetos novos (motivo
  `lights:<tipo>`). Objeto já tomado continua (no DDD 61 isso não acontece).
- **naga/Hermes:** a LUT DFG do Standard é amostrada com `textureSampleLevel(…, 0)` (a textura não
  tem mips; dispensa a análise de uniformidade, já que o módulo do modelo vem depois das
  declarações e não pode pôr o `diagnostic(off, …)` global que o `three` põe). Sem `for…of` em
  `Map` nem `let` em closure de laço no caminho por quadro.
- **Sombra:** `receiveShadow` é recusado enquanto `SHADOW_READY` for `false` (o stub de
  `frame/shadow.ts`); o modelo já chama `nativeShadow(posMundo, normalMundo)` no sol para quando a
  Frente B ligar.

## Desenho

### 1. Bloco de luzes (`frame/lights.ts`, grupo 1 binding 0, UBO, fragmento)

| linha (vec4) | conteúdo |
| --- | --- |
| 0 | `sunColor.rgb`, `spotCount` (u32) |
| 1 | `sunPosition.xyz` (mundo), `hemiCount` (u32) |
| 2 | `sunTarget.xyz` (mundo), — |
| 3 | `hemiSky.rgb` (× intensidade), — |
| 4 | `hemiGround.rgb` (× intensidade), — |
| 5 | `hemiDirection.xyz` (mundo, normalizada), — |
| 6–13 | `spotPositionCutoff[8]`: posição em vista + `distance` |
| 14–21 | `spotColor[8]`: `color × intensity` |
| 22–29 | `spotDirectionDecay[8]`: direção em vista + `decay` |
| 30–37 | `spotCone[8]`: `cos(angle)`, `cos(angle·(1 − penumbra))` |

Sem sol: cor 0 e posição ≠ alvo (evita `normalize(0)` = NaN, que contaminaria a soma).
Helpers WGSL para os modelos: `nativeSunDirection()`, `nativeHemiIrradiance(normalView)`,
`nativeSpot(i, positionView)` → (direção, cor atenuada). O BRDF fica no modelo.

### 2. Modelo `lambert` (`models/lambert.ts`)

- Features aceitas: `map`, `emissiveMap`, `vertexColors`, `fog`, `alphaTest`, `uvTransform`,
  `noToneMap`; `doubleSide` lido de `material.side` (vira variante: normal × `front_facing`);
  `BackSide` recusado. Qualquer outra (inclui `receiveShadow`, `normalMap`) = recusa.
- Parâmetros: `color`, `opacity`, `emissive` (já × `emissiveIntensity`), `alphaTest`,
  `uvTransform` do `map` e do `emissiveMap` (cada mapa tem a sua, como no `three`).
- Fórmula (WGSL de referência `lambert+fog`, `+emissiveMap+map+vertexColors`, `+alphaTest`,
  `+doubleSide`): `diffuse = vec4(cor,1) × map × vcor`; `a ×= opacity`; `discard` se
  `a ≤ alphaTest`; `a = 1`; emissivo = `vec4(emissivo,1) × emissiveMap`; direto = sol +
  spots com `saturate(dot(N,L)) × corLuz × diffuse/π`; indireto = irradiância × diffuse/π;
  saída = `max(vec4(direto + indireto + emissivo, a), 0)` e névoa `smoothstep(near, far, −z)`;
  saída linear.

### 3. Modelo `standard` (`models/standard.ts`)

- Mesmas features do Lambert, menos `vertexColors` (não aparece no censo); `metalRoughMap`,
  `normalMap` e `specularIor` recusados.
- Parâmetros: `color`, `opacity`, `metalness`, `roughness`, `emissive`, `alphaTest`, os dois
  `uvTransform`.
- Fórmula (WGSL de referência `standard+fog+map`, `+doubleSide+emissiveMap`): rugosidade
  geométrica `min(max(r, 0,0525) + max(|dpdx n|, |dpdy n|), 1)`; `F0 = mix(0,04, diffuse, metal)`;
  difuso × `(1 − metal)`; especular direto = `BRDF_GGX_Multiscatter` (Schlick, `V_GGX_SmithCorrelated`,
  `D_GGX` + termo multiespalhado com a LUT DFG 16×16 RG16F do `three`, copiada byte a byte de
  `three/src/nodes/functions/BSDF/DFGLUT.js` — ela é privada do módulo). Os termos de IBL
  (`radiance`/`iblIrradiance` = 0 sem `scene.environment`) multiplicam por zero e ficam de fora,
  como os laços mortos do `unlit`.

### 4. Galeria

Entradas novas **no fim** de `entries`, com `receiveShadow` desligado (o laço da galeria liga em
todas; sem isso a recusa por sombra deixaria tudo no `three`): Lambert cor, mapa+vcor,
emissivo, `alphaTest`, `doubleSide`; Standard metal, mapa, emissivo, `doubleSide`+mapa.

## Testes

- Vitest: `lambert`/`standard` — variante e recusas (`receiveShadow`, `BackSide`, `normalMap`,
  `specularIor`, luz não suportada), atributos por variante, parâmetros (emissivo × intensidade,
  `uvTransform` de cada mapa), WGSL contém o que a variante pede; `lights` — layout do UBO
  (sol, hemisfério, spots em vista, cone, corte em 8, ordem por `id`), luz invisível fora,
  sem sol sem NaN, tipos não suportados.
- Paridade: `check-stage.sh` com `nativeRendererModels=unlit,lambert,standard` (galeria + Setor O e
  Comercial, dia e noite, fumaça 1080p) = PASS; com `&nativeTint=1` = FAIL, visível no jogo.
- Checkpoint A/B completo (regra do PRD-0466): intercalado, 2 réplicas, 4 pontos walk + drive no
  Hélio, 1080p; render cai ≈ draws cobertos × 40 µs.

## Consequências

- O R1.3 (sombra) só precisa virar `SHADOW_READY` e trocar o stub: os modelos já chamam
  `nativeShadow` no sol e passam a aceitar `receiveShadow` sozinhos.
- Luz nova em runtime fora do padrão do DDD 61 (adicionada a um nó que não é filho direto da raiz,
  depois do 1º quadro) só entra na próxima varredura — limitação registrada até a costura do
  núcleo existir.

## Adendo (2026-10-24): `@invariant` na posição dos modelos iluminados; `standard` religado

Com o emissivo corrigido no núcleo (SPEC-0555, `ecaf612f`), o `standard` ainda dava lascas
coplanares nas linhas da calçada do Comercial de dia (0,0140%, alt 7). A causa é precisão: o
`lambert` e o `standard` calculam a mesma posição em módulos diferentes, e o compilador pode
arredondar diferente; em superfícies coplanares, isso troca qual desenho vence o teste de
profundidade. A saída `@builtin(position)` do `VOut` compartilhado (`litVertexWgsl`) passou a ser
`@invariant`, o recurso do WGSL para isso. Resultado (`check-stage std-inv-final`, `e1cede4`,
`unlit,lambert,standard,wgsl`): tudo PASS com 0,0000% (galeria, Setor O e Comercial, dia e
noite) e fumaça PASS (render 10,04); `&nativeTint=1` (`std-inv-tint`): FAIL em todas as rodadas.
O `standard` volta para `NATIVE_MODELS`.

## Adendo (2026-10-25): resíduo `variant:*` nomeado e coberto (`alpha` nos modelos iluminados)

O resíduo `variant:lambert` (2–4) e `variant:standard` (até 4) do integrado era **`feature:alpha`
na criação**: objetos que estavam transparentes no quadro em que o núcleo os tomou (Lambert sem
nome; Standard das lojas grandes `loja_brasileiras`, `loja_luzia`, `loja_paraiba`,
`restaurante_popular`). Ficam opacos depois, mas a recusa fica em cache, então a amostragem do
censo não os via. O censo passou a gravar a recusa **no momento** em que ela acontece
(`litBuilt`; resumo: `native/scripts/perf/lit-refusals.sh`). Cobertura: `lambert` e `standard`
aceitam a feature `alpha` do núcleo e só forçam `a = 1` no opaco, como o `three` no
`wgsl-0050`/`wgsl-0060` (o resto da fórmula é igual). Resultado: `check-stage lit-alpha`
(`e1cede4`, `unlit,lambert,standard,wgsl`) tudo PASS 0,0000%, fumaça PASS (render 9,51);
`lit-alpha-tint` FAIL em todas; censo do Setor O e do Comercial: nenhuma recusa na criação.

## Adendo (2026-10-26): `instanceColor` nos modelos iluminados; censo não conta recusado como coberto

**Achado (Frente D, dirigindo no Centro):** o `standard` recusa `instanceColor`, e o `lambert` instanciado
com cor também. Eram malhas instanciadas da Feira (`feira`, 5 recusas na criação), da Feira do Guará
(`feira_guara`, 2) e um `MeshLambertMaterial` instanciado com cor (2), ~0,3 objetos por amostra caindo no
three. O censo marcava 100% porque contava como coberto o que o classificador cobre, mesmo quando o
modelo iluminado recusava (`litCensusReason`).

**Fórmula (three r184, `NodeMaterial.setupDiffuseColor`, `NodeMaterial.js:855-860`):** depois da cor dos
vértices e antes da opacidade, `colorNode = vInstanceColor.mul(colorNode)`, com o `vInstanceColor`
(`vec3`) do atributo de instância (`InstanceNode`). É o mesmo nó para todo `NodeMaterial`: o `unlit` já
o porta (R1.4, SPEC-0555) com o texto WGSL normalizado `diffuse = vec4<f32>(instanceColor, 1.0) * diffuse`,
e o `lambert`/`standard` passam pelo mesmo `setupDiffuseColor`.

**Decisão:**

- `instanceColor` entra nas features aceitas do `lambert` e do `standard`. O atributo vai para o `VIn`
  (semântica `instanceColor` do núcleo) e para o `VOut` (`@location(5)`), e o prólogo do fragmento
  (`litSurfaceWgsl`) aplica a fórmula acima depois do `vertexColors`.
- **Censo:** `covered` conta só o que o classificador cobre **e** o modelo iluminado desenha
  (`litCensusReason` nulo). Recusa do modelo conta em `refused` (o motivo continua em `lit`).

**Validação:** galeria com `lambert` e `standard` instanciados com `instanceColor` no fim de `entries`;
`check-stage` (sem flags de renderer na query) PASS e `nativeTint` FAIL; censo no Centro dirigindo
(`&drive=1&hora=18&rendererCensus=1`) com 0 recusas.
