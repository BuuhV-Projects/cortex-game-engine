[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / buildScene

# Function: buildScene()

> **buildScene**(`scene`, `defs`, `options?`): `Promise`\<[`SceneHandle`](../interfaces/SceneHandle.md)\>

Defined in: [src/scene/SceneBuilder.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L83)

Constrói a cena. `defs` pode ser uma definição ou um array (multi-arquivo —
os `nodes` são concatenados; configs de cena como `background`/`fog`/
`outdoorLighting`: o último definido vence).

## Parameters

### scene

[`Scene`](../classes/Scene.md)

### defs

\{ `background?`: `string` \| `number`; `fog?`: \{ `color`: `string` \| `number`; `far`: `number`; `near`: `number`; \}; `nodes`: (\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \})[]; `outdoorLighting?`: \{ `exposure?`: `number`; `sky?`: `string` \| `number`; `sunColor?`: `string` \| `number`; `sunIntensity?`: `number`; \}; `version`: `1`; \} \| `object`[]

#### Type Literal

\{ `background?`: `string` \| `number`; `fog?`: \{ `color`: `string` \| `number`; `far`: `number`; `near`: `number`; \}; `nodes`: (\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \})[]; `outdoorLighting?`: \{ `exposure?`: `number`; `sky?`: `string` \| `number`; `sunColor?`: `string` \| `number`; `sunIntensity?`: `number`; \}; `version`: `1`; \}

##### background?

`string` \| `number` = `...`

Cor de fundo do céu (hex). Em multi-arquivo, o último definido vence.

##### fog?

\{ `color`: `string` \| `number`; `far`: `number`; `near`: `number`; \} = `...`

Névoa (cor/near/far).

##### fog.color

`string` \| `number` = `colorSchema`

##### fog.far

`number` = `...`

##### fog.near

`number` = `...`

##### nodes

(\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \})[] = `...`

##### outdoorLighting?

\{ `exposure?`: `number`; `sky?`: `string` \| `number`; `sunColor?`: `string` \| `number`; `sunIntensity?`: `number`; \} = `...`

Atalho pro preset de iluminação exterior (sol+sombras+tone mapping).

##### outdoorLighting.exposure?

`number` = `...`

##### outdoorLighting.sky?

`string` \| `number` = `...`

##### outdoorLighting.sunColor?

`string` \| `number` = `...`

##### outdoorLighting.sunIntensity?

`number` = `...`

##### version

`1` = `...`

***

`object`[]

### options?

[`BuildSceneOptions`](../interfaces/BuildSceneOptions.md) = `{}`

## Returns

`Promise`\<[`SceneHandle`](../interfaces/SceneHandle.md)\>
