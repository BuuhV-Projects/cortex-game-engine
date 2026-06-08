[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / attachResolveOrder

# Function: attachResolveOrder()

> **attachResolveOrder**(`items`, `exists`): `string`[]

Defined in: [src/scene/Kit.ts:160](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Kit.ts#L160)

Ordena ids de nós com `attach` por dependência (o **alvo é resolvido antes**),
via ordenação topológica. **Falha alto** (lança) em ciclo ou alvo ausente —
nunca silenciar numa pose chutada (ADR-0053). `exists` informa se um id de alvo
existe na cena (mesmo que não tenha `attach`).

## Parameters

### items

`object`[]

### exists

(`id`) => `boolean`

## Returns

`string`[]
