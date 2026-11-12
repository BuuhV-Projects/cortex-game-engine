[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / applyUnderwaterColor

# Function: applyUnderwaterColor()

> **applyUnderwaterColor**(`rgb`, `u`): \[`number`, `number`, `number`\]

Defined in: [src/core/underwater.ts:163](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L163)

Cor de tela (sRGB 0..1) depois da tinta e do escurecimento. Espelho do shader:
`mix(c, mix(c, cor, tint) · brightness, amount)`.

## Parameters

### rgb

readonly \[`number`, `number`, `number`\]

### u

[`ResolvedUnderwater`](../interfaces/ResolvedUnderwater.md)

## Returns

\[`number`, `number`, `number`\]
