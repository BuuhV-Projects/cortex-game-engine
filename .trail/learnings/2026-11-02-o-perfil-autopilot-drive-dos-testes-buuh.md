---
title: "O perfil `--autopilot drive` dos testes quase não dirige (mediana 1,7 m/s, 4% das…"
author: Buuh
date: 2026-11-02
id: l-911e6e47
scope: repo
status: active
touches:
  - "src/render/RenderIdRefresh.ts#RenderIdRefresh"
  - "src/systems/ThirdPersonControlSystem.ts#ThirdPersonControlSystem.drive"
---

## Decided
Em 25/10/2026 o usuário testou o export (C:\Users\buuhb\Documents\builded-ddd-61, engine pós-R1.6) e travou muito depois de pegar o carro (missão de motorista de app), e seguiu travando depois. O trace (perf-trace.jsonl, 115 s) mostrou: a pé (3 m/s) 21,8 ms/quadro e 0 picos; em velocidade (~15 m/s) 40,7 ms e 20/69 amostras com quadros de 100 ms e 13–40 mil `writeBuffer` de uma vez (napiWb; o normal é ~100); alocação 0,86 → 1,67 → 2,17 MB/quadro.

**Why:** o `drive` do kit (SPEC-0414) usado em todos os A/B (helio) tem velocidade mediana 1,7 m/s e só 4% das amostras acima de 9 m/s — nunca testou direção real, então o aceite do R1 não cobriu esse caso. Ligado ao backlog "perfil drive sem desvio" do PRD-0009.

## Watch out
todo A/B de perf com carro precisa de um autopiloto que DIRIJA de verdade (≥ 40% das amostras > 9 m/s, rota com cruzamentos); validar o instrumento com esse número antes de confiar. Hipótese aberta (não provada): objetos entrando na vista em velocidade disparam refresh completo no `RenderIdRefresh` (correção `ecaf612f`), ou algo do jogo (missão de app); teste = `?renderIdRefresh=0` contra o padrão com direção rápida. Ver perf-com-jogador-em-movimento e validar-instrumento-antes-de-concluir.

_From Claude Code's memory of this repo, last updated Oct 25._
