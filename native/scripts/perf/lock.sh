#!/usr/bin/env bash
# Measurement lock shared by every session (SPEC-0382): a directory created with
# atomic mkdir plus owner.txt. Never removes a lock owned by someone else.
#
# Sourced:  source lock.sh; perf_lock_acquire "<owner>"; trap perf_lock_release EXIT
# CLI:      lock.sh status | lock.sh run <owner> -- <cmd...>

PERF_LOCK="${PERF_LOCK:-D:/jogos/detetive-brasilia/.cortex/measure.lock}"
readonly PERF_LOCK_RETRY_S=60
PERF_LOCK_TOKEN=""
PERF_LOCK_HELD=0

# owner.txt may be UTF-16 (written by older PowerShell scripts): drop NULs.
perf_lock_owner() { tr -d '\000\r' < "$PERF_LOCK/owner.txt" 2>/dev/null | head -1; }

perf_lock_acquire() {
  local owner="${1:?uso: perf_lock_acquire <dono>}"
  PERF_LOCK_TOKEN="$owner pid=$$ rnd=$RANDOM"
  until mkdir "$PERF_LOCK" 2>/dev/null; do
    echo "[lock] ocupado por: $(perf_lock_owner || echo '?') -- nova tentativa em ${PERF_LOCK_RETRY_S}s" >&2
    sleep "$PERF_LOCK_RETRY_S"
  done
  PERF_LOCK_HELD=1
  printf '%s %s\n' "$PERF_LOCK_TOKEN" "$(date -Iseconds)" > "$PERF_LOCK/owner.txt"
  echo "[lock] adquirido: $PERF_LOCK_TOKEN" >&2
}

perf_lock_release() {
  [ "$PERF_LOCK_HELD" = 1 ] || return 0
  local current
  current="$(perf_lock_owner)"
  # Empty owner = we crashed between mkdir and writing owner.txt: still ours.
  if [ -z "$current" ] || [ "${current#"$PERF_LOCK_TOKEN "}" != "$current" ]; then
    rm -f "$PERF_LOCK/owner.txt"
    rmdir "$PERF_LOCK" 2>/dev/null
    echo "[lock] solto" >&2
  else
    echo "[lock] não é mais nosso (dono: $current); não apaguei" >&2
  fi
  PERF_LOCK_HELD=0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    status)
      if [ -d "$PERF_LOCK" ]; then echo "ocupado: $(perf_lock_owner || echo '?')"; else echo "livre"; fi ;;
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
