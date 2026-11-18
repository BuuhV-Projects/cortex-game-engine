---
title: CI do host nativo quebra quando windows-latest bumpa pra um MSVC cuja STL exige clang mais novo que o do runner; pina-se o runner numa imagem consistente
author: Buuh
date: 2026-11-18
branch: ci/pin-msvc-windows-2025
cost: { minutes: 1, tokens: 1594 }
id: l-b1bbe8fc
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/pr.yml"
  - ".github/workflows/build-ide.yml"
  - ".github/workflows/release.yml"
  - ".github/actions/build-native-host/action.yml"
  - docs/tdrs/0015-runner-nativo-pinado-em-windows-2025.md
---

## Decided
O CI do host nativo (cortex_host/cortex_host_tests) passa a rodar em runner PINADO numa imagem com MSVC e clang compativeis, em vez de windows-latest. Motivo: windows-latest e volatil — basta o GitHub bumpar a imagem pra quebrar o build sem nenhum commit nosso. A STL do MSVC tem um static_assert que recusa um clang mais velho que seu minimo; compilamos com clang-cl (frontend) usando a STL do MSVC (vcvars), que sao de fornecedores diferentes e versionam separado.

Sintoma exato: yvals_core.h error STL1000 "Unexpected compiler version, expected Clang 22 or newer" em QUALQUER arquivo que inclua header da STL. Nao e erro de codigo; derruba todo PR que compila o host.

## Tried and ruled out
- Subir o clang do runner pra 22+: alinharia ao MSVC novo, mas deixa a toolchain seguindo windows-latest (muda sem aviso) — o mesmo quebraria no proximo bump.
- Bypass com _ALLOW_COMPILER_AND_STL_VERSION_MISMATCH: silencia o assert, mas a STL nova pode usar builtins que o clang antigo nao tem -> falhas obscuras.

## Watch out
- Diagnostico rapido: a mensagem STL1000 diz o clang MINIMO que a STL exige; o clang REAL aparece no path do include (LLVM\lib\clang\<N>). Se minimo > real, e exatamente este caso.
- Sao TRES jobs que compilam o host (nao esquecer nenhum): precisam do mesmo pin, inclusive os `if` de matriz por OS.

## In the code:
- Toolset fixado no vcvars da composite build-native-host (step ilammy/msvc-dev-cmd, input toolset).
- Imagem escolhida: windows-2025 (VS 17.14 / MSVC 14.44 / clang 20.1.8). Registro: TDR-0015.
