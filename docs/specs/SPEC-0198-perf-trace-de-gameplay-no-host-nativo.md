# 0198 - Perf trace de gameplay no host nativo

**Data:** 2026-09-19
**Status:** aceito

## Contexto

Diagnosticar queda de fps num jogo grande hoje depende de o usuário olhar o HUD
e tirar print no momento certo. No `kart-racer` isso custou uma rodada inteira
de otimização no alvo errado: dois prints de trechos diferentes da pista (0:24 a
45 fps, 0:11 a 21 fps) pareciam uma regressão e não eram — medição posterior no
mesmo ponto mostrou empate.

O que faltou foi um registro contínuo: **enquanto se dirige, gravar num arquivo
o que estava acontecendo**. O canal já existe no host nativo —
`core::appendPerfLog` ([crash_handler.cpp](../../native/src/core/crash_handler.cpp))
grava em `perf-log.txt` e liga exatamente pela regra desejada ("se as métricas
estão ativas, escreve"): `game.debug` (export com métricas), dev-run ou
`CORTEX_VRAM_LOG` ([main.cpp](../../native/src/main.cpp)). Mas o conteúdo hoje é
só memória (VRAM, heap JS, texturas vivas), nada de gameplay.

O alvo é o **host nativo** — é o que vira produto (Steam/Xbox). O preview do
Studio fica de fora de propósito: é ferramenta de autoria, não o jogo.

## Decisão

Um **perf trace** amostrado: com as métricas ativas, a engine escreve uma linha
JSONL por amostra num arquivo `perf-trace.jsonl` ao lado do `perf-log.txt`.

### Conteúdo da linha

Cada amostra (default a cada `SAMPLE_MS`) carrega:

- `t` — ms desde o boot;
- `fps`, `frameMs` — do frame corrente;
- `cpu` — ms por seção do `FrameProfiler` (`world`, `ui`, `render`, …);
- `draws`, `tris` — do `renderer.info.render`;
- `cam` — posição e direção da câmera ativa (é o que localiza o trecho no mapa);
- `visible` — **os nós de cena visíveis no frustum**, cada um com `id` (o
  `node.id`, que o `buildScene` grava em `obj.name`), quantas sub-malhas e
  quantos triângulos contribuiu.

O `visible` é o que responde "o que entrou em tela quando caiu de 50 para 32" —
foi o caso real da rodoviária. Custa um traverse com teste de frustum por
amostra, não por frame.

### Caminho

1. **Engine** (`src/core/PerfTrace.ts`): coleta e serializa. A montagem da linha
   é função pura (testável); a coleta de visíveis percorre a cena uma vez,
   agrupando por ancestral com `userData.cortexSceneNode`.
2. **Ponte**: `globalThis.__cortexPerfTrace(line)` — existe **apenas** quando o
   host registrou o shim, que por sua vez só registra com as métricas ativas.
   A engine testa a existência da função: sem host (ou sem métricas), o trace
   não coleta nada e o custo é zero.
3. **Host** (`native/src/shims/perf_trace.{h,cpp}`): recebe a string e a
   acrescenta em `<logDir>/perf-trace.jsonl`. Arquivo próprio, separado do
   `perf-log.txt`, porque é JSONL para leitura por ferramenta, não texto humano.

### Gate

O mesmo do `perf-log`: `game.debug || isDevRun || CORTEX_VRAM_LOG`. Nada de flag
nova — "métricas ativas ⇒ escreve" é a regra.

## Consequências

- Um export com métricas passa a gerar `perf-trace.jsonl` junto do
  `perf-log.txt`; release comum não gera nada (o shim nem é registrado).
- O arquivo cresce com o tempo de jogo: uma amostra tem tantas entradas quanto
  nós visíveis. Com `SAMPLE_MS` de 500 e uma cena de ~200 nós visíveis, a ordem
  é de dezenas de KB por minuto — aceitável para uma sessão de diagnóstico, não
  para deixar ligado em produção (e não fica: o gate é o modo métricas).
- A coleta de visíveis custa um traverse por amostra. Fora da amostra, o custo
  é zero; a linha registra o `frameMs` do próprio frame amostrado, então o
  overhead aparece nos dados em vez de se esconder.
- O preview do Studio não recebe o trace. Quem quiser diagnosticar lá continua
  com o HUD de métricas.
- **O merge estático borra a granularidade**: no host o `mergeStaticScene` liga
  por default (SPEC-0196), então parte dos visíveis aparece como
  `static-merged-N` em vez do `id` do nó original — o merge fundiu várias peças
  numa malha só. O que está fora do merge (dinâmicos, skinned, vegetação)
  continua com o id próprio. Para um diagnóstico que precise dos ids originais,
  exporte com `mergeStatic: false` no `buildScene` do jogo.

## Validado

Export do `teste4` com `--debug`, entrando direto numa fase
(`CORTEX_LAUNCH_QUERY="level=space-1"`): 72 amostras em 45 s, cada uma com
`fps`/`frameMs`, `cpu` por seção, `draws`/`tris`, câmera e os visíveis ordenados
por triângulo. No menu o arquivo nasce vazio (o loop de jogo ainda não roda) —
o trace começa quando a fase começa.
