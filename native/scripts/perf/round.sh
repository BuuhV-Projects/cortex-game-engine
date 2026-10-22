#!/usr/bin/env bash
# One measurement round of a native export (SPEC-0382), under the shared lock.
# Usage: round.sh --exp <exportDir> --out <runDir> (--spawn <point> [--extra '&k=v'] | --query '?raw')
#                 [--secs 135] [--owner <name>]
# Prints the summarize line of the round at the end.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/lock.sh"

readonly DEFAULT_SECS=135
readonly POLL_S=5
# Freeze detector: after FREEZE_GRACE_S, a perf-log idle for FREEZE_IDLE_S = frozen host.
readonly FREEZE_GRACE_S=60
readonly FREEZE_IDLE_S=45
# Lets the killed host close its files before they are moved.
readonly CLOSE_WAIT_S=3

exp=""; out=""; spawn=""; extra=""; query=""; secs=$DEFAULT_SECS; owner="round"
while [ $# -gt 0 ]; do
  case "$1" in
    --exp) exp="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --spawn) spawn="$2"; shift 2 ;;
    --extra) extra="$2"; shift 2 ;;
    --query) query="$2"; shift 2 ;;
    --secs) secs="$2"; shift 2 ;;
    --owner) owner="$2"; shift 2 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$exp" ] || [ -z "$out" ] || { [ -z "$spawn" ] && [ -z "$query" ]; }; then
  echo "uso: round.sh --exp <exportDir> --out <runDir> (--spawn <ponto> [--extra '&k=v'] | --query '?cru') [--secs N] [--owner nome]" >&2
  exit 2
fi
# Sections (cpuAvg.world/render) only exist with cortexDebug=perf; no --debug export involved.
[ -n "$query" ] || query="?cortexDebug=perf&systemProfile=1&spawn=$spawn$extra"

exe="$exp/launcher.exe"
[ -f "$exe" ] || { echo "sem launcher.exe em $exp" >&2; exit 2; }
id="$(node -p "require('$(cygpath -m "$exp")/cortex.json').id")"
# The bench id keeps the user's save (%APPDATA%/<id>) from ever being opened.
case "$id" in *-bench-*) ;; *) echo "recusado: cortex.json com id '$id' (use export.sh, que isola o save)" >&2; exit 2 ;; esac
[ ! -f "$out/perf-trace.jsonl" ] || { echo "recusado: $out já tem rodada" >&2; exit 2; }

exe_w="$(cygpath -w "$exe")"
pwsh() { powershell.exe -NoProfile -Command "$1" | tr -d '\r'; }
running() { pwsh "@(Get-Process launcher -EA 0 | ? Path -eq '$exe_w').Count"; }
kill_exe() { pwsh "Get-Process launcher -EA 0 | ? Path -eq '$exe_w' | Stop-Process -Force" >/dev/null; }

perf_lock_acquire "$owner $(basename "$out")"
launched=0
cleanup() { [ "$launched" = 1 ] && kill_exe; perf_lock_release; }
trap cleanup EXIT
trap 'exit 130' INT TERM

[ "$(running)" = 0 ] || { echo "recusado: $exe já está rodando" >&2; exit 2; }
mkdir -p "$out"
rm -f "$exp/perf-log.txt" "$exp/perf-trace.jsonl" "$exp/error_log.txt"
rm -rf "$(cygpath -u "$APPDATA")/$id/saves"

export CORTEX_WINDOWED=1 CORTEX_WINDOW_OFFSCREEN=1 CORTEX_FRAME_TIMING=1 CORTEX_VRAM_LOG=1
export CORTEX_LAUNCH_QUERY="$query"
echo "query=$query exp=$exp secs=$secs start=$(date -Iseconds)" > "$out/meta.txt"
# App Control: the launcher only starts through PowerShell (and never from Temp).
pwsh "Start-Process -FilePath '$exe_w' -WorkingDirectory '$(cygpath -w "$exp")' -RedirectStandardOutput '$(cygpath -w "$out")\\run.log' -RedirectStandardError '$(cygpath -w "$out")\\run.err'" >/dev/null
launched=1
echo "[round] $(basename "$out"): $query por ${secs}s"

start=$SECONDS; why="tempo"
while [ $((SECONDS - start)) -lt "$secs" ]; do
  sleep "$POLL_S"
  elapsed=$((SECONDS - start))
  if [ "$(running)" = 0 ]; then why="processo saiu sozinho (t=${elapsed}s)"; break; fi
  if [ "$elapsed" -gt "$FREEZE_GRACE_S" ] && [ -f "$exp/perf-log.txt" ] \
     && [ $(( $(date +%s) - $(stat -c %Y "$exp/perf-log.txt") )) -ge "$FREEZE_IDLE_S" ]; then
    why="FROZE: perf-log parado (t=${elapsed}s)"; break
  fi
done
kill_exe; launched=0
sleep "$CLOSE_WAIT_S"
for f in perf-trace.jsonl perf-log.txt error_log.txt; do
  if [ -f "$exp/$f" ]; then mv "$exp/$f" "$out/"; fi
done
echo "end=$(date -Iseconds) fim=$why" >> "$out/meta.txt"
perf_lock_release
node "$here/trace-stats.mjs" summary "$out"
