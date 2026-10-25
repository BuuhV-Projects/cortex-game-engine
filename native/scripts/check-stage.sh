#!/usr/bin/env bash
# Full check of one native-renderer sub-stage (SPEC-0525, acceptance rule of PRD-0466): fresh host,
# export, same-run parity (material gallery + DDD 61 points, day and night) and a short smoke
# round. Prints ONE verdict line (and the logs folder on FAIL). Exit 0 all PASS, 1 any FAIL, 2 usage.
# Usage: check-stage.sh <worktree> <tag> [--flag '&nativeRenderer=1'] [--points 'setorO comercial']
#                       [--smoke-point comercial] [--game <gameDir>]
#   --points ''       skips the in-game parity;  --smoke-point ''  skips the smoke round.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGES_ROOT=D:/jogos/detetive-brasilia/.cortex/stages
DEFAULT_GAME=D:/jogos/detetive-brasilia-rs-f10877e   # DDD 61 at f10877e (target since 2026-10-25: Frente D, crowd + paints on the native renderer, SPEC-0194 of the game)
DEFAULT_POINTS="setorO comercial"
DEFAULT_SMOKE_POINT=comercial
NIGHT_EXTRA='&hora=21'
PARITY_FRAMES=6          # 3 difference pairs, 4 control pairs
GAME_FREEZE_S=15         # ?parityFreeze=<s>: seconds of play before freezing
GAME_SKIP_FRAMES=1500    # past loading + freeze (same as the RenderingServer's parity.sh)
GAME_PARITY_SECS=150
GALLERY_FREEZE_S=1
GALLERY_SKIP_FRAMES=240
GALLERY_SECS=60
FREEZE_MARK='\[parityFreeze\] congelado'

wt="${1:-}"; tag="${2:-}"
[ -n "$wt" ] && [ -n "$tag" ] && [ -d "$wt/native" ] || { sed -n 4,7p "$0" | sed 's/^# //' >&2; exit 2; }
shift 2
flag=""; points="$DEFAULT_POINTS"; smoke="$DEFAULT_SMOKE_POINT"; game="$DEFAULT_GAME"
while [ $# -gt 0 ]; do
  case "$1" in
    --flag) flag="$2"; shift 2 ;;
    --points) points="$2"; shift 2 ;;
    --smoke-point) smoke="$2"; shift 2 ;;
    --game) game="$2"; shift 2 ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
done
wt="$(cd "$wt" && pwd)"
K="$wt/native/scripts/perf"
D="$STAGES_ROOT/$tag"
mkdir -p "$D"
items=(); failed=0
add() { items+=("$1"); case "$1" in *FAIL*) failed=1 ;; esac; }
finish() {
  printf -v line ' | %s' "${items[@]}"
  echo "check-stage $tag:${line:2}"
  [ "$failed" = 0 ] || echo "  logs: $D"
  exit "$failed"
}

# 1. host built from this worktree and newer than its sources
if "$here/setup-worktree.sh" "$wt" > "$D/setup.log" 2>&1; then add "host OK"; else add "host FAIL"; finish; fi

# 2. exports (fresh every check: the tag names one engine state)
rm -rf "$D/export" "$D/gallery-export"
need_game=1; [ -z "${points// /}" ] && [ -z "$smoke" ] && need_game=0
if { [ "$need_game" = 0 ] || "$K/export.sh" "$wt" "$game" "$D/export" "$tag" > "$D/export.out" 2>&1; } \
   && "$K/export.sh" "$wt" "$wt/native/fixtures/material-gallery" "$D/gallery-export" "$tag-g" >> "$D/export.out" 2>&1; then
  add "export OK"
else add "export FAIL"; finish; fi

# capture <name> <exportDir> <skipFrames> <secs> <round args...>: same-run parity of one round.
capture() {
  local name="$1" exp="$2" skip="$3" secs="$4"; shift 4
  local out="$D/$name"
  rm -rf "$out"; mkdir -p "$out/frames"
  CORTEX_RENDER_PARITY_CAPTURE="$(cygpath -m "$out/frames")" CORTEX_RENDER_PARITY_CAPTURE_FRAMES=$PARITY_FRAMES \
  CORTEX_RENDER_PARITY_CAPTURE_SKIP="$skip" \
    "$K/round.sh" --exp "$exp" --out "$out/round" --secs "$secs" --owner "stage-$tag" "$@" > "$out/round.out" 2>&1 || true
  if ! grep -q "$FREEZE_MARK" "$out/round/run.log" 2>/dev/null; then add "$name FAIL (não congelou)"; return; fi
  if [ -s "$out/round/error_log.txt" ]; then add "$name FAIL (error_log)"; return; fi
  add "$name $(node "$K/parity-verdict.mjs" "$out/frames")"
}

# 3. gallery (known scene, nothing moves)
capture galeria "$D/gallery-export" "$GALLERY_SKIP_FRAMES" "$GALLERY_SECS" \
  --query "?cortexDebug=perf&parityFreeze=$GALLERY_FREEZE_S$flag"

# 4. in-game parity, day and night
for p in $points; do
  capture "$p-dia" "$D/export" "$GAME_SKIP_FRAMES" "$GAME_PARITY_SECS" --spawn "$p" --extra "&parityFreeze=$GAME_FREEZE_S$flag"
  capture "$p-noite" "$D/export" "$GAME_SKIP_FRAMES" "$GAME_PARITY_SECS" --spawn "$p" --extra "&parityFreeze=$GAME_FREEZE_S$NIGHT_EXTRA$flag"
done

# 5. smoke: 1 point, 1 round, walking, 1080p (kit default)
if [ -n "$smoke" ]; then
  s="$D/fumaca"; rm -rf "$s"
  summary="$("$K/round.sh" --exp "$D/export" --out "$s" --spawn "$smoke" --extra "$flag" --autopilot walk --owner "stage-$tag" 2>&1 | tail -1)"
  if "$K/validate.sh" "$s" > /dev/null 2>&1 && [ ! -s "$s/error_log.txt" ]; then
    nums="$(echo "$summary" | grep -oE 'frameMs [0-9./]+|>33ms [0-9.]+%|render [0-9.]+' | tr '\n' ' ')"
    add "fumaça PASS ${nums% }"
  else
    add "fumaça FAIL"
  fi
fi
finish
