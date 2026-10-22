#!/usr/bin/env bash
# Measurement lock shared by every session (SPEC-0382): a directory created with
# atomic mkdir plus owner.txt. Never removes a lock owned by someone else.
#
# Sourced:  source lock.sh; perf_lock_acquire "<owner>"; trap perf_lock_release EXIT
# CLI:      lock.sh status | lock.sh run <owner> -- <cmd...>

PERF_LOCK="${PERF_LOCK:-D:/jogos/detetive-brasilia/.cortex/measure.lock}"
# Fair queue: every waiter drops a ticket "<epoch-ns>-<winpid>" here and only the
# oldest live ticket may take the lock (first come, first served).
PERF_LOCK_QUEUE="${PERF_LOCK}.queue"
readonly PERF_LOCK_POLL_S=5
# Lease: the holder declares how long it expects to keep the lock (lease_until).
# Past it, waiters only WARN (nobody kills another session's game or breaks its lock).
readonly PERF_LOCK_DEFAULT_LEASE_S=900
PERF_LOCK_TOKEN=""
PERF_LOCK_HELD=0

# owner.txt may be UTF-16 (written by older PowerShell scripts): drop NULs.
perf_lock_owner() { { tr -d '\000\r' < "$PERF_LOCK/owner.txt"; } 2>/dev/null | head -1; }

# A ticket whose waiter process is gone (killed while waiting) is dropped.
perf_lock_alive() { tasklist //FI "PID eq $1" //NH //FO CSV 2>/dev/null | grep -q "\"$1\""; }

# Oldest live ticket name; prunes dead ones on the way.
perf_lock_head() {
  local t
  for t in $(ls "$PERF_LOCK_QUEUE" 2>/dev/null | sort); do
    if perf_lock_alive "${t##*-}"; then echo "$t"; return; fi
    rm -f "$PERF_LOCK_QUEUE/$t"
  done
}

# Prints how far past its lease the current holder is (empty = within lease or no lease).
perf_lock_overdue() {
  local until
  until="$(cat "$PERF_LOCK/lease_until" 2>/dev/null)" || return 0
  [[ "$until" =~ ^[0-9]+$ ]] || return 0
  local late=$(( $(date +%s) - until ))
  [ "$late" -le 0 ] || echo "${late}s"
}

perf_lock_acquire() {
  local owner="${1:?uso: perf_lock_acquire <dono> [prazo_s]}"
  local lease_s="${2:-$PERF_LOCK_DEFAULT_LEASE_S}"
  local winpid ticket last=""
  winpid="$(cat /proc/$$/winpid)"
  PERF_LOCK_TOKEN="$owner pid=$$ rnd=$RANDOM"
  mkdir -p "$PERF_LOCK_QUEUE"
  ticket="$(date +%s%N)-$winpid"
  echo "$owner" > "$PERF_LOCK_QUEUE/$ticket"
  while :; do
    if [ "$(perf_lock_head)" = "$ticket" ] && mkdir "$PERF_LOCK" 2>/dev/null; then break; fi
    local late; late="$(perf_lock_overdue)"
    local msg="[lock] na fila ($(ls "$PERF_LOCK_QUEUE" | wc -l) esperando); dono atual: $(perf_lock_owner || echo 'nenhum')${late:+ -- PRAZO VENCIDO há $late}"
    [ "$msg" = "$last" ] || echo "$msg" >&2
    last="$msg"
    sleep "$PERF_LOCK_POLL_S"
  done
  rm -f "$PERF_LOCK_QUEUE/$ticket"
  PERF_LOCK_HELD=1
  echo $(( $(date +%s) + lease_s )) > "$PERF_LOCK/lease_until"
  printf '%s %s\n' "$PERF_LOCK_TOKEN" "$(date -Iseconds)" > "$PERF_LOCK/owner.txt"
  echo "[lock] adquirido: $PERF_LOCK_TOKEN" >&2
}

perf_lock_release() {
  [ "$PERF_LOCK_HELD" = 1 ] || return 0
  local current
  current="$(perf_lock_owner)"
  # Empty owner = we crashed between mkdir and writing owner.txt: still ours.
  if [ -z "$current" ] || [ "${current#"$PERF_LOCK_TOKEN "}" != "$current" ]; then
    # Every file the holder writes must go, or rmdir fails and the lock stays forever.
    rm -f "$PERF_LOCK/owner.txt" "$PERF_LOCK/lease_until"
    rmdir "$PERF_LOCK" 2>/dev/null || echo "[lock] ERRO: $PERF_LOCK não ficou vazio; não foi solto" >&2
    echo "[lock] solto" >&2
  else
    echo "[lock] não é mais nosso (dono: $current); não apaguei" >&2
  fi
  PERF_LOCK_HELD=0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    status)
      if [ -d "$PERF_LOCK" ]; then echo "ocupado: $(perf_lock_owner || echo '?')"; else echo "livre"; fi
      late="$(perf_lock_overdue)"; [ -z "$late" ] || echo "  PRAZO VENCIDO há $late"
      for t in $(ls "$PERF_LOCK_QUEUE" 2>/dev/null | sort); do echo "  fila: $(cat "$PERF_LOCK_QUEUE/$t") ($t)"; done ;;
    run)
      owner="${2:?uso: lock.sh run <dono> -- <cmd...>}"; shift 2
      [ "${1:-}" = "--" ] && shift
      [ $# -gt 0 ] || { echo "uso: lock.sh run <dono> -- <cmd...>" >&2; exit 2; }
      perf_lock_acquire "$owner"
      trap perf_lock_release EXIT
      trap 'exit 130' INT TERM
      "$@" ;;
    *) echo "uso: lock.sh status | lock.sh run <dono> -- <cmd...>  (ou: source lock.sh)" >&2; exit 2 ;;
  esac
fi
