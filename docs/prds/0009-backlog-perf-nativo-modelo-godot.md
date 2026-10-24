# PRD 0009 - Backlog de performance do host nativo (modelo Godot)

**Data:** 2026-10-10
**Status:** **EM ANDAMENTO** (2026-10-24) — RenderingServer **finalizado** (ADR-0404): RS1 ligado (−1,1 ms), `DynamicLighting` (−1,4/−1,7), sombra barata (−1,6/−1,9 andando, −3,0 dirigindo), Babel com receptor certo (ADR-0485); RS2/RS3 e objetos que escapam substituídos pelo renderer nativo (ADR-0465/PRD-0466); pendências em frentes
paralelas; ver "Estado em 2026-10-22". **2026-10-24:** o B2 passa a ter como destino o renderer
próprio em C++ no export (decisão do usuário; ADR-0465, plano no PRD-0466).

> **Correção:** a primeira versão deste PRD (2026-10-10) descrevia o B2 a partir
> do texto original do ADR-0237 e ignorava o que o ciclo "75 fps no export do
> DDD 61" já tinha entregado. O estado real está na tabela abaixo.

## Estado em 2026-10-22

| item | estado | onde |
| --- | --- | --- |
| Espelho da cena em C++ (só nós sujos) | **feito** | ADR-0232, SPEC-0234, SPEC-0322 |
| Projeção/culling/ordenação do passe principal em C++ | **feito** | ADR-0330 (a), SPEC-0332 |
| Passe de sombra nativo | **feito** | ADR-0244, SPEC-0245 (M6) |
| Rapier nativo, corpo parado sem custo | **feito** | ADR-0336, SPEC-0337 |
| Câmera/personagem em C++, SkinnedMesh no export | **feito** | R1 do ciclo, SPEC-0348 |
| M0 do ADR-0237 (cache de bindings) | **medido: não há ganho** (69% refazem) | ADR-0237 |
| B1 — zero alocação por quadro (+ medição do B3) | **mergeado** (`34210c53`, SPEC-0357): na main do jogo, −45 a −65 KB/quadro (−4 a −7%), coleta young −1,6 a −2,6 ms/s, sem regressão; teste impede `new Vector3/Matrix4/Box3` em `System.update`; colunas de GC no kit. O jogo ainda aloca ~0,8–1,1 MB/quadro (critério de pronto do PRD não atingido — o resto está fora do engine) | sessão `b1-zero-alloc` |
| B2 — desenho nativo no passe da cena (ADR-0330 (b)/(c)) | b.1/b.2 na main; b.3 e SPEC-0362 sem ganho (arquivadas) | sessão `b2-desenho-nativo` |
| B2 — **RenderingServer** (ADR-0404) | **RS1 construído e medido** (SPEC-0425, 2026-10-23): paridade exata, render **−1,1 ms** no Comercial andando (p95 −2,8, quadros >33 ms 29% → 22%) — abaixo do critério de −4; **ligado por padrão no export por decisão do usuário (2026-10-23)**, `?renderServer=0` desliga. O teto do ADR-0404 (−8 a −11 ms) estava inflado: não descontava o trabalho por estado de shader (~1 ms, luzes/sombra) nem o upload dos que se movem (~0,4 ms). **Finalizado em 2026-10-24**: + `DynamicLighting` (−1,4/−1,7 ms), sombra barata (SPEC-0445, −1,6/−1,9 andando, −3,0 dirigindo), Babel com receptor certo (ADR-0485); regravação na b.1 rejeitada e removida; RS2/RS3/escape substituídos pelo renderer nativo (ADR-0465/PRD-0466) | sessão `rendering-server` (encerrada) |
| B4 — raycast de colisão em C++ (ADR-0346/SPEC-0347) | **mergeado** (`bc5ecf6f`, 2026-10-23): A/B a pé na main do jogo, 16 rodadas válidas, `world` −0,15 a −0,54 ms (Comercial −1,2 ms no par limpo), personagem e câmera mais baratos nos 4 pontos; pendente o A/B dirigindo (lacuna do Rapier em `BreakableProps.activate`) | sessão `b4-raycast-cpp` |
| Cauda da física (R4-A) + `cullOutlines` pulando nós escondidos | **`cullOutlines`/espelho mergeado** (`6e74af99`, SPEC-0372): `cull` p99 ~3,8 → ~1,0 ms e espelho −0,36 ms/quadro nos 6 pontos, quadro mediano −0,2 a −1,1 ms, p95 até −2,2 ms. **R4-A descartada com número**: o passo extra de física custa 0,2–0,4 ms; a cauda vem do render perdendo o vsync e coincide com o GC jovem | sessão `cauda-cull-outlines` |
| B3 — skinning em C++ | **dispensado por medição** (SPEC-0357 §5): ~0,1–0,5 ms com 1–4 personagens com mixer; a multidão é o lote instanciado | — |
| B5 — threads no C++ | depende do B2 | — |
| B6 — Static Hermes | acompanhar (imaturo em 2026-10-03) | — |

**Jogo-alvo das medições (decidido pelo usuário em 2026-10-22):** a `main` atual
do DDD 61, fixada no commit `e2be01c`, cada frente numa worktree destacada do
jogo. Não é a `dff1386` (fim do ciclo de 75 fps): aquele jogo não existe mais, e
a `main` é mais pesada e sem as otimizações do ciclo — números absolutos piores
que o histórico são esperados; vale o A/B na mesma build.

**A main do jogo só passou a rodar no export em 2026-10-22**, com SPEC-0392 (`Audio`
no host) e SPEC-0393 (`contactPairsWith`/`contactPair` no Rapier do host — sem ela o
1º tick morria com TypeError, registrado só no `error_log.txt`). Até lá as frentes
mediram no `dff1386`/`aacfb7e`; esses números ficam como referência secundária.

**Linha de base da main do jogo (`e2be01c`)** — kit SPEC-0382 com `perf=1`, 135 s por
ponto, engine `7fb9421e`, 4 rodadas válidas, 100% dos quadros apresentados:

| ponto | frameMs med / p95 | render cpuAvg (p99) | world cpuAvg (p99) | draws |
| --- | --- | --- | --- | --- |
| Setor O | 26,8 / 35,9 | 15,3 (25,4) | 3,9 (13,0) | 172 |
| Centro | 26,2 / 38,5 | 14,6 (25,1) | 3,7 (12,4) | 162 |
| Comercial | 29,3 / 41,1 | 15,0 (23,9) | 4,2 (13,6) | 152 |
| Águas Claras | 29,9 / 44,0 | 16,0 (25,0) | 3,5 (14,3) | 175 |

Ou seja, ~34–38 fps, e o **render é ~55% do quadro**: é onde o B2 tem mais a ganhar.

Medições no export do DDD 61 são serializadas pelo lock
`D:/jogos/detetive-brasilia/.cortex/measure.lock` (diretório criado com `mkdir`
atômico, `owner.txt` dentro, removido ao fim de cada rodada).

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

## Processo de cada melhoria (regra do usuário, 2026-10-23)

Antes de implementar qualquer otimização deste PRD:

1. **Como o Godot faz:** achar no repo do Godot 4 (github.com/godotengine/godot) a solução
   equivalente, com arquivo:linha (ex.: `servers/rendering/renderer_rd/forward_clustered/`).
2. **Como fazemos aqui:** o caminho atual no engine/host, com arquivo:linha.
3. **Validar a aplicabilidade:** a técnica do Godot cabe em WebGPU/wgpu, no sistema de nós do
   three e no Hermes sem JIT? Se não couber, dizer por quê e o que se aproveita.
4. Só então SPEC/ADR (com essas três seções) → código → A/B com autopiloto.

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
- **Andamento (2026-10-22, SPEC-0357):** medido (instrumento `gc.allocatedMB`)
  e feito o lado dos sistemas do engine: −45 a −65 KB/quadro no DDD 61
  (`e2be01c`: ~0,9–1,1 MB/quadro, −4 a −7%; `dff1386`: −10 a −13%). Critério de pronto **não** atingido — o resto é o
  `onUpdate` do jogo, os internos do three no render (B2) e o raycast (B4).

### B2 — "RenderingServer": concluir o ADR-0237 (M0–M8)

O plano do render nativo completo **é** a arquitetura de servers. A mudança de
fundo é inverter a posse dos dados: a cena desenhável vive no C++ e o JS só envia
deltas (criado, removido, transform mudou, material mudou). Isso também resolve
a questão "gráfico construído pelo nativo, não pelo three.js".

- [x] M0 — medido: não há ganho de cache (69% refazem).
- [x] M1–M4 — MaterialDesc, cache de pipeline, uniformes por objeto, RenderList.
- [x] M6 — passe de sombra nativo (63 → 75 fps no kart-racer).
- [x] ADR-0330 (a) — projeção do passe principal em C++.
- [x] ADR-0330 (b) — b.1 (desenho direto em JS) e b.2 (lote em C++) na main;
      b.3 (ADR-0363) e SPEC-0362 medidas sem ganho e arquivadas.
- [x] **Teto medido e decisão (ADR-0404, 2026-10-23):** braço que tira todas as
      malhas do laço do `three` no passe principal (culling em C++ mantido, sombra
      mantida, instrumento validado com A/A e contadores): render −8,4 (Setor O),
      −9,6 (Centro), −9,7 (Comercial), −11,4 ms (Águas Claras). Decisão:
      **construir pelo caminho da receita** (o `three` compila, o C++ é dono das
      instâncias e do laço; instância limpa = zero JS por quadro).
- [x] **RS1** (SPEC-0425) — **medido, abaixo do critério**: paridade exata
      (`maxChannelDiff` 0 no Setor O e no Comercial), render −1,12 ms andando no
      Comercial (critério: −4). **Ligado por padrão por decisão do usuário (2026-10-23)**, a
      revisar quando o custo por estado cair. RS1a (névoa por render) sem ganho próprio demonstrável.
- [x] ~~RS2 — `InstancedMesh` e materiais com nó conferíveis~~ — **absorvido pelo PRD-0466**
      (R1.4 instancing; R1.5/R3 materiais com nó viram modelo fixo ou WGSL do jogo).
- [x] ~~RS3 — transparentes ordenados em C++~~ — **absorvido pelo PRD-0466** (R1.4).
- [ ] **Renderer próprio em C++ no export** (ADR-0465, decisão do usuário 2026-10-24): o `three` sai do
      caminho de render do export; Studio no `three`. Marcos R0–R5 no PRD-0466 — o R1 tira o `three`
      do quadro 3D do DDD 61.
- [x] ~~RS4 — sombra direcional simples (`SunShadow` do DDD 61) no passe de sombra
      nativo~~ — **cancelado por medição** (2026-10-23, frente B2, com autopiloto): o redesenho do mapa,
      que é o que o passe nativo substituiria, não custa nada (`?sombraFixa=1`: −0,34 ms andando). O
      custo da sombra é contínuo e mora no laço por objeto em JS — o mesmo que o RS1 tira do JS.
- **Decidido** (premissa do ADR-0237/ADR-0330): o Studio continua no three.js;
  só o export usa o caminho nativo, e a paridade é verificada por imagem.
- **Pronto quando:** critérios dos marcos do ADR-0404.

### B3 — Skinning e animação de ossos em C++

No Godot, `Skeleton3D`/`AnimationPlayer` são C++. O ADR-0237 deixou skinning de
fora; com NPCs e trânsito (DDD 61) o custo cresce com o número de personagens.

- [ ] Medir custo de animação por personagem no Hermes (N atual e N projetado —
      validar Big O).
- [ ] Função nativa: "avança animação N por dt e escreve as matrizes de osso num
      buffer" (amostragem/interpolação de clipes + hierarquia em C++).
- [ ] Integrar ao B2 (matrizes de osso direto no buffer de uniformes/storage).
- **Pronto quando:** custo de animação fica ~constante no JS independente de N.
- **Veredito (2026-10-22, SPEC-0357): não necessário agora.** Medido no Hermes:
  ~80–130 µs por personagem skinado (mixer + matrizes + esqueleto); o DDD 61
  tem N = 1 (multidão no lote instanciado) → ~0,1–0,5 ms. Reabrir com ~10+
  personagens skinados animando ao mesmo tempo.

### B4 — Primitivas de gameplay nativas (estilo `move_and_slide`)

No Godot o script chama `move_and_slide`/raycast e o laço roda em C++.

- [ ] Passo do `CharacterPhysicsSystem` (raycasts contra a BVH) como **uma**
      chamada nativa por personagem, ou em lote — ADR-0346/SPEC-0347 (R4-B).
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

## Backlog de pendências

Regra do usuário (2026-10-23): o que não for resolvido na frente em que surgiu vem para cá,
com a origem e o que destrava. Ao resolver, marque `[x]` com o commit.

### Engine / host

- [ ] **O host compilado no checkout principal está velho** (`native/build/cortex_host.exe` e
      `rapier_native.dll` de 2026-10-09, sem `worldContactPairsWith` da SPEC-0393): export do DDD 61
      `e2be01c` com ele morre no 1º tick (`TypeError` em `hasContact`, rodada INVÁLIDA com 0 amostras).
      Destrava: `yarn build:host` no checkout principal (máquina do usuário) — as frentes usam o host da
      própria worktree (`native/scripts/setup-worktree.sh`, SPEC-0525). Origem: SPEC-0505 (R0 do PRD-0466).
- [ ] **`render-parity.mjs` imprime BGRA como `rgba(...)`**: a captura é a swapchain BGRA; o fundo
      `0x9fb8cc` aparece como (204,184,159). Só a leitura humana confunde; os números não mudam.
      Origem: SPEC-0505.
- [ ] **Um `MeshBasicMaterial` sem nome com `CustomBlending` fora da cena do jogo** (1 estado de shader
      no WGSL de referência): provável UI de runtime. Identificar antes do R2 do PRD-0466. Origem: SPEC-0505.

- [x] (2026-10-24, SPEC-0362 "Remedido": 0 travamentos em 3 rodadas congeladas no Setor O + 2 em movimento; a causa estava no código arquivado da b.3/SPEC-0362 v1; o caminho de recusa fica) **Alternar a projeção nativa × `three` a cada quadro trava o host** — causa não isolada.
      Origem: frente B2 (SPEC-0362, etapa (a) do ADR-0330). Não afeta o uso normal (a projeção
      não alterna em jogo), mas impede comparar os dois caminhos na mesma execução.
- [ ] **`getGamepads()` do host monta um snapshot novo a cada chamada** (`native/src/shims/input.cpp`,
      ~3,6 KB/quadro com um controle Xbox), e o controle é lido 2×/quadro (`Game` e
      `UiLayer.pollDevices`). Destrava: reaproveitar os objetos do snapshot e ler uma vez por quadro —
      é o caso normal no Xbox, onde sempre há controle. Origem: SPEC-0357 (B1).
- [ ] **Internos do `three` no render alocam** (~150 KB/quadro: `render()` 52, `RenderObjects.get`
      28, `renderObject` 17–26). Parte disso sai com o desenho nativo do B2 (b.3); remedir com
      `gc.allocatedMB` depois dele. Origem: SPEC-0357 (B1).
- [ ] **Soak longo de memória:** o `external` subiu nos vales nos dois lados do A/B da B1 (+19 a
      +30 MB em 10 min); o heap JS não vaza. Destrava: soak de 30–60 min na main do jogo para decidir
      se é vazamento. Origem: SPEC-0357 / ciclo 75 fps.
- [ ] **Prazo vencido no lock só alerta** (não encerra o jogo nem quebra o lock). Quebrar
      automaticamente foi bloqueado pelo classificador de segurança do app; precisa de permissão
      explícita do usuário. Origem: SPEC-0382.
- [ ] **Fila órfã ao parar um comando em segundo plano** (o shell externo morre, o `ab.sh`/fila e o
      `round.sh` seguem vivos). Hoje só documentado no README do kit; destrava: o `ab.sh` e o lock
      desistirem quando o processo raiz morrer. Origem: relato da B2.
- [ ] **Tela cheia fora de um monitor 1080p não fica em 1920×1080**: a SPEC-0515 fixa 1080p como
      resolução do jogo, mas a tela cheia usa a resolução do monitor (num 1440p/4K o jogo roda maior,
      e o supersampling 2× multiplica). Destrava: modo exclusivo 1920×1080 ou alvo fixo com escala,
      quando o jogo precisar rodar em monitor que não seja 1080p; seletor de resolução é evolução
      futura (decisão do usuário). Origem: SPEC-0515.

- [ ] **Medir em movimento muda o quadro**: com o autopiloto `walk` (SPEC-0414) o DDD 61 (`e2be01c`)
      piora em relação à rodada parada — Setor O p95 33→55 ms, p99 43→74, quadros >33 ms 5%→34%;
      Comercial p95 34→42, p99 39→68, >33 ms 7%→31% (2 réplicas, `.cortex/autopilot/runs-ab`). As
      frentes passam a fechar A/B também com `--autopilot walk`; o alvo de 60 fps tem que valer andando.
      Origem: SPEC-0414.
- [ ] **Perfil `drive` sem desvio**: no Setor O (`&drive=1`) o carro nasce de frente para a calçada e
      passa boa parte do ciclo encostado numa casa (andou só 15 m em 110 s). Destrava: um ponto de
      spawn de direção com rua livre (no jogo) ou um perfil próprio por ponto. Origem: SPEC-0414.
- [x] (arquivada; o caminho do servidor de receitas foi o RS1 e o destino agora é o renderer próprio — ADR-0465) **b.3 (fila nativa de opacos parados, ADR-0363) sem ganho medido**: paridade 0, mas A/B no ruído
      (setorO −1,24, centro −0,29, comercial +1,01 ms) e uma réplica em Águas Claras regrediu para 33,9 ms
      de render com 2,4 MB/quadro de GC. Código arquivado (retomar a partir de `dbf15071`); registros e
      instrumento na main (`f8ddbf38`). Destrava: entender a regressão de Águas Claras antes de qualquer novo corte.
- [x] (o RS1 aceita os que se movem — `fbMoved` só no 1º quadro do movimento; SPEC-0425) **~20 objetos por quadro que se movem (NPCs, carros, jogador) ficam fora da fila nativa** —
      maior ganho restante da b.3, se a b.3 for retomada. Origem: contadores de recusa da b.3.
- [x] **SPEC-0362 rejeitada por medição** (tirar do `three` os objetos com névoa/material com nó):
      refazê-los custa quase o mesmo que o caminho do `three` e sobe o GC ~10 ms/s. Registro para não
      repetir a tentativa.
- [x] (2026-10-23, 2 réplicas: Setor O −7,0, Centro −6,6, Comercial −4,5, AC −8,1 ms) **Teto do
      primeiro marco (modo 3)** — e o teto todo ficou inflado (ver a correção do ADR-0404). O braço não está
      na engine: aplicar
      `D:/jogos/detetive-brasilia/.cortex/rs-ceiling/rs-ceiling-arm.patch` numa worktree descartável
      (`?rsCeiling=1|2|3`). Origem: ADR-0404.
- [x] (substituído pelo renderer nativo — decisão do usuário em 2026-10-24, ADR-0465/PRD-0466: o servidor de receitas depende do `three` para gravar; quem escapa dele não tem conserto barato aqui) **O custo por objeto que escapa do servidor é ~100 µs** (transparentes, skinado, material com
      nó; ~21/quadro no DDD 61 = ~2–3 ms): é o alvo do RS2/RS3 e o motivo de o escape ser por objeto,
      nunca por quadro. Origem: ADR-0404.
- [x] (SPEC-0425) **Detecção de mudança de material**: escolhida a conferência por instantâneo da b.1 —
      medida em ~5,5 µs/objeto (~0,4 ms/quadro para ~77 ofertas). Ganchos só se ela virar gargalo.
- [x] (atacado: luzes por `DynamicLighting` `04c72500` e sombra por filtro compartilhado `ef530c55`; o resto — ~0,8–1,1 ms de nós de render + ~0,3 ms de grupos por estado — vai para o renderer próprio, formato na SPEC-0475) **Custo por estado de shader: ~77 µs × ~13 estados ≈ 1 ms/quadro** (DDD 61, andando): conferência
      do UBO "render" de cada estado (8 `SpotLight` — 6 postes + 2 faróis, no shader mesmo apagadas de
      dia —, hemisfério, sol com sombra; ~70 uniformes). Nem a b.1 nem o RS1 tiram isso, e a sombra do sol
      (−3 ms com o RS1 ligado) mora aí. Destrava: medir (1) `visible = false` nas `SpotLight` de
      intensidade 0 (jogo), (2) menos estados distintos (material compartilhado), (3) um UBO de luzes
      único para todos os estados (sistema de nós do `three`; o maior). Origem: SPEC-0425 / ADR-0404.
- [x] (`4b190149`, ADR-0485: plugin que reescreve leituras de `super.x` para `Reflect.get(..., this)` antes do transform-classes loose; escrita via `super` falha o build; teste com resposta conhecida; contorno do `DynamicLightsNode` removido; paridade 0 no Setor O) **PRIORIDADE ALTA — O Babel do export quebra getters chamados via `super`** (bug silencioso no export
      de QUALQUER jogo) (`super.x` em getter vira
      `Base.prototype.x`, que roda com o protótipo como `this`): derrubou o `DynamicLightsNode` do `three`
      (objetos sumiam, medido como −6 ms falsos). Contornado só nesse caso (SPEC-0435, `76f36c48`).
      Destrava: varrer o bundle por `_X.prototype.<getter>` vindo de `super` e corrigir a configuração do
      Babel (modo *loose*?) para todos. Origem: SPEC-0435.
- [x] (`04c72500`) **Luzes estilo Godot: `DynamicLighting` do `three` ligado por padrão no host** —
      render −1,4 (Comercial) / −1,7 ms (Centro) andando, paridade noturna 6 px de 921.600. Teto de
      tirar as 8 `SpotLight` era −2,7 a −3,2: sobra ~1,5 ms no UBO de render por estado (o Godot usa
      um buffer único; aqui exigiria mexer no sistema de nós do `three`). Origem: SPEC-0435.
- [x] (`ef530c55`, SPEC-0445) **Sombra do sol barata: de ~3,2 para ~0,4 ms de render andando.** Causa: o
      filtro PCF/PCF soft do `three` cria os uniformes `mapSize`/`radius` dentro do corpo do `Fn`, um por
      material receptor, e cada estado receptor perdia o grupo "render" compartilhado (21 → 5 grupos por
      quadro com o filtro compartilhado). Ganho: −1,6/−1,9 ms andando, −3,0 ms dirigindo. A sombra fica.
- [x] (2026-10-24, rejeitada e removida — SPEC-0435 "Remedida": Centro −1,70, Comercial +1,01, helio
      drive +0,74 ms; sinal troca entre pontos) **(a) regravar receita no lote da b.1: desligada por padrão até ganho medido; remedir sobre a
      `DynamicLighting`** (A/B: Comercial −0,74, Centro +0,20 com quadros > 33 ms 8,9% → 13%;
      `?batchRecapture=1` liga). Origem: SPEC-0435.
- [ ] **(c) menos estados de shader** e **(d) bloco único de luzes**: não iniciadas. Origem: SPEC-0435.
      **2026-10-24: absorvidas pelo PRD-0466** (buffer de luzes por vista no renderer próprio); não
      iniciar no `three`. O (a) acima foi rejeitado e removido (2026-10-24).
- [ ] **O shim WebGPU descarta `constants` vindos do JS** (`native/src/webgpu/pipeline.cpp` não lê
      `constants` dos estágios; só a sonda de override preenche `constantCount`): um pipeline do JS com
      `override` sai com o valor padrão, sem aviso. Não afeta o renderer próprio (pipelines criados em
      C++). Destrava: ler e testar as constantes no shim, ou recusar com erro. Origem: PRD-0466 (inventário).
- [ ] **Mapa do host desatualizado**: `docs/cortex-native/architecture.md` ("Estado e próximos marcos",
      M0) diz que `mapAsync`/`copyTextureToTexture` não existem; os dois estão registrados hoje.
      Origem: PRD-0466 (inventário).
- [x] (2026-10-24: medido como a alavanca (a) da SPEC-0435 — rejeitado e removido; o RS1 segue regravando na emissão) **Só ~26% dos desenhos diretos da b.1 saem pelo lote da b.2 hoje**: o `three` recria o bind group
      de um grupo compartilhado (geração de textura/sampler) e a receita fica velha; o `lote.add` recusa e
      cai no `backend.draw` do `three` em silêncio. O RS1 resolveu regravando a receita (`recapture`);
      levar a mesma regravação ao `DrawBatch.add` da b.1 é barato e vale medir sozinho (main, com
      autopiloto). Origem: SPEC-0425.
- [x] (2026-10-23) **RS1b — decisão do usuário: ligado por padrão no export**, abaixo do critério.
      Origem: SPEC-0425.
- [x] (main `f8ddbf38`) **Instrumento `?parityFreeze` (`src/render/MainPassArm.ts`)**:
      congela o jogo e alterna nativo × `three` quadro a quadro; pegou um erro de cor que a captura entre
      execuções não pegaria. Destrava paridade por imagem no DDD 61 para qualquer desenho nativo futuro.

- [x] (`fb36f9b4`: o `beforeAll` copiava src/ + native/ com o limite padrão de 10 s do Vitest para hooks; na suíte paralela estourava. Limite próprio de 120 s; suíte inteira verde 2× no checkout principal) **`tests/native/export-isolated-smoke.test.ts` intermitente sob carga** no checkout principal (só roda
      onde há toolchain nativo; nas worktrees é pulado): falhou 1× na suíte inteira logo após o merge do RS1
      (`487d4419`) e passou em seguida isolado (37 s) e na suíte inteira (2179). Suspeita: outra sessão
      exportando ao mesmo tempo. Destrava: commits sem falso vermelho no hook. Origem: merge do RS1.

### Outros jogos — divergências do export achadas no levantamento do PRD-0466

- [ ] **crash-racer: tone mapping AgX vira ACES no export** (`scenes/loadLevel.ts:30-34` pede
      `AgXToneMapping`; o composite do host aplica ACES): o export já diverge do Studio. Destrava: AgX
      no composite (R3c do PRD-0466) ou antes, se o usuário quiser. Origem: PRD-0466 (levantamento).
- [ ] **crash-racer: 147 GLBs usados têm `COLOR_0`** e saem brancos no export (gotcha do naga com
      vertex color + `map`). Destrava: R3c do PRD-0466 (standard próprio com vertex color) ou dropar
      `COLOR_0` no cook. Origem: PRD-0466 (levantamento).
- [x] (decidido 2026-10-24: **recusar por enquanto** — o objeto fica no three até um jogo precisar) **Decisão de produto: clearcoat (kart-racer, 5 carros; crash, 9) e transmission (crash,
      `lira-kart.glb`)** — o renderer próprio recusa em vez de aproximar. Opções: recusar (o jogo fica no
      `three` até decidir), aceitar sem o efeito (decisão explícita, com imagem), ou implementar.
      Origem: PRD-0466.
- [ ] **9 GLBs do DDD 61 são ponteiros LFS** e não entraram no levantamento estático; o censo em
      runtime (R0 do PRD-0466) cobre. Origem: PRD-0466 (levantamento).

### Jogo (DDD 61) — fora do engine

- [ ] **O jogo aloca ~0,8–1,1 MB/quadro** na main (`e2be01c`); o corte do engine foi de 45–65 KB.
      O critério de pronto do B1 só fecha atacando o código do jogo — maior fonte isolada: o
      `onUpdate` (~180 KB/quadro no `dff1386`). Spec no `docs/specs/` do jogo; sonda por seção em
      `.cortex/b1-alloc/allocProbe.ts.txt` (guardar antes de apagar a pasta). Origem: SPEC-0357.
- [ ] **R4-C — update do comercial em forma fechada** (crowdBatch/figure/instanceMatrix), trabalho
      não commitado na worktree `D:/jogos/detetive-brasilia-r4-c` (base `dff1386`). Origem: ciclo
      75 fps (pausado em 2026-10-09). Precisa ser reavaliado na main do jogo antes de portar.

- [ ] **Spawn `setorO` apertado**: carro estacionado, árvore e muro em volta do jogador; o autopiloto
      `walk` esbarra e anda só 4–8 m (Comercial: 18 m). Mede, mas mostra menos streaming. Destrava:
      mover o ponto de medição alguns metros para a rua (`parseSpawn` do `main.ts`). Origem: SPEC-0414.
- [ ] **(identificado: mapa de sombra do sol do jogo, `entities/sunShadow.ts`, 2048², pelo `three`,
      sem o passe de sombra nativo M6; sob demanda — a cada 3 s ou ~18 m de deslocamento; A/B com
      `?sombra=0` em andamento)** O DDD 61 renderiza a cena duas vezes por quadro: um `render()` da mesma cena aninhado
      dentro do render principal, com **outra câmera** (logo outras luzes) — achado da B2 ao depurar a
      b.3 (commits `fd975b5d` e o seguinte; a 1ª leitura dizia "mesma câmera" e foi corrigida). Destrava: descobrir qual sistema do jogo dispara esse render e quanto custa; se for
      um render completo, pode ser uma fatia grande dos ~15 ms de render. Origem: frente B2.
      Confirmado pelos contadores do braço do ADR-0404: 1 render da cena por quadro + o de sombra
      (~0,01/quadro parado no Setor O); no RenderingServer ele vira o RS4.

- [x] (`e93dd9ae`, SPEC-0455; prioridade subiu em 2026-10-24) **Resolução das medições × resolução real:
      medida.** `CORTEX_WINDOW_SIZE` no host e `--window` no kit. Em 1920×1080 o alvo vira 3840×2160 e a GPU
      sobe de ~0,6–0,8 para ~0,9–1,3 ms/quadro; o render (CPU) não muda (~12,3 ms). **A GPU não é o gargalo em
      Full HD** nesta máquina, então não há por que reduzir o fator de supersampling por resolução agora.
      Origem: frente B2.

- [x] (medido com autopiloto: −2,5 a −4,0 ms de render, quadros >33 ms 19,0%→4,8% andando no Setor O;
      sonda: `rpEach` 5,49→3,69 ms, +~1,2 ms fora das fases) **Origem do custo CONTÍNUO da sombra do sol** (−1,6 a −2,4 ms de render com `?sombra=0`, parado):
      mapa fixo (`sombraFixa`) e sem receptores (`sombraRecebe=0`) NÃO reduziram — hipótese: a existência
      da luz com sombra (variantes de todo material iluminado + trabalho por quadro do `ShadowNode`).
      Destrava: escolher entre desligar/simplificar a sombra e o RS4 (que só tira o redesenho). Medir com
      sonda de fases on×off. Origem: frente B2 (relatório preliminar).
- [x] (feito; ver acima) **A/B decisivo da sombra do sol com autopiloto** — o redesenho do mapa (~+16 ms por redesenho,
      segundo o comentário do `sunShadow.ts`) só aparece com o jogador andando. Destrava a opção do RS4.
      Origem: frente B2.

- [x] (`ef530c55`, SPEC-0445: era o filtro PCF/PCFSoft com uniformes por material, que tirava cada receptor do grupo "render" compartilhado; sombra de ~3,2 → ~0,4 ms) **+1,8 ms/quadro no laço por objeto (`rpEach`) com a sombra do sol ligada**, no host: suspeita do
      `updateBefore` do `ShadowNode` por estado de shader de todo material iluminado e/ou conferência extra
      no caminho direto (b.1/`RenderIdRefresh`). Destrava manter a sombra barata. **Medido com o RS1
      ligado** (SPEC-0425, walk, Comercial): `?sombra=0` ainda tira −2,96 ms — o RS1 absorve pouco; o custo
      está no trabalho por estado de shader (item acima). Origem: B2.
- [x] (`ef530c55`, SPEC-0445: mesma origem — o `getBindGroup` por estado receptor; some com o filtro compartilhado) **~1,2 ms do render com sombra fora das fases da sonda** — mesma origem a investigar. Origem: B2.
- [x] **Decisão de produto (usuário): sombra do sol no export do DDD 61** — **decidido em 2026-10-24: a sombra
      FICA** (no futuro vira opção de qualidade). O usuário: o PC dele roda Call of Duty Warzone no alto, então
      uma sombra direcional simples custar 3,2 ms é defeito da engine, não limite de hardware. Meta: tornar a
      sombra barata na engine (o custo medido é CPU em JS, não GPU). Antes: esperar o RS1 e decidir com o A/B sombra on×off com o RS1 ligado (se o servidor absorver o custo, a sombra fica) — desligar (ou opção de
      qualidade com padrão desligado no nativo) rende −2,5 a −4 ms de render já; custo visual: perde as
      sombras de fim de tarde no chão perto do jogador. Origem: B2.

### Limpeza

- [ ] `D:/jogos/detetive-brasilia/.cortex/renderer-r0/arquivo-720` (rodadas inválidas do host velho e as de
      720p, fora de qualquer tabela) e os exports em `.cortex/renderer-r0` e `.cortex/stages/kat-*` —
      apagar quando o usuário quiser (guardar `runs-*`, `wgsl/` e os scripts). Origem: SPEC-0505/0525.
- [ ] Cópia do jogo `D:/jogos/detetive-brasilia-rs-e2be01c` (`e2be01c`): passou para o PRD-0466 (fonte do
      export do R0/R1 e do `check-stage.sh`). Apagar quando o PRD-0466 trocar de commit-alvo ou fechar o R1.
      Origem: arquivamento da sessão `rendering-server`.

- [x] (2026-10-23) Sessão B2 arquivada; worktree da engine e cópias do jogo `b2-base`/`b2-e2be01c` removidas; branch apagada.
- [ ] Rodadas e exports da B2 em `D:/jogos/detetive-brasilia/.cortex/b2-desenho` (evidência da b.3/SPEC-0362 e da sombra do sol) — apagar quando o usuário quiser.

- [x] (2026-10-24: 12 GB apagados; os 9 patches e o `parity.sh` salvos em `.cortex/rs-ceiling-patches/`; sessão arquivada, worktree e branch removidas; a cópia do jogo `detetive-brasilia-rs-e2be01c` FICA, passou ao R0 do PRD-0466) Artefatos do teto do ADR-0404: os 3 exports em `D:/jogos/detetive-brasilia/.cortex/rs-ceiling`
      (~1,1 GB; guardar `rs-ceiling-arm.patch` e as pastas `runs-*`/`val`) e a worktree do jogo
      `D:/jogos/detetive-brasilia-rs-e2be01c` — podem servir de base ao A/B do RS1. Na worktree da
      engine (`rendering-server-2b92ff`) há junctions `native/third_party` e
      `native/rapier-native/target` → main: desfazer só o link antes de remover.

- [x] (2026-10-23, removidos com a sessão arquivada) Artefatos da validação do autopiloto (SPEC-0414): `D:/jogos/detetive-brasilia/.cortex/autopilot`
      (2 exports; guardar `runs-ab`, `evidence*` e os scripts `shots.sh`/`val.sh`) e a worktree do jogo
      `D:/jogos/detetive-brasilia-autopilot` (`e2be01c`). Na worktree da engine `autopilot-perf-fdab00`
      o `native/build` é cópia (sem junction).
- [x] (2026-10-23; sonda salva em `.cortex/allocProbe-b1.ts.txt`) Apagar os artefatos de medição (salvando antes o `allocProbe.ts.txt`): `D:/jogos/detetive-brasilia/.cortex/b1-alloc` (~700 MB) e a
      worktree do jogo `D:/jogos/detetive-brasilia-cauda-cull`.
- [ ] Remover as worktrees antigas da R4 na engine (`.claude/worktrees/r4-a-cauda`,
      `r4-b-raycast`, `r4-d-congelamento`): a R4-B foi portada (B4) e a R4-A descartada com número.
- [x] (2026-10-23) Arquivar as sessões concluídas (B4, B1, main do DDD 61 no export, cauda-cull-outlines),
      remover as worktrees delas (engine e jogo) e apagar as branches.

## Fora do escopo

- JIT no host (proibido no Xbox).
- Reescrever a engine inteira em C++: só os laços quentes saem do JS. (2026-10-24: o **render do
  export** inteiro passa a contar como laço quente — ADR-0465; lógica de jogo, grafo de cena,
  matemática e loaders continuam em JS.)
