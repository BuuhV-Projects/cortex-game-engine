---
title: Os modos por tarefa do Chat IA (Modelagem, Codificar, Orquestrador) saíram junto com o chat
author: Buuh
date: 2026-11-15
branch: feat/cortex-mcp
id: l-b3b7904a
scope: repo
status: active
replaces: l-ce96d893
src: agent
touches:
  - docs/adrs/ADR-0736-mcp-do-cortex-no-lugar-do-chat-ia.md
  - mcp/server.ts
---

## Decided
Com o Chat IA fora do Studio (ADR-0736), os modos por tarefa deixaram de existir: não há mais Modelagem (Astra/Codex), Codificar nem Orquestrador (`delegate_modeling`), nem a escolha de modelo nas configurações do projeto. Quem escolhe o modelo agora é o próprio Claude Code do dev. As ferramentas próprias do Studio estão no MCP `cortex`.

## Watch out
- Sumiram junto o `codeGuard` (fotografava e restaurava o código depois da rodada da Modelagem), o `judgeModel` do `modelGate` (barrava `.glb` com material ou escala fora) e a fonte única das regras de performance em `performanceRules.ts`. Nada disso tem trava automática hoje (as ferramentas de `mcp/tools/assets.ts` medem os modelos, mas não reprovam): quem quiser essa trava de novo precisa trazê-la para o MCP ou para uma skill.
- O learning anterior (l-ce96d893) segue no repo só como registro; não use os caminhos dele, que não existem mais.

In the code: `mcp/server.ts` (as ferramentas do MCP), `docs/adrs/ADR-0736-mcp-do-cortex-no-lugar-do-chat-ia.md`.
