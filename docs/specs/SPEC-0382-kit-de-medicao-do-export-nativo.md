# SPEC-0382 - Kit de medição do export nativo (`native/scripts/perf/`)

**Data:** 2026-10-22
**Status:** aceito

## Contexto

No PRD-0009, quatro frentes paralelas (b1-alloc, b2-desenho, b4-raycast,
cauda-cull) mediram o export nativo do DDD 61 e cada uma escreveu a sua cópia
dos mesmos scripts em `D:/jogos/detetive-brasilia/.cortex/<frente>/`:
`round.ps1`, `run.ps1`, `drive.ps1`, `shot.ps1`, `queue*.ps1`, `ab.ps1`,
`export.sh`, `summary.mjs`/`table.mjs`. As cópias divergiram: caminho da frente
cravado, lock que apaga o de outro (b2, b4 e cauda removem o `measure.lock` sem
conferir o dono), aquecimento de 30 s numa e 40 s noutra, e só uma (b4) descarta
rodada inválida. A IA ainda lia trace bruto para decidir se a rodada valia.

Rodadas inválidas que passaram despercebidas nas pastas reais:

- trace de **1 linha** (`{"t":0,"precompile":...}`): o jogo ficou na tela de
  carregamento (ex.: `--debug`, janela oculta). Seis casos nas quatro frentes;
- pasta sem trace: rodada interrompida ou ainda rodando;
- `frame-timing ... 0 apresentados`: o host rodou mas não desenhou nada.

O `native/scripts/ab-bench.ps1` já existe, mas mede só o roteiro `bench`, sem
lock, com saída em `%TEMP%` (o App Control impede exe em Temp, ver memória
`gotcha-medir-perf-export-nativo`) e sem `perf-log` para validar.

## Decisão

Um kit único em `native/scripts/perf/`, **só em `.sh`** (Git Bash). Onde o
Windows exige PowerShell (lançar o `launcher.exe` por causa do App Control e
conferir, antes de lançar, se o exe já está rodando), o `.sh` chama
`powershell.exe -NoProfile -NonInteractive -Command "..."` embutido, numa linha,
com `stdin` de `/dev/null` e `timeout` de 30 s por chamada. Nenhum `.ps1`.

**Durante a rodada o PowerShell não roda** (correção de 2026-10-22, depois de
uma rodada da frente b2 que não encerrou e prendeu o lock por mais de 13 min): o
`round.sh` guarda o PID devolvido por `Start-Process -PassThru` (também gravado
em `meta.txt`), consulta com `tasklist` pelo PID e encerra com `taskkill` pelo
PID. Isso tira um `powershell.exe` por consulta (a cada 5 s) do meio da medição,
que era ruído de CPU e ponto de travamento, e nunca mata outro `launcher.exe`
(ex.: o jogo que o usuário exporta pelo Studio).

**Segunda correção (2026-10-22, rodada da b4 presa desde 19:44):** a causa real era a
linha que lança o jogo. `Start-Process` com `-RedirectStandardOutput` cria o processo
**herdando os handles**, inclusive o pipe de `$(...)`/`| tr` por onde o `round.sh` lia o
PID; o jogo segurava o pipe aberto e o `round.sh` esperava até o jogo fechar, ou seja,
para sempre (reproduzido com `ping.exe`: devolveu o PID só depois de 25 s). Agora o
PowerShell que lança não tem pipe nenhum (`stdout`/`stderr` em `/dev/null`) e grava o
PID em `host.pid` na pasta da rodada.

| script | faz |
| --- | --- |
| `lock.sh` | **Fila justa + prazo** (2026-10-22): quem espera deixa um ticket `<epoch-ns>-<winpid>` em `measure.lock.queue/` e só o ticket vivo mais antigo pode pegar o lock (consulta a cada 5 s; ticket de processo morto é descartado). Quem pega declara um prazo (`perf_lock_acquire <dono> [prazo_s]`, padrão 900 s; o `round.sh` usa `--secs` + 120 s), gravado em `lease_until`. Prazo vencido só gera **alerta** na fila e no `status` ("PRAZO VENCIDO há Ns"): nenhum script mata o jogo de outra sessão nem quebra o lock dela. `source`-ável: `perf_lock_acquire <dono>` / `perf_lock_release`. Lock = diretório (`mkdir` atômico) com `owner.txt` (dono, pid, hora). Espera em retry de 60 s mostrando o dono atual. Solta só o lock que é seu (token no `owner.txt`); nunca apaga lock de outro. CLI: `lock.sh status`, `lock.sh run <dono> -- cmd...`. Caminho: `$PERF_LOCK` (padrão `D:/jogos/detetive-brasilia/.cortex/measure.lock`). |
| `export.sh` | `export.sh <engine> <jogo> <saida> <tag>`: roda `export-game.mjs` da worktree da engine **sem `--debug`**, sob o lock (export pesa na CPU e contamina a rodada de outra sessão), e troca o `id` do `cortex.json` por `<id>-bench-<tag>` (save isolado em `%APPDATA%/<id>-bench-<tag>`). Recusa saída em `E:/` (export do usuário) e em Temp (App Control mata o exe). Grava os commits da engine e do jogo em `<saida>/bench-meta.txt`. |
| `round.sh` | uma rodada: lock, confere save isolado, limpa o save de bench, lança offscreen com `CORTEX_FRAME_TIMING`/`CORTEX_VRAM_LOG`, query `?systemProfile=1&spawn=<ponto><extra>` (ou `--query` cru), espera N s com detector de congelamento (perf-log parado ≥ 45 s após 60 s) e de processo morto, mata pelo caminho do exe, move `perf-trace.jsonl`, `perf-log.txt`, `error_log.txt` para a pasta da rodada, solta o lock e imprime a linha do `summarize`. |
| `validate.sh` | veredito por rodada; sai com 1 se alguma for inválida. |
| `summarize.sh` | uma linha por rodada; com `gc.allocatedMB` no trace (SPEC-0357) acrescenta KB/quadro, coletas young/s e ms/s, e as old (t ≥ 40 s) — também na tabela do `ab.sh`. |
| `ab.sh` | A/B intercalado: para cada réplica e ponto roda A,B (réplica ímpar) ou B,A (par); rodadas `<ponto>-A-r<k>`. Dois exports, ou o mesmo export com `--extra-a`/`--extra-b` diferentes. Ao fim imprime a tabela por ponto. |
| `trace-stats.mjs` | a análise compartilhada (validate/summary/ab) — node, coberta por `tests/native/perfKit.test.ts`. |

**Regras de validade** (constantes nomeadas no `trace-stats.mjs`):

- aquecimento: amostras com `t < 30000` ms são descartadas;
- **≥ 20 amostras** com `cpu` depois do aquecimento (trace de 1 linha = tela de
  carregamento, motivo dito explicitamente);
- média de `cpuAvg.world` > 0 (simulação rodando);
- soma de "apresentados" das janelas `frame-timing` do `perf-log.txt`, sem o
  primeiro quarto (carga), > 0;
- `meta.txt` sem `FROZE` (congelamento detectado pelo `round.sh`).
- rodada com `--autopilot` (jogador em movimento, SPEC-0414): o trace tem o evento `autopilot`, a câmera se afastou ≥ 8 m e nunca passou do horizonte (`cam.dy ≤ 0`).

**Resumo:** `frameMs` med/p95/p99 e quantas amostras no teto de 100 ms (alerta:
acima disso `frameMs` não mede nada); `js` do host (frame-timing) med/p95;
`render` e `world` como média de `cpuAvg` e mediana de `cpuP99` (nunca o
`cpu.<seção>`, que é um quadro sorteado — memória `gotcha-perf-trace-lastms`);
`draws` mediano.

## Consequências

- As frentes param de copiar scripts; o roteiro de uma medição vira
  `export.sh` + `round.sh`/`ab.sh` e a IA lê uma linha por rodada.
- O lock passa a ser respeitado por todos que usam o kit; as cópias antigas das
  frentes ainda apagam o lock alheio até serem aposentadas.
- Fora do kit, de propósito: piloto de direção (`drive.ps1`) e captura de
  janela (`shot.ps1`). Entram quando uma frente precisar deles de novo; a
  validação numérica já reprova a tela de carregamento sem screenshot.
- O lock padrão aponta para o DDD 61 (o jogo-alvo das medições do PRD-0009);
  outro jogo usa `PERF_LOCK`.
- `ab-bench.ps1` + `ab-report.mjs` (TDR-0007) seguem para o roteiro `bench` com
  análise estatística por faixa de draws; o `ab.sh` é o A/B por ponto de spawn.


**Terceira correção (2026-10-22, relatada pela frente b4):** no DDD 61 a partir do `ae5caef`
o profiler do jogo só liga com `perf=1` na query (`main.ts` do jogo); sem ele o trace sai
sem seções `cpuAvg` e o `validate.sh` reprova a rodada. A query padrão do `round.sh` passou
a ser `?cortexDebug=perf&perf=1&systemProfile=1&spawn=<ponto><extra>` (parâmetro
desconhecido é ignorado por quem não o usa).
