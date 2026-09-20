[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / isSplashActive

# Function: isSplashActive()

> **isSplashActive**(): `boolean`

Defined in: [src/core/frameYield.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/frameYield.ts#L101)

A splash da engine (ADR-0109) ainda está na tela? Só é verdade no host
nativo — no browser não há splash. Enquanto ela está no ar o host DESCARTA o
frame do jogo (só ela apresenta), então desenhar qualquer coisa nesse período
é trabalho jogado fora.

## Returns

`boolean`
