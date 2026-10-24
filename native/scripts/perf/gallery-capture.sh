#!/usr/bin/env bash
# Captures the material gallery (SPEC-0505) under the measurement lock: one round whose host
# writes CAPTURE_FRAMES raw frames after CAPTURE_SKIP warm-up frames, then quits by itself.
# Usage: gallery-capture.sh <exportDir> <outDir> [query]     (query default: '?')
# Compare two captures with: node native/scripts/render-parity.mjs <outA>/frames <outB>/frames --delta 2
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exp="${1:-}"; out="${2:-}"; query="${3:-?}"
[ -n "$exp" ] && [ -n "$out" ] || { echo "uso: gallery-capture.sh <exportDir> <outDir> [query]" >&2; exit 2; }

CAPTURE_SKIP=240
CAPTURE_FRAMES=3
ROUND_SECS=90

mkdir -p "$out/frames"
export CORTEX_RENDER_PARITY_CAPTURE="$(cygpath -m "$out/frames")"
export CORTEX_RENDER_PARITY_CAPTURE_SKIP=$CAPTURE_SKIP CORTEX_RENDER_PARITY_CAPTURE_FRAMES=$CAPTURE_FRAMES
"$here/round.sh" --exp "$exp" --out "$out/round" --query "$query" --secs "$ROUND_SECS" --owner renderer-gallery || true
n="$(ls "$out/frames" 2>/dev/null | wc -l)"
echo "[gallery] $out: $n quadros"
[ "$n" -ge "$CAPTURE_FRAMES" ]
