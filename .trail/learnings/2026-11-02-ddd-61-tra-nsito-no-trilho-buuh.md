---
title: "DDD 61 trânsito no trilho (modelo GTA III por RE clean-room) MERGEADO na main (ebd53a9,…"
author: Buuh
date: 2026-11-02
id: l-ed4814c6
scope: repo
status: active
touches:
  - node_modules/vitest/vitest.mjs
  - "tests/scene/VehicleDriver.test.ts#driver"
---

## Decided
Mergeado na main do DDD 61 em ebd53a9 (2026-10-27), branch apagada. ADR-0203 + SPEC-0204. Não fiz push.

O que é: civil anda "no trilho" (curva do GTA III por progresso, janela de esquina pela via cruzada), freio pelo fator
do GTA + lei de seguimento, regra dura de não andar pra dentro de caixa, troca de faixa com espelho, faixa×manobra com
a rota se adaptando à faixa, desempate mútuo, sumiço de preso fora da vista; motorista antigo só pra exceção (inclui
obstáculo fixo em 2 s). Módulos: utils/trafficTrack.ts, trackDriver.ts, trackPredict.ts. Relatórios do GTA III em
D:/tools/rea/relatorios-gta3/ (rea-engenharia-reversa-setup).

**Why:** usuário: trânsito "burro" (não faz esquina, dá passagem mal, atola); preferiu copiar a solução do GTA III.

## Watch out
ainda NÃO medido: fps (a previsão roda por carro, por quadro) e visual no jogo — validar antes de
mexer de novo. Backlog: spawn em anel (GTA). Gotchas: estado do trilho é por motorista (trocar `driver` recomeça);
"parado" só sem regra que o limite. Testes rodam com `"<nvm>/installs/v22.23.4/node.exe" node_modules/vitest/vitest.mjs
run` — o shim do yarn/node do nvm-windows falha na pasta do jogo (padrão `vnone`; `nvm use 22.23.4` FORA do app).

_From Claude Code's memory of this repo, last updated Oct 27._
