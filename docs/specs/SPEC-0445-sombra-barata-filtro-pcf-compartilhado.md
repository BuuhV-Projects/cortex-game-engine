# SPEC-0445 — Sombra barata no export: filtro PCF com uniformes compartilhados

**Data:** 2026-10-24
**Status:** **ligado por padrão no host** (A/B abaixo); `?sharedShadowFilter=0` desliga

Decisão do usuário (2026-10-23): a sombra do sol do DDD 61 **fica** (vira opção de
qualidade no futuro); 3,2 ms de CPU por uma sombra direcional simples é defeito
da engine. Frente seguinte à SPEC-0435.

## Medição (antes de mexer)

DDD 61 `e2be01c`, export com RS1 e `DynamicLighting` ligados, kit SPEC-0382,
`--autopilot walk`, Comercial, 2 réplicas intercaladas, sombra ligada ×
`?sombra=0` (sonda de relógio temporária, sem a sonda de fases):

| por quadro | sombra ligada | sem sombra |
| --- | --- | --- |
| render | 14,1 ms | 11,2 ms |
| grupos compartilhados conferidos | **~20,8 (≈1,77 ms)** | **3 (≈0,16 ms)** |
| `updateBefore` | ~0,18 ms | ~0,03 ms |
| nós de render | ~1,0 ms | ~0,9 ms |
| estados de shader | ~54 | ~53 |

O número de estados é o mesmo; o que muda é que, com a sombra, cada estado que
**recebe** sombra (`receiveShadow`, o chão no DDD 61) ganha um grupo "render"
**só dele** — conferido e regravado a cada render.

### Causa (sonda dos bindings, temporária)

O grupo "render" dos estados receptores é idêntico entre eles (câmera, luzes,
sombra: `bias`, `intensity`, `normalBias`, matriz) **menos um uniforme**: um
`Vector2` com `onUpdate`, de id diferente em cada estado. É o `mapSize` do filtro
PCF. No `three` 0.184, `PCFShadowFilter` (`three.webgpu.js:43690`) é um `Fn` do
TSL que cria `reference('mapSize', 'vec2', shadow)` e `reference('radius',
'float', shadow)` **dentro do corpo** — o corpo roda a cada build de material, e
cada material receptor ganha uniformes próprios no grupo **render**. Como o
`_getBindGroup` (`:50150`) só reaproveita um grupo compartilhado entre estados
quando a lista de nós é a mesma, cada estado receptor fica com o seu.

## Como o Godot faz

Repositório `godotengine/godot`, commit `c8256a8`:

| o quê | onde |
| --- | --- |
| cascatas da direcional montadas uma vez por quadro | `servers/rendering/renderer_scene_cull.cpp:2178` (`_light_instance_setup_directional_shadow`), frustum por cascata `:2389-2397` |
| casters cortados na MESMA passada de culling da câmera, em threads | `renderer_scene_cull.cpp:3267-3272` dentro de `_scene_cull_threaded` (`:2910`, disparado em `:3472`) |
| passes de sombra | `renderer_rd/forward_clustered/render_forward_clustered.cpp:1666-1685` (`_render_shadow_begin/process/end`), direcional `:1670`, `_render_shadow_pass` `:2700`; atlas `:1645` |
| quem RECEBE a sombra | os dados da direcional (matrizes, bias, tamanho do atlas) vão no buffer global de luzes (`renderer_rd/storage_rd/light_storage.cpp:729`, `:1279`); o atlas é ligado uma vez por passe — **custo de CPU por material/objeto receptor: zero** |

## Comparação

| | Godot | `three` 0.184 no export |
| --- | --- | --- |
| parâmetros do filtro/sombra | 1 vez por quadro, no buffer de luzes | `mapSize`/`radius` recriados por material receptor (bug estrutural do filtro em `Fn`) |
| grupo de dados de cena | 1 por vista | 1 por estado receptor (deixa de ser compartilhado) |
| casters | culling em C++ junto da câmera | o jogo desenha o mapa a cada 3 s (custo medido baixo, RS4 cancelado) |

## Validação: cabe aqui?

Sim, e barato: o `three` já tem o ponto de troca (`shadow.filterNode` e
`ShadowNode.getShadowFilterFn`, `:44265`/`:44413`). Um PCF com **o mesmo
cálculo**, mas com `mapSize` e `radius` criados **uma vez por sombra** (cache por
objeto `LightShadow`), devolve os estados receptores ao grupo compartilhado —
mesma imagem por construção (mesmo WGSL a menos de nomes de uniforme). Hermes:
nenhum custo por quadro novo; o ganho é parar de conferir ~18 grupos por render.
Não exige mexer no sistema de nós do `three` nem no vendor.

## Desenho

- `src/render/SharedShadowFilter.ts`: `sharedPCFShadowFilter` e
  `sharedPCFSoftShadowFilter` (cópias literais do `PCFShadowFilter` e do
  `PCFSoftShadowFilter` 0.184 — o PCF soft tem o mesmo defeito, e é o tipo que a
  engine impõe: `SceneBuilder.ts:624`, `OutdoorLighting.ts:510`) com as referências
  vindas de um cache por sombra, e `installSharedShadowFilter()`, que troca o
  `ShadowNode.prototype.getShadowFilterFn` para os dois tipos (Basic e VSM seguem
  os do `three`).
- **Armadilha 1 (medida):** o cache não pode ser indexado pelo `shadow` que o corpo
  do `Fn` recebe — a chamada do TSL converte os argumentos e entrega outro objeto
  a cada build. Indexado pelo `mapSize` (o mesmo `Vector2` sempre).
- **Armadilha 2 (medida):** o tipo em uso no DDD 61 é `PCFSoftShadowMap` (2), não o
  `PCFShadowMap` que o jogo pede — a primeira versão só cobria o PCF e não fazia
  nada (pego pelo log de `getShadowFilterFn` e pelos ids dos uniformes iguais).
- Só no host (Studio intocado), interruptor `?sharedShadowFilter=0|1`.

## Critério

A/B com autopiloto (walk no Comercial e no Centro; um par dirigindo), 2
réplicas: render e % > 33 ms melhores, sem regressão; paridade com a sombra
visível; e o mesmo par sombra × `?sombra=0` repetido para mostrar quanto do
custo da sombra sobrou.

## Resultado (2026-10-24)

Verificação do mecanismo (censo temporário, Comercial): grupos compartilhados
conferidos por quadro **21 → 5** (~1,7 → ~0,32 ms). Paridade por construção: o
WGSL dos estados receptores é idêntico (Standard byte a byte; Lambert só com dois
campos do struct do UBO "render" em outra ordem — os nós compartilhados nascem
antes e o `three` ordena por id; o shader lê por nome).

A/B (kit SPEC-0382, intercalado, 2 réplicas, 12/12 rodadas válidas):

| ponto | render | quadro med | p95 | p99 | % > 33 ms |
| --- | --- | --- | --- | --- | --- |
| Comercial (walk) | 14,13 → 12,22 (**−1,91**) | 27,4 → 26,2 | 37,8 → 34,4 | 42,8 → 42,7 | 13,8% → 8,1% |
| Centro (walk) | 12,61 → 10,97 (**−1,64**) | 23,8 → 21,7 | 31,2 → 28,8 | 33,9 → 39,7 (1 amostra) | 2,0% → 1,5% |
| Helio (drive) | 13,63 → 10,59 (**−3,04**) | 25,1 → 21,6 | 37,1 → 29,5 | 50,1 → 36,6 | 14,4% → 2,1% |

No drive, a réplica A r1 saiu alta (render 15,5); o par r2 sozinho ainda dá −1,2.

### Quanto a sombra custa agora (Full HD, walk, Comercial, 2 réplicas, 4/4 válidas)

Com o filtro compartilhado ligado por padrão: sombra ligada × `?sombra=0` → render
12,02 × 11,66 ms (**−0,37 ms**), GPU ~1,07 × ~1,06 ms. Antes do filtro, a mesma
comparação dava **−3,2 ms**: a sombra do sol caiu de ~3,2 para ~0,4 ms de CPU
(o redesenho do mapa a cada 3 s e o `updateBefore` do `ShadowNode`).
