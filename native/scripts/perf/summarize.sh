#!/usr/bin/env bash
# One line per round (SPEC-0382): frameMs med/p95/p99, host js, render/world (cpuAvg + cpuP99), draws, alerts.
# Usage: summarize.sh <runDir...>
exec node "$(dirname "${BASH_SOURCE[0]}")/trace-stats.mjs" summary "$@"
