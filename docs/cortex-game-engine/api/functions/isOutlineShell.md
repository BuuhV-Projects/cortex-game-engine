[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / isOutlineShell

# Function: isOutlineShell()

> **isOutlineShell**(`material`): `boolean`

Defined in: [src/scene/OutlineCulling.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutlineCulling.ts#L46)

Esta malha é uma casca de contorno?

Pelo MATERIAL, e não pelo `userData` do objeto, porque a marca do objeto
**não sobrevive ao `mergeSubtree`** — ele cria uma malha nova. A do material
sobrevive: o merge reúsa o material do grupo e agrupa POR material, então
casca e corpo nunca caem no mesmo grupo.

## Parameters

### material

`Material`\<`MaterialEventMap`\> \| `Material`\<`MaterialEventMap`\>[] \| `null` \| `undefined`

## Returns

`boolean`
