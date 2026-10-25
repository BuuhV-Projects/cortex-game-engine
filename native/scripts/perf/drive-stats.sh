#!/usr/bin/env bash
# Drive profile (SPEC-0595): one line per round — median camera speed, % of intervals above 9 m/s,
# path after the warm-up, and the kit verdict. Usage: drive-stats.sh <roundDir>...
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/trace-stats.mjs" drive "$@"
