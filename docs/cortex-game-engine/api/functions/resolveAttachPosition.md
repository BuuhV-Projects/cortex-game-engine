[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / resolveAttachPosition

# Function: resolveAttachPosition()

> **resolveAttachPosition**(`targetPos`, `targetAnchor`, `thisAnchor`, `offset?`): [`Vec3`](../type-aliases/Vec3.md)

Defined in: [src/scene/Kit.ts:140](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Kit.ts#L140)

Posição pra o `socket` deste nó coincidir com a âncora `toSocket` do alvo já
posicionado: `alvo + ancoraAlvo − ancoraEste (+ offset)`. Translação pura — é o
análogo do `place` (grounding em Y) para o plano X/Z. Rotação/`dir` ficam pra
uma fase posterior (ADR-0053).

## Parameters

### targetPos

[`Vec3`](../type-aliases/Vec3.md)

### targetAnchor

[`Vec3`](../type-aliases/Vec3.md)

### thisAnchor

[`Vec3`](../type-aliases/Vec3.md)

### offset?

[`Vec3`](../type-aliases/Vec3.md)

## Returns

[`Vec3`](../type-aliases/Vec3.md)
