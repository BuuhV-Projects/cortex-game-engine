[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SteamPlayer

# Interface: SteamPlayer

Defined in: src/core/steamworks.ts:39

Jogador logado na Steam.

## Properties

### id

> **id**: `string`

Defined in: src/core/steamworks.ts:46

SteamID64 **como texto**: 64 bits não cabem no `number` do JS sem perda de
precisão, então nunca converta com `Number()`.

***

### name

> **name**: `string`

Defined in: src/core/steamworks.ts:41

Nome de exibição (persona) — o mesmo que aparece pros amigos.
