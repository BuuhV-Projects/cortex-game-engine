#!/usr/bin/env bash
# Prepares a worktree for native/ work (SPEC-0525): deps, the one safe junction, and a host built
# from THIS worktree's sources. Idempotent; prints one status line. Exit 0 ok, 1 failure, 2 usage.
# Usage: setup-worktree.sh <worktree>
#   host-fresh only:  setup-worktree.sh <worktree> --check-host   (exit 0 fresh, 1 stale/missing)
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wt="${1:-}"; mode="${2:-}"
[ -n "$wt" ] && [ -d "$wt/native" ] || { echo "uso: setup-worktree.sh <worktree> [--check-host]" >&2; exit 2; }
wt="$(cd "$wt" && pwd)"
HOST="$wt/native/build/cortex_host.exe"
# Sources whose change requires a host rebuild (the JS shims go into boot.hbc at export time).
HOST_SOURCES=("$wt/native/src" "$wt/native/rapier-native/src" "$wt/native/CMakeLists.txt")

host_fresh() {
  [ -f "$HOST" ] || return 1
  [ -z "$(find "${HOST_SOURCES[@]}" -newer "$HOST" -type f -print -quit 2>/dev/null)" ]
}

if [ "$mode" = "--check-host" ]; then host_fresh; exit $?; fi

main_repo="$(cd "$wt" && cd "$(git rev-parse --git-common-dir)/.." && pwd)"
status=()

# native/build as a junction compiles the OTHER checkout's sources (memory: build in worktree).
if [ -L "$wt/native/build" ]; then
  echo "setup-worktree $wt: FAIL native/build é junção (compila os fontes de outro checkout); remova com: cmd //c rmdir native\\build" >&2
  exit 1
fi

if [ -d "$wt/node_modules/three" ]; then status+=("deps OK"); else
  (cd "$wt" && yarn install --ignore-scripts --frozen-lockfile >"$wt/.setup-yarn.log" 2>&1) \
    && status+=("deps INSTALADAS") || { echo "setup-worktree $wt: FAIL yarn install (ver $wt/.setup-yarn.log)"; exit 1; }
fi

if [ -e "$wt/native/third_party" ]; then status+=("third_party OK"); elif [ "$wt" = "$main_repo" ]; then
  echo "setup-worktree $wt: FAIL native/third_party ausente no checkout principal (rode native/scripts/fetch-deps.ps1)"; exit 1
else
  cmd //c "mklink /J \"$(cygpath -w "$wt/native/third_party")\" \"$(cygpath -w "$main_repo/native/third_party")\"" >/dev/null \
    && status+=("third_party JUNÇÃO") || { echo "setup-worktree $wt: FAIL junção de native/third_party"; exit 1; }
fi

if host_fresh; then status+=("host OK ($(date -r "$HOST" +%H:%M))"); else
  log="$wt/.setup-build-host.log"
  "$here/perf/lock.sh" run "setup-$(basename "$wt")" -- bash -c "cd '$wt' && yarn build:host" >"$log" 2>&1 \
    && host_fresh && status+=("host COMPILADO ($(date -r "$HOST" +%H:%M))") \
    || { echo "setup-worktree $wt: FAIL build do host (ver $log)"; exit 1; }
fi

printf -v line ' | %s' "${status[@]}"; echo "setup-worktree $wt: ${line:3}"
