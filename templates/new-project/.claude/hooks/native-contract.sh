#!/usr/bin/env sh
# Lança o native-contract.mjs com o primeiro node que funcionar ($CORTEX_NODE, o do PATH ou um do nvm).
here=$(dirname "$0")
for n in "$CORTEX_NODE" node "$LOCALAPPDATA/Author Software/nvm/installs"/*/node.exe; do
  [ -n "$n" ] && "$n" -v >/dev/null 2>&1 && exec "$n" "$here/native-contract.mjs" "$@"
done
echo "native-contract: node não encontrado (defina CORTEX_NODE)" >&2
exit 0
