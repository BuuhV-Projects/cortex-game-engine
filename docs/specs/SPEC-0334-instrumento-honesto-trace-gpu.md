# SPEC-0334 - Instrumento honesto: trace barato e tempo de GPU por timestamp

**Data:** 2026-10-09
**Status:** aceito — frente R3-F5 do ciclo 75 fps do DDD 61

## Contexto

A R2b (engine `0e3ea11c`, export release do DDD 61) mostrou que três
instrumentos da campanha mediam a si mesmos ou mediam errado:

1. **`PerfTrace` (SPEC-0198/0227)** — cada amostra percorria a cena inteira
   (~10 mil nós) três vezes: `countNodes`, `countUnchangedMatrices` (16 floats
   comparados e copiados por nó, num `Map`) e `collectVisible` (que ainda subia
   a hierarquia por malha atrás do nó de cena). ~25 ms por amostra, 2×/s:
   ~5% dos quadros acima de 50 ms em TODA medição e o p95 inflado pelo próprio
   trace.
2. **`gpu-latency` (SPEC-0253)** — o callback de `OnSubmittedWorkDone` só
   dispara quando o wgpu faz manutenção (submit ou `ProcessEvents`), sempre na
   thread do JS. O instante lido é "quando o host notou", não "quando a GPU
   terminou": acompanha ~½ do tempo de quadro e não diz nada sobre a GPU.
3. **`pass-timing` (SPEC-0254)** — resolvia e lia os 64 slots do query set em
   todo quadro, mas o quadro só escreve os que usou; os outros guardavam
   timestamps de quadros antigos. O relatório dizia "64 passes/quadro"; a sonda
   da R2b (só os slots usados, marcação por origem) mediu 7,4 passes e
   0,30–0,35 ms de GPU.

## Decisão

### 1. Trace: censo da cena em rodízio (`SceneWalk`)

A amostra (a cada 500 ms) deixa de percorrer a cena. Uma travessia **única**,
iterativa e com pilha própria, anda **`WALK_NODES_PER_FRAME` nós por quadro**
e, ao fechar a volta, publica o resultado completo: `nodesTotal`,
`nodesVisible`, `nodesUnchanged` e a lista `visible`. A amostra grava o último
resultado fechado.

- Uma volta só faz o trabalho das três travessias antigas: o id do nó de cena
  desce pela pilha (sem subir a hierarquia por malha); o teste de frustum só
  roda em malha efetivamente visível (mesma regra do `collectVisible`).
- O custo vira constante e pequeno por quadro, em vez de um pico de 25 ms.
  No DDD 61 (10 mil nós) uma volta leva ~2 s; `walkFrames` na amostra diz
  quantos quadros a última volta levou (idade do dado).
- `nodesUnchanged` passa a comparar com a **volta anterior**, não com a
  amostra anterior.
- A árvore pode mudar no meio da volta: nó removido ainda é contado naquela
  volta, nó novo entra na próxima. É diagnóstico, não contabilidade.
- O frustum é o da câmera **do quadro em que cada nó foi visitado**.
- O trace mede a si mesmo: `traceSampleMs` (custo da amostra anterior, da
  coleta ao `JSON.stringify`/ponte) e `traceWalkMs` (média por quadro da
  travessia na janela). Assim o custo do instrumento fica no dado, e uma
  regressão dele aparece na hora.
- Censo por nó de cena e cobertura de material seguem **uma vez só** (~10 s após
  o boot), fora da janela que as análises usam (t ≥ 30 s).
- `countNodes`/`collectVisible`/`countUnchangedMatrices`/`censusBySceneNode`
  continuam exportadas (API pública, usadas em testes e ferramentas).

A ponte do host (`shims/perf_trace.cpp`) mantém o `perf-trace.jsonl` aberto na
sessão, com `fflush` por linha, em vez de abrir/fechar o arquivo a cada
amostra: medido, o abre/fecha era ~0,3 ms de ~0,6 ms da amostra. O `fflush`
entrega a linha ao SO, então crash do processo não perde dado. As chaves
`trace*` saem com 3 casas (com 1 casa, 0,45 ms virava "0,5").

`FrameProfiler.summary()` (chamado em toda amostra) ordena a janela de cada
seção num buffer reaproveitado com o `sort` nativo de `Float64Array`, em vez de
`Array.from(...).sort(comparador)` por seção.

### 2. `gpu-latency` removido; tempo de GPU sai dos timestamps

Não há como ler a conclusão da GPU sem depender de um ponto de manutenção na
thread do JS: uma thread separada chamando `wgpuDevicePoll(wait)` dispararia
também os callbacks do JS (`mapAsync` do three) fora da thread do Hermes. Medir
"submit → visto" com mais pontos de bombeio continuaria quantizado. Então a
métrica sai (`gpu_latency.*` removido, `trackSubmittedFrame`/`pumpGpuLatency`
fora do laço) e o tempo de GPU por quadro passa a vir do `pass-timing`:

```
gpu-work (N quadros) med=… p95=… max=… passes/q=… | j=… s=… b=… c=… p=…
```

`gpu-work` é a soma da duração dos render passes do quadro, medida no relógio
da GPU — honesto e independente do present. **Não** inclui cópias/`writeBuffer`
nem espera de fila/swapchain (essa aparece na fase `present` do
`frame-timing`). As colunas por origem são ms/quadro: `j` passes do three, `s`
sombra C++, `b` bloom, `c` limpeza do SSAA, `p` blit final.

### 3. `pass-timing` correto

- Teto de 256 passes por quadro (`kMaxPassesPorFrame`).
- O resolve, a cópia e o `mapAsync` cobrem **só** os `usados × 2` slots do
  quadro; a leitura carrega quantos foram usados e a origem de cada um
  (copiados no momento da cópia, porque o quadro seguinte já reescreve).
- `beginRenderPass` de cada origem pede `nextPassTimestampWrites(origem)`.
- A agregação é pura (`pass_timing_stats.h`) e tem teste no
  `cortex_host_tests`: slot além dos usados não entra, par inválido não entra,
  soma por quadro e por origem.

Linha `pass-timing` continua com o ranking por posição; `passes/frame` passa a
ser média com uma casa (`7.4`).

### 4. Alocação por quadro na engine

Medida com `__cortexGcStats`/`HermesInternal.getInstrumentedStats` por seção;
cortes só onde é barato e fora das frentes paralelas (ver Consequências para o
que foi medido e cortado).

## Medido (export release do DDD 61, jogo `9be7c6f`, intercalado A,B,A,B)

| | antes (main `0e3ea11c`) | depois |
|---|---|---|
| custo da amostra (med / p95) | 17–33 ms / 19–46 ms | **0,36 / ~0,5 ms** |
| travessia em rodízio | — | 0,11 ms/quadro, volta de 159 quadros |
| js p95 do host, centro (média das janelas) | 30,5 · 27,1 | 25,2 · 24,1 |
| js p95 do host, setorO | 70,0 · 38,6 | 42,4 · 29,6 |
| pass-timing | "64 passes/frame" (lixo) | 7,0–7,6 passes, gpu-work 0,31–0,33 ms |

- Validação em resposta conhecida: escala 1,0 (¼ dos pixels) derruba os passes
  do three de 0,30 para 0,18 ms; o blit final (mesmo tamanho de saída) fica em
  0,006–0,007 ms. `SceneWalk` tem teste de igualdade contra as três travessias
  completas; a agregação do pass-timing tem teste com slot velho e par
  inválido.
- Alocação (sonda descartável por seção, ~540 KB/quadro): `update` do jogo
  ~260 KB, `render` ~150 KB (three/`src/render`), `ui` ~60 KB (quase tudo o
  `renderer.render` do three na camada de UI), sistemas de personagem/veículo
  ~55 KB, `World.query` ~5 KB. Os cortes baratos da engine (closure por
  entidade no `query`, `Color` por quadro no `renderUiLayer`) não aparecem
  acima do ruído da máquina; GC jovem segue 0,2–0,4 ms/quadro. Chegar a ~0,2 ms
  depende de `update` (jogo) e `render`.

## Consequências

- Medições a partir daqui não carregam o pico de 25 ms do trace; o p95 de
  rodadas antigas não é comparável com o de novas (o trace inflava o antigo).
- O trace custa ~`traceWalkMs` por quadro constante (alvo < 0,15 ms) e a
  amostra < 0,5 ms. `visible` e `nodes*` têm até ~2 s de idade no DDD 61.
- Scripts que liam `gpu-latency` precisam ler `gpu-work`.
- Host precisa ser recompilado (`yarn build:host`) para o `pass-timing`/
  `gpu-work` novos; o trace é só JS (bundle do export).
