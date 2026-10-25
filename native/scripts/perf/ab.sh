#!/usr/bin/env bash
# Interleaved A/B (SPEC-0382): per replica and point runs A,B (odd replica) or
# B,A (even), each round under the lock, then prints one short table per point.
# With --c (optional third arm) the order rotates per replica: A,B,C / B,C,A / C,A,B.
# Usage: ab.sh --a <exportA> [--b <exportB>] [--c <exportC>] --out <runsRoot> --points "setorO centro"
#              [--extra-a '&k=0'] [--extra-b '&k=1'] [--extra-c '&k=2'] [--reps 2] [--secs 135] [--owner name]
#              [--autopilot <profile>]   (both arms, SPEC-0414)
#              [--window <WxH>]          (both arms, SPEC-0455)
# Same export with different extras = A/B of two queries.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

readonly DEFAULT_REPS=2
readonly DEFAULT_SECS=135
# Gap between rounds so another session can grab the lock.
readonly COURTESY_S=10

a=""; b=""; c=""; three=0; out=""; points=""; extra_a=""; extra_b=""; extra_c=""; reps=$DEFAULT_REPS; secs=$DEFAULT_SECS; owner="ab"; autopilot=(); window=()
while [ $# -gt 0 ]; do
  case "$1" in
    --a) a="$2"; shift 2 ;;
    --b) b="$2"; shift 2 ;;
    --c) c="$2"; three=1; shift 2 ;;
    --extra-c) extra_c="$2"; three=1; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --points) points="$2"; shift 2 ;;
    --extra-a) extra_a="$2"; shift 2 ;;
    --extra-b) extra_b="$2"; shift 2 ;;
    --reps) reps="$2"; shift 2 ;;
    --secs) secs="$2"; shift 2 ;;
    --owner) owner="$2"; shift 2 ;;
    --autopilot) autopilot=(--autopilot "$2"); shift 2 ;;
    --window) window=(--window "$2"); shift 2 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done
b="${b:-$a}"
c="${c:-$a}"
if [ -z "$a" ] || [ -z "$out" ] || [ -z "$points" ]; then
  echo "uso: ab.sh --a <exportA> [--b <exportB>] --out <pastaDasRodadas> --points \"p1 p2\" [--extra-a ..] [--extra-b ..] [--reps N] [--secs N] [--autopilot perfil] [--window WxH]" >&2
  exit 2
fi
if [ "$a" = "$b" ] && [ "$extra_a" = "$extra_b" ]; then
  echo "recusado: A e B idênticos (mesmo export e mesmo extra)" >&2; exit 2
fi
if [ "$three" = 1 ] && { { [ "$c" = "$a" ] && [ "$extra_c" = "$extra_a" ]; } || { [ "$c" = "$b" ] && [ "$extra_c" = "$extra_b" ]; }; }; then
  echo "recusado: C idêntico a A ou B (mesmo export e mesmo extra)" >&2; exit 2
fi
mkdir -p "$out"

run_arm() { # <arm> <point> <rep>
  local exp extra
  case "$1" in
    A) exp="$a"; extra="$extra_a" ;;
    B) exp="$b"; extra="$extra_b" ;;
    C) exp="$c"; extra="$extra_c" ;;
  esac
  "$here/round.sh" --exp "$exp" --out "$out/$2-$1-r$3" --spawn "$2" --extra "$extra" --secs "$secs" --owner "$owner" "${autopilot[@]}" "${window[@]}" || true
  sleep "$COURTESY_S"
}

for rep in $(seq 1 "$reps"); do
  for point in $points; do
    if [ "$three" = 1 ]; then
      case $(((rep - 1) % 3)) in
        0) order="A B C" ;; 1) order="B C A" ;; *) order="C A B" ;;
      esac
      for arm in $order; do run_arm "$arm" "$point" "$rep"; done
    elif [ $((rep % 2)) = 1 ]; then run_arm A "$point" "$rep"; run_arm B "$point" "$rep"
    else run_arm B "$point" "$rep"; run_arm A "$point" "$rep"; fi
  done
done
arms="A=$a $extra_a | B=$b $extra_b"
[ "$three" = 1 ] && arms="$arms | C=$c $extra_c"
echo "$arms ${autopilot[*]} ${window[*]}"
node "$here/trace-stats.mjs" ab "$out"
