# SPEC-0260 — `build:host` compila também o Rapier nativo

**Data:** 2026-09-24
**Status:** aceito
**Estende:** SPEC-0247

## Contexto

O host linka a `rapier_native.dll` de `native/rapier-native/target/release/`,
mas o `build:host` não a compilava — o `cargo build --release` era um passo
manual, anotado só num comentário do `CMakeLists.txt`.

Esquecer o passo não dá erro em lugar nenhum: o host compila e linka contra a
DLL velha. O defeito só aparece no export rodando. Foi o que aconteceu em
2026-09-24: o `world.timestep` (ADR-0257) entrou na main, o host foi
recompilado com a DLL de 19/09, e o export do kart-racer morreu no primeiro
frame com `undefined is not a function` dentro do `RapierPhysics.advance`.

## Decisão

O `build-host.ps1` roda `cargo build --release` no crate antes do CMake.

- Pré-requisito conferido no começo, como o clang-cl e o vswhere: sem `cargo`
  no PATH, falha dizendo o que instalar (rustup).
- Em DLL já atualizada o cargo não recompila nada — custa poucos segundos.
- Falha do cargo interrompe o script antes do CMake: nunca se linka um host
  contra a DLL anterior achando que é a nova.
- Se `rapier-native/target` for junction (worktree), o script **avisa**: o
  cargo vai escrever na pasta do outro repo, e a DLL dele passa a ser a desta
  worktree.

## Consequências

- `yarn build:host` basta para qualquer mudança em `native/` — C++ ou Rust.
- Máquina que só compila o host agora precisa do Rust instalado. Já precisava
  na prática (a DLL não vem do `fetch-deps`); agora isso é dito na hora.
