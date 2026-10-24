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
$K/round.sh ... --window 1920x1080   # Full HD (SPEC-0455); o meta.txt registra janela e renderScale
# jogador em movimento (SPEC-0414): controle virtual do Xbox toca um perfil (walk = a pé; drive = carro, com &drive=1 no DDD 61)
$K/round.sh --exp .../export-a --out .../runs/setorO-ap --spawn setorO --autopilot walk

# validate: VÁLIDO/INVÁLIDO + motivo (1 linha = tela de carregamento); exit 1 se alguma for inválida
$K/validate.sh .../runs/*/

# summarize: uma linha por rodada (frameMs med/p95/p99, js do host, render/world cpuAvg+p99, draws, alertas)
$K/summarize.sh .../runs/*/

# ab: ABAB… intercalado (ordem invertida na réplica par), tabela por ponto no fim
$K/ab.sh --a .../export-a --b .../export-b --out .../runs-ab1 --points "setorO centro" [--reps 2]
$K/ab.sh --a .../export-a --extra-a '&nativeRaycast=0' --out .../runs-ab2 --points setorO   # duas queries
$K/ab.sh --a .../export-a --b .../export-b --out .../runs-ab3 --points "setorO comercial" --autopilot walk   # A/B em movimento
```

Regras de validade e campos do resumo: `trace-stats.mjs` (constantes no topo) e
SPEC-0382. Rodada com `--autopilot` é inválida se o engine não ligou o autopiloto, se o jogador não
andou ou se a câmera passou do horizonte (olhar o céu barateia o quadro); o resumo mostra `>33ms` (fração das amostras acima de 33 ms) e quanto o autopiloto andou.
Fora do kit por enquanto: screenshot.

## Parar uma fila de rodadas (armadilha)

Parar o comando em segundo plano que disparou a fila (ex.: `TaskStop`) mata só o shell de
fora: o `.sh` da fila (ou o `ab.sh`) e o `round.sh` continuam vivos, esperando o lock, e
mais tarde rodam rodadas velhas tomando a vez dos outros. Para parar de verdade:

1. `ps -ef | grep -E 'ab.sh|round.sh|<sua-fila>.sh'` e ache os SEUS processos;
2. encerre primeiro o `.sh` pai (fila/`ab.sh`), depois o `round.sh` (`kill <pid>`);
3. confira com `lock.sh status`: o ticket de processo morto some sozinho da fila.

Nunca encerre processo de outra sessão.
