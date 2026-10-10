# PRD 0009 - Backlog de performance do host nativo (modelo Godot)

**Data:** 2026-10-10
**Status:** **BACKLOG** — nada iniciado. Retomar quando o jogo for exportado
para rodar no nativo. Até lá o desenvolvimento roda no Studio (V8 com JIT, ~75 fps).

## Contexto

Pergunta de partida: por que o Godot é performático e a Cortex no host nativo não?

- O núcleo do Godot é **C++**. C# e GDScript são só linguagens de script, e o
  laço por objeto por quadro (culling, ordenação, comandos de GPU, física,
  animação) nunca roda nelas. É a arquitetura de **servers** (`RenderingServer`,
  `PhysicsServer3D`): os nós são fachadas com um `RID`, os dados vivem em arrays
  contíguos no C++, e o script só envia o que mudou.
- Na Cortex o JS **é** a engine: o three.js é dono do grafo de cena e percorre
  tudo a cada quadro. No export isso roda no **Hermes, interpretador sem JIT**.
- **JIT não é opção no Xbox** (proibido gerar código executável em runtime). O
  Godot tem a mesma restrição: o C# dele em console roda com **NativeAOT**. A
  lição é a mesma para nós: código quente pré-compilado (C++ ou AOT), código
  interpretado só na lógica de jogo.

Já feito do repertório do Godot (não entra no backlog): LOD/culling por
distância (ADR-0139), vegetação e partículas instanciadas (ADR-0077, ADR-0168),
merge estático no host (ADR-0121), matriz só recompõe se mudou (SPEC-0229), BVH
na colisão (ADR-0108), pool de I/O (ADR-0137), aquecimento de pipelines.

## Backlog (ordem recomendada)

Cada item vira ADR/SPEC próprio **antes** do código, conforme a regra do repo.

### B1 — Zero alocação por quadro no JS (barato, só JS)

O núcleo do Godot não tem GC; no Hermes, cada `new Vector3()` em laço alimenta o
Hades.

- [ ] Medir: `__cortexGcStats()` numa volta do jogo-alvo → alocação/quadro e
      pausas do coletor (método do `validar-performance`; vale = pós-coleta).
- [ ] Listar os sistemas que alocam por quadro (vetores, matrizes, arrays,
      closures, `Box3`) e trocar por rascunhos pré-alocados por módulo e
      `Float32Array`.
- [ ] Regra/lint para impedir `new THREE.Vector3/Matrix4/Box3` dentro de
      `update()` de sistema.
- **Pronto quando:** alocação/quadro em regime cai a um patamar estável e as
  pausas de GC somem do p95 do `frameMs`.

### B2 — "RenderingServer": concluir o ADR-0237 (M0–M8)

O plano do render nativo completo **é** a arquitetura de servers. A mudança de
fundo é inverter a posse dos dados: a cena desenhável vive no C++ e o JS só envia
deltas (criado, removido, transform mudou, material mudou). Isso também resolve
a questão "gráfico construído pelo nativo, não pelo three.js".

- [ ] **M0** — sonda: bindings e pipelines são cacheáveis? (horas; define o
      tamanho do resto).
- [ ] M1 — descrição de material independente de backend.
- [ ] M2 — cache de pipeline em C++.
- [ ] M3 — bind groups/uniformes nativos; `writeBuffer` proporcional ao que se
      moveu.
- [ ] M4 — RenderList nativa (ordem idêntica à do three).
- [ ] M5 — submissão nativa do passe principal (`cpu.render` ≤ 10 ms).
- [ ] M6 — passe de sombra CSM nativo (`cpu.render` ≤ 8 ms).
- [ ] M7 — paridade visual verificável; M8 — flag de retorno e limpeza.
- **Decisão em aberto:** o Studio continua no three.js (V8) e só o export usa o
  servidor nativo, ou o mesmo C++ vai para WASM no Studio para manter uma pilha
  só? Registrar em ADR antes do M4.
- **Pronto quando:** critérios do ADR-0237.

### B3 — Skinning e animação de ossos em C++

No Godot, `Skeleton3D`/`AnimationPlayer` são C++. O ADR-0237 deixou skinning de
fora; com NPCs e trânsito (DDD 61) o custo cresce com o número de personagens.

- [ ] Medir custo de animação por personagem no Hermes (N atual e N projetado —
      validar Big O).
- [ ] Função nativa: "avança animação N por dt e escreve as matrizes de osso num
      buffer" (amostragem/interpolação de clipes + hierarquia em C++).
- [ ] Integrar ao B2 (matrizes de osso direto no buffer de uniformes/storage).
- **Pronto quando:** custo de animação fica ~constante no JS independente de N.

### B4 — Primitivas de gameplay nativas (estilo `move_and_slide`)

No Godot o script chama `move_and_slide`/raycast e o laço roda em C++.

- [ ] Passo do `CharacterPhysicsSystem` (raycasts contra a BVH) como **uma**
      chamada nativa por personagem, ou em lote.
- [ ] Consultas espaciais em lote ("o que está perto de mim", pickups,
      gatilhos) — o maior item do CarSystem era o `Box3` dos pickups.
- [ ] Manter a mesma API no Studio (implementação JS) e no host (nativa).
- **Pronto quando:** sistemas de gameplay não têm laço matemático por
  objeto/por raio em JS.

### B5 — Threads no lado C++

O Godot faz culling, física e gravação de comandos no `WorkerThreadPool`. O
Hermes é thread única, mas o C++ não.

- **Depende do B2:** só dá para paralelizar o que o C++ possui.
- [ ] Culling e montagem da RenderList num worker C++.
- [ ] Física (Rapier) num passo paralelo à lógica, com sincronização no início
      do quadro.
- **Pronto quando:** a thread do Hermes só roda lógica de jogo + envio de deltas.

### B6 — Acompanhar o Static Hermes (AOT)

Equivalente direto do C# NativeAOT do Godot: JS tipado compilado para nativo,
permitido no Xbox.

- [ ] Reavaliar a cada release (veredito de 2026-10-03: imaturo — ~1,36× sem
      tipos, quebrado em clang-cl).
- [ ] Se amadurecer: compilar primeiro os módulos quentes (sistemas de
      gameplay), não o bundle inteiro.
- **Não planejar em cima dele** até passar no build clang-cl e no smoke do
  export.

## Fora do escopo

- JIT no host (proibido no Xbox).
- Reescrever a engine inteira em C++: só os laços quentes saem do JS.
