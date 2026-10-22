#!/usr/bin/env bash
# Exports a game for measurement (SPEC-0382): engine from <engine> (a worktree),
# no --debug, under the measurement lock, with the save id isolated.
# Usage: export.sh <engineDir> <gameDir> <outDir> <tag>
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/lock.sh"

engine="${1:-}"; game="${2:-}"; out="${3:-}"; tag="${4:-}"
if [ -z "$tag" ]; then
  echo "uso: export.sh <engineDir> <gameDir> <outDir> <tag>  (save vira <id>-bench-<tag>)" >&2; exit 2
fi
out_win="$(cygpath -m "$out")"
# E:/ holds the user's own exports; Temp is blocked by App Control (exe dies with exit 9).
case "${out_win,,}" in
  e:/*) echo "recusado: E:/ é do export do usuário" >&2; exit 2 ;;
  */temp/*|*/tmp/*) echo "recusado: exe em Temp não roda (App Control)" >&2; exit 2 ;;
esac
[ -f "$engine/native/scripts/export-game.mjs" ] || { echo "engine sem native/scripts/export-game.mjs: $engine" >&2; exit 2; }
[ -f "$game/main.ts" ] || { echo "jogo sem main.ts: $game" >&2; exit 2; }

# An export saturates the CPU: it would spoil another session's round.
perf_lock_acquire "export $tag $(basename "$out")"
trap perf_lock_release EXIT

mkdir -p "$out"
log="$out.log"
echo "[export] $game -> $out (engine $engine), log em $log"
node "$engine/native/scripts/export-game.mjs" "$game" --out "$out" > "$log" 2>&1 \
  || { echo "[export] FALHOU; últimas linhas:" >&2; tail -5 "$log" >&2; exit 1; }

id="$(node -e "
const f = process.argv[1], fs = require('fs');
const c = JSON.parse(fs.readFileSync(f, 'utf8'));
if (!c.id.includes('-bench-')) c.id = c.id + '-bench-' + process.argv[2];
fs.writeFileSync(f, JSON.stringify(c, null, 2));
console.log(c.id);" "$out/cortex.json" "$tag")"

rev() { git -C "$1" rev-parse --short HEAD 2>/dev/null || echo '?'; }
dirty() { [ -n "$(git -C "$1" status --porcelain 2>/dev/null)" ] && echo '+sujo' || true; }
meta="engine=$(rev "$engine")$(dirty "$engine") ($engine) game=$(rev "$game")$(dirty "$game") ($game) id=$id date=$(date -Iseconds)"
echo "$meta" > "$out/bench-meta.txt"
echo "[export] ok: $out | $meta"
