# ADR-0336 — Rapier nativo com patch vendorizado no broad-phase e nos cinemáticos parados

**Data:** 2026-10-09
**Status:** aceito (medição na SPEC-0337)

## Contexto

Frente R3-F3 do ciclo "75 fps no export nativo do DDD 61". O R2b mediu o passo
do Rapier em 1,1–1,4 ms/quadro (~2,1 passos/quadro) num mundo de 1.477 corpos:
7 dinâmicos, 220 cinemáticos, ~1.250 fixos. A suspeita era que os cinemáticos
"não dormiam" por culpa do shim.

A investigação (SPEC-0337) mostrou outra coisa:

1. A sonda contava sono com `isSleeping?.()`, método que o shim não tinha —
   todo corpo saía "acordado". Erro do instrumento.
2. No Rapier (0.19 do browser e 0.22 do host) o cinemático **nunca** sai do
   conjunto ativo. A cada passo, mesmo parado, os colliders dele são marcados
   como modificados e vão pro broad-phase, narrow-phase e query pipeline.
3. O maior custo é outro: o broad-phase multi-SAP do Rapier 0.22 marca **todas**
   as sub-regiões como sujas a cada passo, mesmo as de regiões que não tiveram
   trabalho. Toda camada menor reordena todos os endpoints todo passo: custo
   O(colliders fixos) com o mundo parado. O fonte do Rapier tem uma NOTE
   dizendo que isso "poderia ser melhorado".

Bench (cidade sintética, 1.250 fixos + 220 cinemáticos parados + 7 dinâmicos):
~0,7–1,2 ms/passo sem patch, ~0,06–0,09 ms/passo com patch.

## Decisão

Vendorizar o `rapier3d` 0.22.0 publicado em `native/rapier-native/patched/rapier3d`,
apontado pelo `[patch.crates-io]` do `Cargo.toml`, com duas correções de
desempenho que não mudam o resultado:

- `sap_layer.rs::update_regions` — só marca as sub-regiões como sujas se a
  região tinha trabalho (`update_count > 0` ou `to_insert` não vazio).
- `physics_pipeline.rs::advance_to_final_positions` — pula o cinemático cuja
  pose final é igual à atual (não há collider a reposicionar).

As linhas mexidas levam o comentário `CortexNative (SPEC-0337)`; o diff contra
o crate publicado é só isso (`diff -r` com o registry do cargo).

### Alternativas consideradas

- **Atualizar o Rapier** para uma versão com outro broad-phase. Muda a API do
  `lib.rs`, o comportamento da simulação e afasta o host do 0.19 do browser —
  um projeto à parte, não uma frente de desempenho.
- **Broad-phase próprio** (o trait `BroadPhase` é público). Código novo e
  sensível (eventos de par) para reproduzir o que duas linhas corrigem.
- **Engine converte cinemático parado em fixo** (`setBodyType`). Resolve só o
  item 2, exige API nova no shim e no nativo, e o broad-phase seguiria O(fixos).
- **Jogo desliga carros guardados** (`setEnabled(false)`). Resolve só os
  guardados, tira a colisão, e é por jogo. Com o patch, cinemático parado custa
  o mesmo que fixo e quase o mesmo que desligado: deixou de ser necessário.

## Consequências

- O passo do host deixa de crescer com o número de corpos parados — fixos e
  cinemáticos parados ficam quase de graça.
- O Studio (Rapier WASM 0.19) **não** recebe o ganho; o resultado da simulação
  é o mesmo nos dois (o rastro de 1.500 passos sai bit a bit idêntico ao do
  Rapier sem patch).
- Atualizar o `rapier3d` passa a exigir reaplicar (ou confirmar que o upstream
  já corrigiu) as duas mudanças. O teste `bench_idle_city` (ignorado no
  `cargo test`) é o instrumento para conferir.
- +1,7 MB de fonte Rust no repo.
