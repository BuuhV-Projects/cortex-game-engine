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
   binários do host que estão velhos:
   - `cortex_host.exe` ← `native/src/**`, `native/shaders/**` (o bloom é embutido) e
     `native/CMakeLists.txt`. Vale a data do exe **ou** do selo `host-build.stamp`, o que for mais
     novo. O selo cobre a compilação que reconfigura sem religar o exe (por exemplo, um comentário no
     `CMakeLists.txt`); sem ele o export travaria para sempre.
   - `rapier_native.dll` ← `native/rapier-native/src/**`, `native/rapier-native/patched/rapier3d/src/**` e o
     `Cargo.toml` dele (o Rapier com patch, ADR-0336; só o que o cargo compila, então README ou doc lá dentro não
     trava o export) e `native/rapier-native/Cargo.toml`. Vale a data
     da saída do cargo (`target/release/rapier_native.dll`), e a DLL de `native/build*` precisa ser
     **idêntica** a ela, porque o `copy_if_different` mantém a data antiga quando o conteúdo é igual.

   Fonte ausente não conta: o Studio instalado exporta sem os fontes do host, e lá não há o que
   conferir.
2. **`native/CMakeLists.txt`**: a cópia das DLLs saiu do `POST_BUILD` do `cortex_host` (que só roda
   quando o exe é religado, então uma DLL nova do Rapier podia não ser copiada) e foi para o alvo
   `host_runtime_files`, que roda em toda compilação e grava o selo. O `build-host.ps1` compila
   `cortex_host` e `host_runtime_files`.
3. **`export-game.mjs`**: logo depois de confirmar que o host existe, se houver binário velho, o export
   falha com a lista de binários e o comando que recompila **a pasta usada**: `yarn build:host` para
   `native/build`, e `cargo build` + `cmake --build native/build-steam|build-gdk` para Steam e GDK.
4. **`rn_body_set`**: a translação passa a ser o código explícito 0 (que o shim já usa), e o braço
   padrão não faz nada.

## Consequências

- Depois de um `git pull` que mexa em `native/src` ou em `native/rapier-native/src`, o export pede
  `yarn build:host` mesmo quando a mudança não afeta o binário, porque a data de checkout conta como
  mudança. É o mesmo critério do `setup-worktree.sh`, e é o preço de nunca empacotar binário velho.
- Um shim mais novo que a DLL agora resulta em chamada ignorada, não em corpo teleportado. A checagem
  do export continua sendo a defesa principal.
