# SPEC-0660 — O export recusa host ou DLL do Rapier mais velhos que os fontes

**Data:** 2026-11-02
**Status:** implementado

## Contexto

No export nativo do DDD 00 os carros estacionados sumiam (no Studio eles aparecem). Uma sonda no export
mostrou os `car-*`/`vila-*` caindo, com y de −200 a −470 e x/z perto de 0. A causa era a
`native/build/rapier_native.dll`, compilada em 24/10, ser mais velha que a SPEC-0655 (01/11), que
acrescentou o código 16 (`sleep`) ao `rn_body_set`. A DLL velha não conhecia o 16 e caía no braço
padrão do `match`, que era `set_translation`. Assim, todo carro que assentava e "dormia" era levado
para (0, 0, 0), debaixo da rua, e caía para sempre. O trânsito não sofria porque é cinemático e nunca
dorme. No navegador o Rapier é o WASM, que já sabe dormir.

Duas falhas deixaram isso passar calado:

1. O `export-game.mjs` copia `cortex_host.exe` e `rapier_native.dll` de `native/build` sem conferir
   se eles foram compilados depois da última mudança nos fontes.
2. No `rn_body_set`, um código desconhecido virava uma translação. Num contrato entre o shim JS e o
   Rust, um binário velho transformava uma chamada nova em teleporte, em vez de não fazer nada.

## Decisão

1. **`native/scripts/host-freshness.mjs`**: `staleHostBinaries(engineRoot, hostBuild)` devolve os
   binários do host mais velhos que o arquivo mais novo dos seus fontes:
   - `cortex_host.exe` ← `native/src/**` e `native/CMakeLists.txt`;
   - `rapier_native.dll` ← `native/rapier-native/src/**` e `native/rapier-native/Cargo.toml`.

   Fonte ausente não conta: o Studio instalado exporta sem os fontes do host, e lá não há o que
   conferir. É a mesma regra do `host_fresh` do `native/scripts/setup-worktree.sh`.
2. **`export-game.mjs`**: logo depois de confirmar que o host existe, se houver binário velho, o export
   falha com a lista de binários, a data de cada um, o fonte mais novo e o comando `yarn build:host`.
3. **`rn_body_set`**: a translação passa a ser o código explícito 0 (que o shim já usa), e o braço
   padrão não faz nada.

## Consequências

- Depois de um `git pull` que mexa em `native/src` ou em `native/rapier-native/src`, o export pede
  `yarn build:host` mesmo quando a mudança não afeta o binário, porque a data de checkout conta como
  mudança. É o mesmo critério do `setup-worktree.sh`, e é o preço de nunca empacotar binário velho.
- Um shim mais novo que a DLL agora resulta em chamada ignorada, não em corpo teleportado. A checagem
  do export continua sendo a defesa principal.
