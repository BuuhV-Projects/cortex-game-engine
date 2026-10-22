#!/usr/bin/env bash
# Verdict VÁLIDO/INVÁLIDO per round folder (SPEC-0382); exit 1 if any is invalid.
# Usage: validate.sh <runDir...>
exec node "$(dirname "${BASH_SOURCE[0]}")/trace-stats.mjs" validate "$@"
