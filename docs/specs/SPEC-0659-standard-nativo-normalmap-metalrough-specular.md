# SPEC-0659 — `standard` nativo com normalMap, metal/rough, specular/ior e cor de vértice

**Data:** 2026-11-02
**Status:** implementado (paridade da galeria provada; medição no DDD 00 em "Como ficou")

## Como ficou

- **Paridade da galeria** (`check-stage.sh <wt> spec0659-nr --flag '&nativeRenderer=1' --points '' --smoke-point ''`):
  PASS, alt 0/ctrl 0, 0,0000%. Pipelines nascidos: `standard|map+metalRoughMap+normalMap+fog+receiveShadow+doubleSide`,
  `map+normalMap+…`, `map+vertexColors+…`, `vertexColors+…+doubleSide` e o Physical com ior (`fog+receiveShadow`).
  Recusas na cena: só `toon`/`outline` (4), fora desta SPEC.
- **Resposta conhecida** (`&nativeRenderer=1&nativeTint=1`): FAIL 66,5%, então o nativo desenha.
- **DDD 00 no export** (200 s em janela, autopiloto `walk`, mediana das 12 últimas amostras do `cpu`):

  | | antes | depois |
  | --- | --- | --- |
  | recusados / objetos no censo | 278 / 456 | 28 / 349 (todos `colorNode`) |
  | `sceneRender` (three em JS) | 83–89 ms | 37 ms |
  | `nativeEmit` | 44 ms | 23 ms |
  | `world` | 39–58 ms | 85 ms |

  O quadro continua acima de 100 ms (o `fps` do trace satura em 10): sobram o `world`, pausas de GC
  de ~60 ms (alocação de ~80 MB/s) e as 28 recusas por `colorNode`. Os picos de `syncPlayerSkin`
  (57–85 ms em amostras soltas, <1 ms nas outras) são GC caindo dentro da seção; a rodada base também
  tem um. Com quadros de vários segundos o trace avança devagar (soma o `deltaMs` limitado a 100 ms):
  200 s de relógio deram ~26 s de trace.
- **Armadilha do instrumento:** sem `&nativeRenderer=1` a galeria **não liga** o renderer próprio, e a
  paridade dá PASS 0/0 até com `nativeTint`, porque os dois braços são o `three`. Sempre rode a prova
  com tinta junto.

Extensão do modelo `standard` do renderer nativo (SPEC-0535, R1.2). Sem bifurcação arquitetural:
segue o método do R1, que porta a matemática do WGSL que o `three` 0.184 gera.

## Contexto

O DDD 00 (Port Hollow) roda a ~1–10 fps no export nativo. O censo (`?rendererCensus=1`, 02/11) dá
**278 de 456** objetos do quadro recusados pelo renderer nativo. Eles caem no `three` em JS, com
`sceneRender` de 90–1000 ms por quadro e ~230 MB/s de alocação. Motivos (`lit`):
`standard:feature:specularIor=107`, `metalRoughMap=100`, `normalMap=71`. Como o censo nomeia só a
primeira feature recusada, por trás dessas aparece também `vertexColors`. Aceitas essas quatro
features, as combinações do censo somam todas as 278 recusas.

Origem: os GLB do kit vêm do Blender com `KHR_materials_specular` (o loader cria
`MeshPhysicalMaterial` só com `ior`/`specular*`), com `metallicRoughnessTexture` e `normalTexture`.

## Decisão

WGSL de referência: `?wgslDump=1` no export do DDD 00, classes
`standard+doubleSide+fog+map+receiveShadow+specularIor` (0006) e
`…+metalRoughMap+normalMap+receiveShadow` (0008).

1. **specularIor**: o `three` calcula
   `F0 = min(((ior − 1)/(ior + 1))² · specularColor, 1) · specularIntensity`, e o especular direto
   usa `mix(F0, diffuse, metalness)` com f90 = 1. `SpecularF90` só aparece nos termos de IBL, que
   são zero sem `scene.environment` (SPEC-0535). O F0 vira **parâmetro** (`specularF0`), calculado
   no JS: 0,04 para o Standard e a fórmula acima para o Physical. A feature não cria variante de
   shader.
2. **metalRoughMap**: uma amostra da textura (o glTF usa a mesma para os dois mapas, e a
   transformação de uv é a da textura): `metalness *= .z` e `roughness *= .y` antes do
   `max(…, 0.0525)`. A difusa também usa a metalness do mapa. **Recusa** quando `metalnessMap` e
   `roughnessMap` são texturas diferentes ou quando só um deles existe (o glTF não gera isso).
3. **normalMap** (tangent space, sem atributo `tangent`): base TBN por derivadas, como o
   `TangentUtils` do `three`, com o eixo Y das derivadas negado do WebGPU:
   `q0 = dpdx(pos)`, `q1 = −dpdy(pos)`, `st0 = dpdx(uv)`, `st1 = −dpdy(uv)`,
   `T = cross(q1, N)·st0.x + cross(N, q0)·st1.x`, `B = … .y`,
   escala `inverseSqrt(max(T·T, B·B))` (0 quando o det é 0), T e B multiplicados pelo sinal da face.
   `normal = normalize(TBN · vec3(n.xy · normalScale, n.z))` com `n = amostra·2 − 1` na uv da
   própria transformação do normalMap. O normal perturbado entra **antes da sombra** (o
   `normalWorld` do viés da sombra e o `dot(N, L)` usam esse normal). A roughness geométrica
   continua no normal da geometria. **Recusa**: `normalMapType` de espaço de objeto, geometria com
   atributo `tangent` (o `three` usaria a tangente do vértice) e `flatShading`.
4. **vertexColors**: o mesmo caminho do `lambert` (`diffuse *= cor do vértice`).
5. Também recusa `specularIntensityMap` e `specularColorMap`, que não são reproduzidos.

Bindings do grupo 2: map, emissiveMap, metalRough, normal e, por último, o DFG.

## Aceite

- Testes unitários do modelo: variantes, recusas, parâmetros e bindings.
- Paridade da galeria (`check-stage.sh … --points '' --smoke-point ''`) com esferas novas:
  metal/rough + normal no estilo glTF (`normalScale.y = −1`, doubleSide), Physical com cor de
  vértice e as esferas que já existem (`standard-map-normal`, `physical-ior-specular`,
  `standard-map-vcolor`).
- Censo do DDD 00 sem as recusas `specularIor`, `metalRoughMap` e `normalMap`, e uma nova medição
  de quadro.

## Consequências

- O `litSurfaceWgsl` (compartilhado com o `lambert`) ganha o trecho do normalMap. Ele só é emitido
  para a variante `normalMap`, que só o `standard` aceita, e lê campos de `Params` que só o
  `standard` declara.
- O `Params` do `standard` cresce de 36 para 68 floats.
