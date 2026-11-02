---
title: GOTCHA
author: Buuh
date: 2026-11-02
id: l-981d1224
scope: repo
status: active
touches:
  - "electron/agent/playtest/runAndCapture.ts#runAndCaptureGame.waitBoot.probe"
  - "src/core/Game.ts#Game.isLoading"
---

## Decided
O `playtest_game` bootava com `?play=1` (direto em jogo). O usuário testa no Studio
editor → ▶ Play, e é nessa transição que jogos reconstroem estado (o `CarSystem` do
kart-racer/crash APAGA os corpos fixos e refaz a colisão só por `cortexSolid`). O Chat
IA viu o kart "perfeito" no playtest enquanto no Studio ele caía, gravou memórias
erradas no jogo e passou 1h40 oscilando. Corrigido em 2026-09-25 (SPEC-0277): padrão
`start:'editor'` aperta Play via `window.__cortexPlaytest.play()` (recusa enquanto
`game.isLoading` / antes do 1º quadro do editor), ação `probe` devolve números.

**Why:** screenshot não mostra física; teste em caminho diferente do usuário dá falso
positivo. Clique às cegas no botão durante a carga (vendor antigo) deixa o editor
dessincronizado — por isso o fallback é `?play=1` com aviso.

## Watch out
jogo com engine vendorizado antigo precisa re-vendorizar pra ganhar o
gancho. Bug de física: fazer a conta no código antes de rodar (foi assim que o kart foi
resolvido: altura-alvo do followGround 12,89 vs 12,0). Ver chat-ia-modos-por-tarefa,
validar-instrumento-antes-de-concluir.

_From Claude Code's memory of this repo, last updated Sep 25._
