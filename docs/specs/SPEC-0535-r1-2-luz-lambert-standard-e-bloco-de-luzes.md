# SPEC-0535 — R1.2: luz no renderer nativo (`lambert`, `standard` e bloco de luzes)

**Data:** 2026-10-24
**Status:** em implementação (desligado por padrão: `?nativeRenderer=1&nativeRendererModels=…,lambert,standard`)

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
