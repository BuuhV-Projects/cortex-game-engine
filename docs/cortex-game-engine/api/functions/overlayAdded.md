[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayAdded

# Function: overlayAdded()

> **overlayAdded**(`overlay`): (\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \})[]

Defined in: [src/scene/SceneBuilder.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L67)

Lê `data.added` da overlay (nós adicionados no editor), validados.

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns
