# SPEC-0357 - Zero alocação por quadro no JS do engine (B1) e veredito do B3

**Data:** 2026-10-22
**Status:** em andamento
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
- **Jogo medido: DDD 61 em `dff1386` (09/10)** — o mesmo das rodadas R3/R4. O jogo da main não roda no
  export (ver Consequências).

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

_(render por fase, depois e B3: abaixo)_

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

## Consequências

- Uma leitura de `HeapInfo` por chamada a `__cortexGcStats()` (2×/s, só com métricas ligadas).
- O DDD 61 da main não roda no export nativo hoje: `audio/carRadio.ts` (14/10) faz `new Audio()` e o
  host não tem `HTMLAudioElement`; e mesmo antes disso (jogo em `ae5caef`) o boot chega ao
  `GameLoop: rAF agendado` e nenhum tick roda. Fora do escopo desta SPEC — registrado para decisão.
