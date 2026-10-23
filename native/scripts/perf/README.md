# Kit de medição do export nativo (SPEC-0382)

Só `.sh` (Git Bash). O PowerShell aparece embutido, numa linha, onde o Windows
exige: lançar e matar o `launcher.exe` (App Control). Exe nunca em Temp nem em `E:/`.
Lock compartilhado: `$PERF_LOCK` (padrão `D:/jogos/detetive-brasilia/.cortex/measure.lock`).

```bash
K=native/scripts/perf
# lock: status, ou rodar qualquer comando sob o lock (solta no fim/erro; nunca apaga o de outro)
$K/lock.sh status
$K/lock.sh run minha-frente -- <cmd...>        # em script: source $K/lock.sh; perf_lock_acquire dono; trap perf_lock_release EXIT

# export: engine de uma worktree, jogo de outra, sem --debug, sob o lock; save isolado em <id>-bench-<tag>
$K/export.sh <engineDir> <gameDir> D:/jogos/detetive-brasilia/.cortex/minha-frente/export-a a

# round: uma rodada (query ?cortexDebug=perf&perf=1&systemProfile=1&spawn=<ponto><extra>; perf=1 liga o profiler do DDD 61 desde o ae5caef), imprime a linha do resumo
$K/round.sh --exp .../export-a --out .../runs/setorO-1 --spawn setorO [--extra '&k=0'] [--secs 135] [--owner frente]
$K/round.sh --exp .../export-a --out .../runs/x --query '?cru'      # query inteira à mão

# validate: VÁLIDO/INVÁLIDO + motivo (1 linha = tela de carregamento); exit 1 se alguma for inválida
$K/validate.sh .../runs/*/

# summarize: uma linha por rodada (frameMs med/p95/p99, js do host, render/world cpuAvg+p99, draws, alertas)
$K/summarize.sh .../runs/*/

# ab: ABAB… intercalado (ordem invertida na réplica par), tabela por ponto no fim
$K/ab.sh --a .../export-a --b .../export-b --out .../runs-ab1 --points "setorO centro" [--reps 2]
$K/ab.sh --a .../export-a --extra-a '&nativeRaycast=0' --out .../runs-ab2 --points setorO   # duas queries
```

Regras de validade e campos do resumo: `trace-stats.mjs` (constantes no topo) e
SPEC-0382. Fora do kit por enquanto: piloto de direção e screenshot.
