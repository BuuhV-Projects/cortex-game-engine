[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / isSplashActive

# Function: isSplashActive()

> **isSplashActive**(): `boolean`

Defined in: .claude/worktrees/boot-cooperativo/src/core/frameYield.ts:101

A splash da engine (ADR-0109) ainda está na tela? Só é verdade no host
nativo — no browser não há splash. Enquanto ela está no ar o host DESCARTA o
frame do jogo (só ela apresenta), então desenhar qualquer coisa nesse período
é trabalho jogado fora.

## Returns

`boolean`
