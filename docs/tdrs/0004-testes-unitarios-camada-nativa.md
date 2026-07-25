# 0004 - Testes unitários na camada nativa

**Data:** 2026-07-25
**Status:** aceito

## Contexto

A camada nativa (`native/`) não tinha teste unitário nenhum no C++ — e os bugs
recentes do SPEC-0155 eram exatamente do tipo que teste de unidade pega barato:
a string `bc7-rgba-unorm-srgb` fora do mapa de `enums.cpp` derrubou o jogo com
panic do wgpu, e a matemática de blocos BC7 (16 B por bloco 4×4) estava
espalhada inline. Do lado JS, os shims/scripts já têm cobertura parcial em
`tests/native/` (Vitest: dom-lite, pak espelhado, encode-ktx2, export…), mas
faltavam justamente os shims mexidos na investigação de vazamento
(event-target, webaudio-lite, net).

Alternativas pro C++: gtest/catch2/doctest (dependência nova, pinada, com
integração CMake) vs **harness próprio minimalista** (um header de ~50 linhas
com `CHECK`/relato). O host segue a regra de deps pinadas e manutenção
AI-first — pra testar unidades PURAS, um framework completo não paga o custo.

## Decisão

- **C++**: alvo `cortex_host_tests` no CMake com harness próprio
  (`native/tests/harness.h` — macro `CHECK`, contagem e exit code). Compila
  SÓ unidades **puras** (sem device wgpu, sem NAPI env, sem Hermes):
  - `enums.cpp` — mapa formato↔string (regressão do crash BC7: toda string
    que o three emite tem que resolver);
  - `ktx2_math.h` — matemática de blocos BC7 **extraída** pra header puro
    (usada pelo transcoder e testável isolada);
  - `crash_handler.cpp` — `appendPerfLog`/`appendErrorLog` (arquivo real em
    diretório temporário).
  Rodar: `native/scripts/run-native-tests.ps1` (builda o alvo no dev shell do
  VS e executa) ou `cmake --build native/build --target cortex_host_tests &&
  native/build/cortex_host_tests.exe`.
- **JS (shims/scripts)**: continua no Vitest em `tests/native/` (mesma suíte
  do engine, roda no `yarn test`). Ampliado com event-target (add/remove/
  dispatch + `__listeners`), webaudio-lite (`free()` idempotente do
  AudioBuffer) e net (`__cortexClearObjectUrls`, revoke).
- **Fora de escopo consciente**: integração wgpu/NAPI/Hermes (device, present,
  GC) — coberta pelo soak de troca de fase (spec 0015 do teste4) e pelo smoke
  do export; unit-testar exigiria mockar o mundo e testaria o mock.
- Unidade nova no C++ que seja lógica pura → nasce em header/função testável e
  entra no `cortex_host_tests` (mesma regra do engine: feature com teste).

## Consequências

- Regressões de mapa/format/matemática são pegas em milissegundos, sem abrir o
  jogo. O harness zero-dependência mantém o build simples (nada novo pinado).
- O alvo de teste não linka wgpu/Hermes — compila em segundos e não trava com
  o jogo aberto.
- O grosso da confiança de runtime continua vindo do soak + export smoke —
  este TDR não substitui isso, só cobre o vão de unidade.
