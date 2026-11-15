---
title: "Chat IA tem modos por TAREFA (Modelagem=Astra, Codificar=Opus 5.5 médio desde ADR-0276,…"
author: Buuh
date: 2026-11-02
id: l-ce96d893
scope: repo
status: active
touches:
  - electron/agent/codex/codeGuard.ts
  - src/ai/modelGate.ts
  - electron/agent/performanceRules.ts
  - "electron/agent/agentTypes.ts#sdkModelOptions"
  - "native/rapier-native/patched/rapier3d/src/counters/timer.rs#resume"
  - "src/core/GameLoop.ts#GameLoop.resume"
  - "src/ai/modelGate.ts#judgeModel"
---

## Decided
Decisão do usuário em 2026-09-24 (ADR-0265, SPEC-0266/0267, mesclado 08087d80):
o usuário final escolhe a TAREFA, nunca o modelo. **Modelagem** roda o Astra
(Codex) e só mexe em dado — código é fotografado e restaurado depois de cada
rodada (`electron/agent/codex/codeGuard.ts`). **Codificar** roda Sonnet; Opus só
com o ajuste nas configurações do projeto (localStorage, NUNCA no cortex.json).
Todo .glb novo/alterado passa por `judgeModel` (`src/ai/modelGate.ts`: 4/8
materiais, escala em metros); reprovado volta ao Astra até 3x.

**Why:** usuário não deve saber que usa Astra; fronteira confiável entre dado e
código; o problema dos materiais (kart-racer) continuava chegando ao jogo.

## Watch out
regras de performance têm fonte ÚNICA em
`electron/agent/performanceRules.ts` — aprendizado novo de perf entra ali (as
duas cabeças leem). Opus é caro em COTA, não em dinheiro (ADR-0130). Nenhum
texto de UI pode citar modelo. Falta validação ao vivo (Studio + Codex real).

**Orquestrador (ADR-0269/SPEC-0270, 2026-09-24, branch claude/chat-orchestrator-mode-2f6239):**
terceiro modo e o PADRÃO. É o Claude com a tool `delegate_modeling` (roda um turno
do Modelagem por dentro; o onDone do Astra NÃO pode chegar ao renderer). Usuário
…

_From Claude Code's memory of this repo, last updated Sep 25._
