# SPEC-0357 - Zero alocação por quadro no JS do engine (B1) e veredito do B3

**Data:** 2026-10-22
**Status:** aceito
**Relacionados:** PRD-0009 (B1 e B3), SPEC-0264 (`__cortexGcStats`), SPEC-0321 (`text-vivo`), SPEC-0250 (`cpuAvg`/`cpuP99`)

## Contexto

No export nativo o JS roda no Hermes sem JIT. Todo objeto temporário criado num laço por quadro
(`Vector3`, `Matrix4`, `Box3`, arrays, objetos literais, closures, iteradores) alimenta o coletor
Hades; a hipótese do PRD-0009 é que essas coletas aparecem como picos no p95 do `frameMs`.

O `__cortexGcStats()` contava coletas e durações, mas não **quanto** o JS aloca: não havia como dizer
"o quadro aloca X KB" nem atribuir a alocação a um sistema.

## Decisão

### 1. Instrumento

- `__cortexGcStats()` ganha `allocatedMB`: o `totalAllocatedBytes` do Hermes (cumulativo desde o boot,
  mantido pelo Hades em toda alocação, young e old). A diferença entre duas leituras é o que o JS alocou
  no intervalo. O `perf-trace.jsonl` já grava o objeto em cada amostra (`gc.allocatedMB`).
- Alocação por quadro = Δ`allocatedMB` / Δt ÷ fps do host.
- Para atribuir por seção, uma sonda **temporária** (não commitada) leu o total antes/depois de cada
  seção do `FrameProfiler`, de cada `System.update` e das fases do render do three, descontando o custo
  da própria leitura (306 bytes, calibrado no boot).

**Validação (caso de resposta conhecida):** a sonda alocava, em janelas alternadas de 600 quadros, um
array preenchido de tamanho fixo. Nas janelas ligadas o total por quadro subiu +116 a +123 KB em relação
às vizinhas, e a seção da alocação conhecida leu 128 KB — seção e total concordam dentro de ~5%. O total
da sonda (470–580 KB/quadro) também bate com o Δ`allocatedMB` do trace (557 KB/quadro), lidos por
caminhos independentes.

### 2. Como medir (para repetir)

- Export **release** (sem `--debug`) da worktree do engine, métricas por `CORTEX_VRAM_LOG=1`, janela
  fora da tela (`CORTEX_WINDOW_OFFSCREEN=1`), `?systemProfile=1&spawn=<ponto>`, 150 s por rodada,
  descartando os primeiros 40 s; dirigindo = `spawn=helio&drive=1` com o piloto por waypoints.
- Rodadas sob o lock `.cortex/measure.lock` do jogo; save isolado (id `ddd-61-bench-b1`).
- Jogo medido: DDD 61 `e2be01c` (principal, seção 4a) e `dff1386` (09/10, referência das R3/R4, seções 3/4b/4c).

### 3. Antes — Setor O, parado

| métrica | valor |
| --- | --- |
| fps do host | 44,1 |
| `frameMs` mediana / p95 / p99 | 22,9 / 33,7 / 42,1 ms |
| alocação JS | 24,0 MB/s ≈ **557 KB/quadro** |
| coletas young | 7,4/s × 2,4 ms (≈ 18 ms/s); old: 0 no trecho |
| quadros com coleta (por quadro, sonda) | mediana +3,5 ms; 37–50% dos quadros acima do p95 têm coleta (base: 17%) |

Atribuição (KB/quadro, regime):

| seção | KB/quadro | dono |
| --- | --- | --- |
| `update` (`onUpdate` do jogo) | 179 | jogo |
| `render` | 147 | engine (three + `src/render`) |
| `world` (todos os sistemas) | 83 | engine + jogo |
| `ui` | 54 | engine (`src/ui/runtime`) |
| `CharacterPhysicsSystem` | 28 | engine — raycast (`nearMeshes`) |
| `ThirdPersonControlSystem` | 27 | engine — raycast da câmera (`nearMeshes.firstHit`) |
| `mirror` (`NativeSceneMirror.update`) | 19 | engine |
| `world.query` dos sistemas | 6,5 | engine |
| `input` | 3 | engine |

### 4. Mudanças (sem mudar comportamento)

- `GamepadManager.poll`: estado do controle reescrito no lugar, em vez de 1 objeto + 3 arrays + 3
  closures por quadro com controle conectado (o caso normal no Xbox). Eventos continuam disparando com
  o estado anterior intacto, como antes.
- `RendererUiBackend.sync`: carimbo de geração + `Map.forEach` com callback fixo no lugar de um `Set`
  novo, uma closure de `forEach` e a iteração `for…of` desestruturada do `Map` (no Hermes: objeto de
  resultado + array `[chave, valor]` por widget por quadro). `render`: só filtra o `_graveyard` quando
  há algo nele.
- `NativeSceneMirror._sincronizarInstancias`: idem, `Map.forEach` com callback fixo.
- **Guarda:** `tests/systems/noPerFrameAllocation.test.ts` falha se algum `System.update()` do engine
  fizer `new Vector2/3/4, Matrix3/4, Quaternion, Euler, Box3, Sphere, Ray, Plane, Color` (inclusive em
  closures dentro dele). O teste prova que acusa com um fixture de resposta conhecida.

### 4a. Medição principal — DDD 61 `e2be01c` (main do jogo)

Depois que a main do jogo passou a rodar no export (SPEC-0392/0393), o A/B foi refeito nela com o kit
de medição (SPEC-0382: `ab.sh`, 2 réplicas ABAB/BABA, 150 s, todas as rodadas VÁLIDAS no
`validate.sh`). A e B usam o **mesmo** `cortex_host` (com o instrumento); A tem o JS da main da engine
nos três arquivos mudados, B a branch. Uma rodada B do Setor O saiu com tudo dobrado (render, world e js,
63 amostras contra ~110) — carga externa — e foi trocada por um par extra B/A.

| ponto | KB/quadro | coletas young/s | pausa young ms/s | fps | `frameMs` p50 | p95 | p99 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Setor O | 960 → **895** (−7%) | 10,5 → 10,0 | 44,0 → 41,8 | 38,2 → 39,0 | 26,1 → 25,8 | 35,1 → 34,8 | 46,6 → 38,4 |
| Centro | 863 → **815** (−6%) | 8,8 → 8,6 | 42,5 → 40,9 | 35,9 → 37,1 | 28,3 → 26,5 | 40,2 → 35,7 | 52,1 → 49,3 |
| Comercial | 1088 → **1035** (−5%) | 10,1 → 9,9 | 47,0 → 44,7 | 33,3 → 33,7 | 29,7 → 29,6 | 44,0 → 40,8 | 57,3 → 48,0 |
| Águas Claras | 1120 → **1074** (−4%) | 10,6 → 9,8 | 46,1 → 43,5 | 33,6 → 32,3 | 30,1 → 31,9 | 43,8 → 44,8 | 60,0 → 57,1 |

- Este jogo aloca o dobro do `dff1386` (~0,9–1,1 MB/quadro, coletas young de ~4,3 ms); o corte do engine
  é o mesmo em valor absoluto (−45 a −65 KB/quadro), então pesa menos em proporção.
- Tempo de coleta young cai 1,6–2,6 ms por segundo em todos os pontos. fps e cauda ficam dentro da
  variação entre rodadas; em Águas Claras a diferença acompanha os draws na tela (198 vs 190 no par 1;
  no par 2, com 161/159, p50 29,9 nos dois lados) — conteúdo diferente, não código. Sem regressão.
- O ponto "dirigindo" não foi medido aqui: o kit ainda não tem piloto.

### 4b. Referência secundária — DDD 61 `dff1386` (antes do kit)

Rodadas ABBA por ponto (A = base, B = esta SPEC; mesma instrumentação dos dois lados, export release,
150–160 s, médias de 2 rodadas por lado). Uma rodada B do Comercial foi descartada e repetida: outra
sessão exportava (bundle + hermesc + pak) durante a janela medida e ela saiu com 36 fps.

| ponto | KB/quadro | coletas young/s | pausa young ms/s | fps | `frameMs` p50 | p95 | p99 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Setor O | 460 → **409** (−11%) | 7,5 → 7,0 | 15,0 → 13,8 | 52,7 → 54,0 | 19,1 → 18,4 | 28,4 → 29,1 | 33,5 → 34,9 |
| Centro | 464 → **412** (−11%) | 7,9 → 7,6 | 14,6 → 14,1 | 54,4 → 57,7 | 18,4 → 17,5 | 28,3 → 26,0 | 33,4 → 31,4 |
| Comercial | 505 → **456** (−10%) | 14,1 → 13,4 | 26,4 → 25,3 | 49,7 → 49,7 | 21,4 → 20,6 | 33,3 → 31,9 | 37,7 → 36,3 |
| Águas Claras | 540 → **470** (−13%) | 8,0 → 7,6 | 15,5 → 15,3 | 49,4 → 52,5 | 20,6 → 19,1 | 30,6 → 29,9 | 40,8 → 36,0 |
| dirigindo (Hélio) | 488 → **423** (−13%) | 8,8 → 7,5 | 16,9 → 14,8 | 55,2 → 58,0 | 18,8 → 17,3 | 28,8 → 25,6 | 32,6 → 30,0 |

- A alocação cai 50–70 KB/quadro em todos os pontos, de forma estável entre rodadas (Setor O: A 461/459,
  B 411/407). Por seção (Setor O, mesma sonda): espelho 20,4 → 2,6 KB, UI −27 KB.
- fps e cauda melhoram na mesma direção em 4 de 5 pontos, mas a diferença é do tamanho da variação entre
  rodadas do mesmo lado (±1,5–3 fps): **não** é um ganho de fps demonstrado.
- **O critério de pronto do B1 no PRD não foi atingido:** a alocação continua em ~410–470 KB/quadro e
  ~7 coletas young/s (13 no Comercial), e 37–50% dos quadros acima do p95 ainda têm coleta. O que resta
  não é do JS dos sistemas do engine: é o `onUpdate` do jogo (~180 KB), os internos do three no render
  (~150 KB) e o raycast (~55 KB) — ver Pendências.

### 4c. Soak (vazamento)

Setor O, ~10 min por lado. As coletas old chegam a cada ~6 min (~250 ms de parede, concorrentes); só os
**vales** depois delas dizem algo sobre vazamento (o `text=` do perf-log é acumulado — SPEC-0321).

| | antes | depois |
| --- | --- | --- |
| KB/quadro | 404 | 356 (−12%) |
| coletas young | 7,45/s (13,3 ms/s) | 6,63/s (11,6 ms/s) |
| fps / p95 | 63,8 / 22,6 ms | 63,9 / 23,6 ms |
| vales `heap-js` | 173,0 → 179,6 MB | 172,3 → 172,2 MB |
| vales `external` | 299 → 329 MB | 298 → 317 MB |
| `text-vivo` | estável (ui 0,0–0,3 + canvas 6,7 MB) | idem |

O heap JS não vaza. O `external` sobe nos dois lados — pendência antiga (soak longo), sem relação com
esta SPEC.

### 5. B3 (skinning/animação em C++): **não é necessário agora**

Medido **no Hermes do export** (benchmark dentro do host, mesmo three e mesmo runtime do jogo): N
personagens com rig de 22 ossos e um clipe de 30 chaves por osso; por quadro, o que o renderer faz por
`SkinnedMesh` — `mixer.update`, `updateMatrixWorld` da hierarquia e `skeleton.update`.

| N | µs por personagem (mixer + matrizes + esqueleto) | ms por quadro | alocação |
| --- | --- | --- | --- |
| 1 | 89 + 25 + 17 = 131 | 0,13 | ~0 |
| 10 | 35 + 27 + 18 = 80 | 0,80 | ~0 |
| 50 | 40 + 30 + 18 = 88 | 4,4 | 0,1 KB |
| 200 | 52 + 40 + 23 = 115 | 22,9 | 0,3 KB |

- **N atual no DDD 61:** 1 (só o detetive passa pelo `AnimationMixer`; os dublês LUC-01 só copiam ossos;
  a multidão é o lote instanciado `CrowdBatch`, cuja pose é JS do jogo, não skinning do three). No
  snapshot medido (`dff1386`) o skinning ainda nem existia: 0 chamadas de mixer e de esqueleto.
- **N projetado:** o desenho do jogo mantém NPCs no lote instanciado; skinning fica em 1–4 personagens
  → 0,1–0,5 ms de um orçamento de 16,7 ms. O detetive mistura vários clipes (o bench usa um), o que pode
  multiplicar o custo do mixer por 2–3 — ainda abaixo de 1 ms.
- **Quando reabrir:** com ~10+ personagens skinados animando ao mesmo tempo (0,8 ms e crescendo linear,
  ~80–115 µs cada). Até lá, o B3 é custo de engenharia sem retorno mensurável.

### 6. Pendências de outras frentes (não mexidas aqui)

- `CharacterPhysicsSystem` (28 KB) e `ThirdPersonControlSystem` (27 KB): a alocação está no raycast de
  `src/physics/nearMeshes.ts` — frente do raycast em C++ (B4), que tira esse caminho do JS.
- `render` (147 KB): aberto por fase (alocação "self", KB/quadro): corpo do `render()` do three 52,
  `RenderObjects.get` 28, `renderObject` 17–26, bindings 6, `draw` 4, resto ≈ 0. É interno do three
  (sem patch no repo) e de `src/render` — frente do desenho nativo (B2), que tira o laço por objeto do JS.
- `update` (179 KB) é o `onUpdate` do jogo — maior fonte isolada; B1 do lado do jogo fica para uma spec
  do DDD 61.
- Controle: o `getGamepads()` do host monta um snapshot novo (~3,6 KB/quadro medido com um controle
  Xbox lido) e o controle é lido **duas vezes** por quadro (`Game` e `UiLayer.pollDevices`). Proposta,
  não implementada: reaproveitar os objetos do snapshot em `native/src/shims/input.cpp`.

## Consequências

- Uma leitura de `HeapInfo` por chamada a `__cortexGcStats()` (2×/s, só com métricas ligadas).
- As seções 3, 4b e 4c foram medidas no `dff1386` porque a main do jogo não rodava no export na época
  (`new Audio()` sem `HTMLAudioElement` no host; resolvido na SPEC-0392/0393).
